import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';

// All paths are relative to THIS test file
const SVC_PATH = '../../../../../../src/core/consensus/services/EpochProofProposalService.js';
const CREATE_VDF_PATH = '../../../../../../src/core/consensus/services/createVDFService.js';
const OPERATIONS_PATH = '../../../../../../src/core/consensus/services/EpochProofProposalOperations.js';
const LOGGER_PATH = '../../../../../../src/utils/logger.js';

const EPOCH_PROPOSAL_SUBMITTED = 'msb:epoch_proposal_submitted';
const EPOCH_CREATED = 'msb:epoch_created';

const CONFIG = Object.freeze({
    epochInterval: 1000,
    epochSignatureTimeout: 5000,
    epochAppendTimeout: 5000,
    epochThreshold: 1,
    networkId: 1,
    addressPrefix: 'trac',
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 2048,
    logLevel: 'silent',
});

function makeState(overrides = {}) {
    const listeners = new Map();
    return {
        on: sinon.stub().callsFake((event, fn) => {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(fn);
        }),
        removeListener: sinon.stub().callsFake((event, fn) => {
            const arr = listeners.get(event) ?? [];
            listeners.set(event, arr.filter(f => f !== fn));
        }),
        emit: async (event, ...args) => {
            for (const fn of [...(listeners.get(event) ?? [])]) await fn(...args);
        },
        getCurrentEpoch: sinon.stub().resolves(5n),
        getEpoch: sinon.stub().resolves(b4a.alloc(32, 0xaa)),
        getSignedVDFParams: sinon.stub().resolves({ vdfDifficulty: 100, vdfDiscriminantSize: 2048 }),
        ...overrides,
    };
}

const makeConfirmation = () => ({ signature: b4a.alloc(64, 0xbb), approver: b4a.alloc(21, 0x01) });

// Lets a pending promise chain (collectSignature().then(...) etc) settle via a real timer tick.
// Only valid when fake timers are NOT installed - see the "timeouts" section for that case.
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

async function setup(overrides = {}) {
    const mockVdfService = {
        ready: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
    };

    const mockOps = {
        calculateVDF: sinon.stub().resolves({ solution: b4a.alloc(516, 0xff) }),
        createProofProposal: sinon.stub().resolves({ proof_proposal: { epoch: b4a.alloc(8) } }),
        approvers: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]),
        collectSignature: sinon.stub().resolves(makeConfirmation()),
        appendEpoch: sinon.stub().resolves(),
        ...overrides.opsOverrides,
    };

    const MockEpochProofProposalOperations = class {
        constructor() { return mockOps; }
    };

    const { default: esmock } = await import('esmock');
    const { default: Service } = await esmock(SVC_PATH, {
        [CREATE_VDF_PATH]: { createVDFService: sinon.stub().resolves(mockVdfService) },
        [OPERATIONS_PATH]: { EpochProofProposalOperations: MockEpochProofProposalOperations },
        [LOGGER_PATH]: { Logger: class { debug() {} warn() {} error() {} info() {} } },
    });

    const state = makeState(overrides.stateOverrides ?? {});
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const service = new Service(state, {}, { address: 'trac1wallet' }, config);
    await service.ready();

    return { service, state, mockOps, mockVdfService };
}

// --- start() / stop() ---
// SchedulableService#start is synchronous, but EpochProofProposalService overrides it as
// `async start()`, so the call always returns a Promise and must be awaited.

test('start() returns true and starts scheduler when not running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    t.is(await service.start(), true);
});

test('start() returns false when scheduler is already running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    await service.start();
    t.is(await service.start(), false);
});

test('stop() returns false when scheduler is not running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    t.is(await service.stop(), false);
});

test('stop() returns true when scheduler is running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    await service.start();
    t.is(await service.stop(), true);
});

// --- _close() lifecycle ---
// _close() forces the active cycle's cleanup (#activeCycleCleanup) before stopping the
// scheduler, so an in-flight cycle's EPOCH_PROPOSAL_SUBMITTED/EPOCH_CREATED listeners - and any
// pending COLLECTING_CONFIRMATIONS/AWAITING_EPOCH timers - are always released on close, even if
// the cycle was mid-retry. Without this, a stuck cycle would keep recomputing the VDF and
// re-dispatching approval requests forever, even after the service was told to stop.

test('_close() removes the EPOCH_PROPOSAL_SUBMITTED listener from an in-flight cycle', async t => {
    const { service, state } = await setup();
    await service.worker(sinon.stub(), sinon.stub());
    await service.close();
    t.ok(state.removeListener.calledWith(EPOCH_PROPOSAL_SUBMITTED, sinon.match.func));
});

test('_close() removes the EPOCH_CREATED listener from an in-flight cycle', async t => {
    const { service, state } = await setup();
    await service.worker(sinon.stub(), sinon.stub());
    await service.close();
    t.ok(state.removeListener.calledWith(EPOCH_CREATED, sinon.match.func));
});

test('_close() cancels a pending COLLECTING_CONFIRMATIONS timeout so it never fires', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { service, mockOps } = await setup({
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
        });

        await service.worker(sinon.stub(), sinon.stub());
        t.is(mockOps.calculateVDF.callCount, 1);

        await service.close();

        await clock.tickAsync(1100); // would retry (2nd calculateVDF) if the timer weren't cancelled
        t.is(mockOps.calculateVDF.callCount, 1, 'close() cancelled the pending retry');
    } finally {
        clock.restore();
    }
});

// --- #shouldRun guard ---

test('worker does nothing when isInterrupted', async t => {
    const { service, mockOps } = await setup();
    t.teardown(() => service.close());
    await service.start();
    await service.stop();
    await service.worker(sinon.stub(), sinon.stub());
    t.absent(mockOps.calculateVDF.called);
});

test('worker does nothing when currentEpoch is null (state not initialized)', async t => {
    const { service, mockOps } = await setup({
        stateOverrides: { getCurrentEpoch: sinon.stub().resolves(null) },
    });
    t.teardown(() => service.close());
    await service.worker(sinon.stub(), sinon.stub());
    t.absent(mockOps.calculateVDF.called);
});

test('worker runs when currentEpoch is 0n (right after genesis)', async t => {
    const { service, mockOps } = await setup({
        stateOverrides: { getCurrentEpoch: sinon.stub().resolves(0n) },
    });
    t.teardown(() => service.close());
    await service.worker(sinon.stub(), sinon.stub());
    t.ok(mockOps.calculateVDF.calledOnce);
});

// --- worker happy path ---

test('worker calculates the VDF and dispatches a proposal to approvers', async t => {
    const { service, mockOps } = await setup();
    t.teardown(() => service.close());
    await service.worker(sinon.stub(), sinon.stub());
    t.ok(mockOps.calculateVDF.calledOnce);
    t.ok(mockOps.createProofProposal.calledOnce);
    t.ok(mockOps.approvers.calledOnce);
    t.ok(mockOps.collectSignature.calledOnce);
});

// --- #handleConfirmation / quorum ---

test('a rejected collectSignature does not count toward quorum', async t => {
    const { service, mockOps } = await setup({
        opsOverrides: { collectSignature: sinon.stub().rejects(new Error('no signature')) },
    });
    t.teardown(() => service.close());

    await service.worker(sinon.stub(), sinon.stub());
    await flush();

    t.absent(mockOps.appendEpoch.called);
});

test('confirmations below threshold do not trigger appendEpoch', async t => {
    const { service, mockOps } = await setup({
        config: { epochThreshold: 2 }, // 1 approver mocked, threshold 2 -> quorum never reached
    });
    t.teardown(() => service.close());

    await service.worker(sinon.stub(), sinon.stub());
    await flush();

    t.absent(mockOps.appendEpoch.called);
});

test('reaching confirmation threshold calls appendEpoch', async t => {
    const { service, mockOps } = await setup({
        config: { epochThreshold: 1 },
    });
    t.teardown(() => service.close());

    await service.worker(sinon.stub(), sinon.stub());
    await flush();

    t.ok(mockOps.appendEpoch.calledOnce);
});

// --- event listeners ---

test('EPOCH_CREATED always restarts the cycle, regardless of current machine state', async t => {
    // Regression test: EPOCH_CREATED is a global "some epoch was committed" signal, not gated
    // on this cycle being in AWAITING_EPOCH. Previously, if a stale local proposal kept
    // re-targeting an already-decided epoch, nothing else would ever call next() again and
    // the scheduler would stall forever waiting on this exact event.
    const { service, state } = await setup({
        opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) }, // never resolves
    });
    t.teardown(() => service.close());

    const next = sinon.stub();
    await service.worker(next, sinon.stub()); // sits in COLLECTING_CONFIRMATIONS
    t.absent(next.called);

    await state.emit(EPOCH_CREATED);
    t.ok(next.calledOnce);
    t.ok(next.calledWith(CONFIG.epochInterval));
});

// --- timeouts ---
// epochSignatureTimeout / epochAppendTimeout are wired as safety nets so a cycle never waits
// forever on approvals or on the global EPOCH_CREATED signal.

test('COLLECTING_CONFIRMATIONS timeout retries with a fresh VDF calculation', async t => {
    const clock = sinon.useFakeTimers();
    let service;
    try {
        const result = await setup({
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
        });
        service = result.service;
        const { mockOps } = result;

        await service.worker(sinon.stub(), sinon.stub());
        t.is(mockOps.calculateVDF.callCount, 1);

        await clock.tickAsync(1100);
        t.is(mockOps.calculateVDF.callCount, 2, 'retried after epochSignatureTimeout elapsed');
    } finally {
        if (service) await service.close();
        clock.restore();
    }
});

test('reaching quorum clears the COLLECTING_CONFIRMATIONS timeout', async t => {
    const clock = sinon.useFakeTimers();
    let service;
    try {
        const result = await setup({ config: { epochSignatureTimeout: 1000, epochThreshold: 1 } });
        service = result.service;
        const { mockOps } = result;

        await service.worker(sinon.stub(), sinon.stub());
        await clock.tickAsync(10); // let collectSignature's resolved promise drive to appendEpoch
        t.ok(mockOps.appendEpoch.calledOnce, 'quorum reached, cycle proceeded past COLLECTING_CONFIRMATIONS');

        await clock.tickAsync(1100); // would fire the collecting timeout if it hadn't been cleared
        t.is(mockOps.calculateVDF.callCount, 1, 'no retry - timeout was cleared on QUORUM_REACHED');
    } finally {
        if (service) await service.close();
        clock.restore();
    }
});

test('AWAITING_EPOCH timeout restarts the cycle when EPOCH_CREATED never arrives', async t => {
    const clock = sinon.useFakeTimers();
    let service;
    try {
        const result = await setup({
            config: { epochAppendTimeout: 1000 },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
        });
        service = result.service;
        const { state } = result;

        const next = sinon.stub();
        await service.worker(next, sinon.stub()); // sits in COLLECTING_CONFIRMATIONS
        await state.emit(EPOCH_PROPOSAL_SUBMITTED); // remote proposal -> AWAITING_EPOCH
        t.absent(next.called);

        await clock.tickAsync(1100);
        t.ok(next.calledOnce, 'fallback fired next() the same way onEpochCreated would');
        t.ok(next.calledWith(CONFIG.epochInterval));
    } finally {
        if (service) await service.close();
        clock.restore();
    }
});

test('EPOCH_CREATED before the AWAITING_EPOCH timeout clears it (next() fires once, not twice)', async t => {
    const clock = sinon.useFakeTimers();
    let service;
    try {
        const result = await setup({
            config: { epochAppendTimeout: 1000 },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
        });
        service = result.service;
        const { state } = result;

        const next = sinon.stub();
        await service.worker(next, sinon.stub());
        await state.emit(EPOCH_PROPOSAL_SUBMITTED); // -> AWAITING_EPOCH

        await state.emit(EPOCH_CREATED);
        t.ok(next.calledOnce);

        await clock.tickAsync(1100); // stale timeout - must not fire a second next()
        t.ok(next.calledOnce, 'timeout was cleared by the real EPOCH_CREATED event');
    } finally {
        if (service) await service.close();
        clock.restore();
    }
});

test('a stale AWAITING_EPOCH timeout firing after close() does not restart a closed scheduler', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const result = await setup({
            config: { epochAppendTimeout: 1000 },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
        });
        const { service, state } = result;

        const next = sinon.stub();
        await service.worker(next, sinon.stub());
        await state.emit(EPOCH_PROPOSAL_SUBMITTED); // -> AWAITING_EPOCH

        await service.close();

        await clock.tickAsync(1100); // must not throw - Scheduler#next() no-ops once stopped
        t.pass('closing mid-cycle does not crash when the pending timeout later fires');
    } finally {
        clock.restore();
    }
});
