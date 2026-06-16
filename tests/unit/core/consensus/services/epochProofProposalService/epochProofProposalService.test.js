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
    epochThreshold: 2,
    networkId: 1,
    addressPrefix: 'trac',
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 2048,
    logLevel: 'silent',
});

const makeState = (overrides = {}) => {
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
            for (const fn of listeners.get(event) ?? []) await fn(...args);
        },
        currentEpochId: sinon.stub().resolves(5),
        getIndexersEntry: sinon.stub().resolves([]),
        ...overrides,
    };
};

const makeSig = () => ({ signature: b4a.alloc(64, 0xbb), publicKey: b4a.alloc(32, 0x01) });

// macrotask flush — lets all pending microtasks resolve before continuing
const flush = () => new Promise(r => setTimeout(r, 20));

async function setup(overrides = {}) {
    const mockVdfService = {
        ready: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
    };

    const mockOps = {
        calculateVDF: sinon.stub().resolves({
            prevEpochId: 1,
            currentEpochHash: b4a.alloc(32, 0xaa),
            solution: b4a.alloc(516, 0xff),
        }),
        createProposal: sinon.stub().returns({
            toProposalMessage: sinon.stub().resolves({
                epoch: 2,
                data: {
                    protocolVersion: 1,
                    networkId: 1,
                    epoch: 2,
                    prevEpochHash: b4a.alloc(32),
                    vdfParamsHash: b4a.alloc(258),
                    vdfProof: b4a.alloc(258),
                },
                dataHash: b4a.alloc(32),
            }),
        }),
        appendEpoch: sinon.stub().resolves(),
        collectSignature: sinon.stub().resolves(null),
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

    const fireWorker = async () => {
        const next = sinon.stub();
        await service.worker(next);
    };

    return { service, state, mockOps, mockVdfService, fireWorker };
}

// --- start() / stop() ---

test('start() returns true and starts scheduler when not running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    t.is(service.start(), true);
});

test('start() returns false when scheduler is already running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    service.start();
    t.is(service.start(), false);
});

test('stop() returns false when scheduler is not running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    t.is(await service.stop(), false);
});

test('stop() returns true when scheduler is running', async t => {
    const { service } = await setup();
    t.teardown(() => service.close());
    service.start();
    t.is(await service.stop(), true);
});

// --- _close() lifecycle ---

test('_close() does not remove EPOCH_PROPOSAL_SUBMITTED listener from state', async t => {
    const { service, state } = await setup();
    await service.close();
    t.absent(state.removeListener.calledWith(EPOCH_PROPOSAL_SUBMITTED, sinon.match.func));
});

test('_close() does not remove EPOCH_CREATED listener from state', async t => {
    const { service, state } = await setup();
    await service.close();
    t.absent(state.removeListener.calledWith(EPOCH_CREATED, sinon.match.func));
});

// --- #worker conditions ---

test('worker does nothing when isInterrupted', async t => {
    const { service, mockOps, fireWorker } = await setup();
    t.teardown(() => service.close());
    service.start();
    await service.stop();
    await fireWorker();
    t.absent(mockOps.calculateVDF.called);
});

test('worker does nothing when currentEpochId is 0', async t => {
    const { service, mockOps, fireWorker } = await setup({
        stateOverrides: { currentEpochId: sinon.stub().resolves(0) },
    });
    t.teardown(() => service.close());
    await fireWorker();
    t.absent(mockOps.calculateVDF.called);
});

test('worker does nothing when state machine is not VDF_PENDING', async t => {
    const { service, mockOps, state, fireWorker } = await setup();
    t.teardown(() => service.close());
    await state.emit(EPOCH_PROPOSAL_SUBMITTED); // moves machine to AWAITING_EPOCH
    mockOps.calculateVDF.resetHistory();
    await fireWorker();
    t.absent(mockOps.calculateVDF.called);
});

test('worker triggers VDF calculation when VDF_PENDING and epochId > 0', async t => {
    const { service, mockOps, fireWorker } = await setup();
    t.teardown(() => service.close());
    await fireWorker();
    t.ok(mockOps.calculateVDF.calledOnce);
});

// --- event listeners ---

test('EPOCH_PROPOSAL_SUBMITTED transitions machine to AWAITING_EPOCH', async t => {
    // Observable: machine reaches AWAITING_EPOCH so worker skips on next tick
    const { service, mockOps, state, fireWorker } = await setup();
    t.teardown(() => service.close());
    await state.emit(EPOCH_PROPOSAL_SUBMITTED);
    mockOps.calculateVDF.resetHistory();
    await fireWorker(); // machine is not VDF_PENDING — worker skips
    t.absent(mockOps.calculateVDF.called);
});

test('EPOCH_CREATED sends EPOCH_VERIFIED and resumes cycle when in AWAITING_EPOCH', async t => {
    // Observable: after EPOCH_PROPOSAL_SUBMITTED then EPOCH_CREATED, calculateVDF is called
    const { service, mockOps, state } = await setup();
    t.teardown(() => service.close());
    await state.emit(EPOCH_PROPOSAL_SUBMITTED); // → AWAITING_EPOCH
    await state.emit(EPOCH_CREATED);            // → EPOCH_VERIFIED → VDF_PENDING → calculateVDF
    await flush();
    t.ok(mockOps.calculateVDF.calledOnce);
});

test('EPOCH_CREATED does nothing when not in AWAITING_EPOCH', async t => {
    const { service, mockOps, state } = await setup();
    t.teardown(() => service.close());
    // Machine starts in VDF_PENDING, not AWAITING_EPOCH
    await state.emit(EPOCH_CREATED);
    await flush();
    t.absent(mockOps.calculateVDF.called);
});

// --- #handleConfirmation threshold ---

test('null confirmation is ignored and does not count toward threshold', async t => {
    const { service, mockOps, fireWorker } = await setup({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]) },
        config: { epochThreshold: 1 },
    });
    t.teardown(() => service.close());
    mockOps.collectSignature.resolves(null);

    await fireWorker();
    await flush();

    t.absent(mockOps.appendEpoch.called);
});

test('confirmations below threshold do not trigger QUORUM_REACHED', async t => {
    const { service, mockOps, fireWorker } = await setup({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]) },
        config: { epochThreshold: 3 }, // 1 approver, threshold 3 → no quorum
    });
    t.teardown(() => service.close());
    mockOps.collectSignature.resolves(makeSig());

    await fireWorker();
    await flush();

    t.absent(mockOps.appendEpoch.called);
});

test('reaching confirmation threshold sends QUORUM_REACHED and calls appendEpoch', async t => {
    const { service, mockOps, fireWorker } = await setup({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]) },
        config: { epochThreshold: 1 },
    });
    t.teardown(() => service.close());
    // first call returns a confirmation, subsequent calls return null to stop the loop
    mockOps.collectSignature.onFirstCall().resolves(makeSig()).resolves(null);

    await fireWorker();
    await flush();

    t.ok(mockOps.appendEpoch.calledOnce);
});

// --- timeouts ---

test('COLLECTING_CONFIRMATIONS timeout resets machine to VDF_PENDING and triggers new cycle', async t => {
    const clock = sinon.useFakeTimers();
    let service;
    try {
        const result = await setup({ config: { epochSignatureTimeout: 1000 } });
        service = result.service;
        const { mockOps, fireWorker } = result;

        await fireWorker(); // chain reaches COLLECTING_CONFIRMATIONS, calculateVDF called once
        t.is(mockOps.calculateVDF.callCount, 1);

        await clock.tickAsync(1100); // fire collecting timeout → VDF_PENDING → calculateVDF again
        t.is(mockOps.calculateVDF.callCount, 2);
    } finally {
        if (service) await service.close(); // cancel pending timers from second cycle
        clock.restore();
    }
});

test('_close() cancels pending AWAITING_EPOCH timeout before it fires', async t => {
    const clock = sinon.useFakeTimers();
    try {
        const { service, mockOps, state } = await setup({
            config: { epochAppendTimeout: 1000 },
        });
        await state.emit(EPOCH_PROPOSAL_SUBMITTED); // → AWAITING_EPOCH, timeout scheduled
        await service.close();                      // clears timeout
        await clock.tickAsync(1100);                // timeout would have fired — but was cleared
        t.absent(mockOps.calculateVDF.called);
    } finally {
        clock.restore();
    }
});
