import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { ConsensusResultCode } from '../../../../../../src/utils/constants.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

// All paths are relative to THIS test file
const SVC_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorService.js';
const CREATE_VDF_PATH = '../../../../../../src/core/consensus/services/createVDFService.js';
const OPERATIONS_PATH = '../../../../../../src/core/consensus/services/EpochCoordinatorOperations.js';
const LOGGER_PATH = '../../../../../../src/utils/logger.js';

const EPOCH_CREATED = 'msb:epoch_created';

const CONFIG = Object.freeze({
    epochInterval: 1000,
    epochSignatureTimeout: 5000,
    epochAppendTimeout: 5000,
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
        off: sinon.stub().callsFake((event, fn) => {
            const arr = listeners.get(event) ?? [];
            listeners.set(event, arr.filter(f => f !== fn));
        }),
        emit: async (event, ...args) => {
            for (const fn of [...(listeners.get(event) ?? [])]) await fn(...args);
        },
        indexerCount: sinon.stub().resolves(1),
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

// Drains the microtask queue without relying on a real/fake timer tick - safe to use even
// under sinon fake timers, since those only intercept setTimeout/setInterval, not promises.
const drainMicrotasks = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

async function setup(overrides = {}) {
    const mockVdfService = {
        ready: sinon.stub().resolves(),
        close: sinon.stub().resolves(),
    };

    const mockOps = {
        calculateVDF: sinon.stub().resolves({ solution: b4a.alloc(516, 0xff), difficulty: 100, discriminantSizeBits: 2048 }),
        createProofProposal: sinon.stub().resolves({ proof_proposal: { epoch: b4a.alloc(8) } }),
        approvers: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]),
        collectSignature: sinon.stub().resolves(makeConfirmation()),
        buildSetEpochPayload: sinon.stub().resolves(b4a.alloc(64, 0xdd)),
        appendSetEpoch: sinon.stub().resolves(),
        ...overrides.opsOverrides,
    };

    const MockCoordinatorOperations = class {
        constructor() { return mockOps; }
    };

    const { default: esmock } = await import('esmock');
    const { default: Service } = await esmock(SVC_PATH, {
        [CREATE_VDF_PATH]: { createVDFService: sinon.stub().resolves(mockVdfService) },
        [OPERATIONS_PATH]: { EpochCoordinatorOperations: MockCoordinatorOperations },
        [LOGGER_PATH]: { Logger: class { debug() {} warn() {} error() {} info() {} } },
    });

    const state = makeState(overrides.stateOverrides ?? {});
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const wallet = { address: 'trac1wallet' };
    const manager = { connect: sinon.stub().resolves(), ...overrides.managerOverrides };
    const service = new Service(state, wallet, config, manager);
    await service.ready();

    return { service, state, mockOps, mockVdfService, manager };
}

if (isBareRuntime) {
    test('EpochCoordinatorService coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {

    // --- start() / stop() ---
    // SchedulableService#start is synchronous, but EpochCoordinatorService overrides it as
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

    // --- quorum computation ---
    // #getQuorum() is private; verified indirectly through the branching it drives.
    // Formula: indexerCount <= 2 -> quorum 1 (self alone suffices, no external approvals);
    // indexerCount >= 3 -> floor(n/2)+1 (self + external approvals up to that count).

    test('indexerCount is queried once per cycle', async t => {
        const { service, state } = await setup({ stateOverrides: { indexerCount: sinon.stub().resolves(3) } });
        t.teardown(() => service.close());
        await service.worker(sinon.stub(), sinon.stub());
        t.is(state.indexerCount.callCount, 1);
    });

    test('quorum is 1 when indexerCount is 1: no external approvals collected', async t => {
        const { service, mockOps } = await setup({ stateOverrides: { indexerCount: sinon.stub().resolves(1) } });
        t.teardown(() => service.close());
        await service.worker(sinon.stub(), sinon.stub());
        t.absent(mockOps.approvers.called);
        t.ok(mockOps.buildSetEpochPayload.calledOnce);
    });

    test('quorum is 1 when indexerCount is 2: no external approvals collected', async t => {
        const { service, mockOps } = await setup({ stateOverrides: { indexerCount: sinon.stub().resolves(2) } });
        t.teardown(() => service.close());
        await service.worker(sinon.stub(), sinon.stub());
        t.absent(mockOps.approvers.called);
        t.ok(mockOps.buildSetEpochPayload.calledOnce);
    });

    test('quorum is 2 when indexerCount is 3: self + one external approval reaches quorum', async t => {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) },
            opsOverrides: { approvers: sinon.stub().resolves(approvers) },
        });
        t.teardown(() => service.close());
        await service.worker(sinon.stub(), sinon.stub());
        await flush();
        t.ok(mockOps.approvers.calledOnce, 'quorum > 1 requires collecting external approvals');
        t.ok(mockOps.buildSetEpochPayload.calledOnce, 'self + 1 approval >= quorum of 2');
    });

    test('quorum is 3 when indexerCount is 5: self + one approval is not enough, self + two is', async t => {
        const approvers = [
            { key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) },
            { key: b4a.alloc(32, 0x04) }, { key: b4a.alloc(32, 0x05) },
        ];
        let resolveSecond;
        const collectSignature = sinon.stub();
        collectSignature.onCall(0).resolves(makeConfirmation());
        collectSignature.onCall(1).returns(new Promise((resolve) => { resolveSecond = resolve; }));
        collectSignature.onCall(2).returns(new Promise(() => {}));
        collectSignature.onCall(3).returns(new Promise(() => {}));

        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(5) },
            opsOverrides: { approvers: sinon.stub().resolves(approvers), collectSignature },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());
        await flush();
        t.absent(mockOps.buildSetEpochPayload.called, 'self + 1 approval is below quorum of 3');

        resolveSecond(makeConfirmation());
        await drainMicrotasks();
        t.ok(mockOps.buildSetEpochPayload.calledOnce, 'self + 2 approvals reaches quorum of 3');
    });

    // --- _close() lifecycle ---

    // EPOCH_CREATED handling is not implemented in EpochCoordinatorService yet - skipped until it lands.
    test.skip('_close() removes the EPOCH_CREATED listener from an in-flight cycle', async t => {
        const { service, state } = await setup();
        await service.worker(sinon.stub(), sinon.stub());
        await service.close();
        t.ok(state.removeListener.calledWith(EPOCH_CREATED, sinon.match.func));
    });

    test('_close() cancels a pending COLLECT_APPROVALS timeout so it never fires', async t => {
        const clock = sinon.useFakeTimers();
        try {
            const { service, mockOps } = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(3) },
                config: { epochSignatureTimeout: 1000 },
                opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
            });

            await service.worker(sinon.stub(), sinon.stub());
            t.is(mockOps.calculateVDF.callCount, 1);

            await service.close();

            await clock.tickAsync(1100); // would retry (2nd calculateVDF) via BACKOFF if the timer weren't cancelled
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

    // --- happy path, single/dual-indexer network (quorum === 1, no external approval needed) ---

    test('worker runs the full cycle end-to-end when quorum is 1', async t => {
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(1) },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());

        t.ok(mockOps.calculateVDF.calledOnce);
        t.ok(mockOps.createProofProposal.calledOnce);
        t.absent(mockOps.approvers.called, 'no external approval needed when quorum is 1');
        t.ok(mockOps.buildSetEpochPayload.calledOnce);
        t.ok(mockOps.appendSetEpoch.calledOnce);
        t.ok(b4a.equals(mockOps.appendSetEpoch.firstCall.args[0], await mockOps.buildSetEpochPayload.firstCall.returnValue));
    });

    test('worker with quorum 1 builds the set-epoch payload from the signed proposal and no external approvals', async t => {
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(1) },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());

        const [proofProposal, approvals] = mockOps.buildSetEpochPayload.firstCall.args;
        t.ok(proofProposal);
        t.alike(approvals, []);
    });

    // --- multi-indexer approval flow (quorum > 1) ---

    test('worker with quorum > 1 dispatches the proposal to every approver and holds in COLLECT_APPROVALS', async t => {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) },
            opsOverrides: {
                approvers: sinon.stub().resolves(approvers),
                collectSignature: sinon.stub().returns(new Promise(() => {})),
            },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());

        t.ok(mockOps.approvers.calledOnce);
        t.is(mockOps.collectSignature.callCount, 2);
        t.absent(mockOps.buildSetEpochPayload.called, 'still waiting for quorum');
    });

    test('reaching quorum (self + enough approvals) calls buildSetEpochPayload/appendSetEpoch', async t => {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) }, // quorum = 2 -> self + 1 approval
            opsOverrides: { approvers: sinon.stub().resolves(approvers) },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());
        await flush();

        t.ok(mockOps.buildSetEpochPayload.calledOnce);
        t.ok(mockOps.appendSetEpoch.calledOnce);
        const [, approvals] = mockOps.buildSetEpochPayload.firstCall.args;
        t.ok(approvals.length >= 1);
    });

    test('a generic rejection from one approver does not by itself fail the round if quorum is still reachable', async t => {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) }, // quorum = 2
            opsOverrides: {
                approvers: sinon.stub().resolves(approvers),
                collectSignature: sinon.stub()
                    .onFirstCall().rejects(new Error('connection error'))
                    .onSecondCall().resolves(makeConfirmation()),
            },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());
        await flush();

        t.ok(mockOps.buildSetEpochPayload.calledOnce, 'the surviving approval still reached quorum');
    });

    test('all approvers rejecting with a generic error fails the round and backs off (no append)', async t => {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) }, // quorum = 2, both must succeed but both fail
            opsOverrides: {
                approvers: sinon.stub().resolves(approvers),
                collectSignature: sinon.stub().rejects(new Error('no signature')),
            },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());
        await flush();

        t.absent(mockOps.buildSetEpochPayload.called);
        t.absent(mockOps.appendSetEpoch.called);
    });

    test('a rejected approval fails the cycle; the next cycle rebuilds the proposal and succeeds', async t => {
    // With a single approver and quorum 2, one rejection is already unrecoverable for this cycle
    // (rejections(1) > approvers(1) - quorum(2) + 1(0)) -> APPROVAL_COLLECTION_FAILED -> BACKOFF,
    // ending the cycle. There is no in-cycle retry: every worker() call is a brand new
    // EpochStateMachine starting at LOAD_EPOCH_CONTEXT, so the next cycle always recomputes the
    // VDF and rebuilds the proposal from scratch before dispatching a fresh approval request.
        const approvers = [{ key: b4a.alloc(32, 0x02) }];
        const err = new Error('epoch mismatch');
        err.resultCode = ConsensusResultCode.EPOCH_INVALID;
        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) }, // quorum = 2
            opsOverrides: {
                approvers: sinon.stub().resolves(approvers),
                collectSignature: sinon.stub()
                    .onFirstCall().rejects(err)
                    .onSecondCall().resolves(makeConfirmation()),
            },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());
        await flush();
        t.is(mockOps.calculateVDF.callCount, 1);
        t.absent(mockOps.buildSetEpochPayload.called, 'the lone rejection already fails this cycle');

        await service.worker(sinon.stub(), sinon.stub()); // the scheduler starts a fresh cycle
        await flush();
        t.is(mockOps.calculateVDF.callCount, 2, 'a fresh cycle always recomputes the VDF');
        t.ok(mockOps.buildSetEpochPayload.calledOnce, 'the new cycle\'s approval request succeeds and reaches quorum');
    });

    test('COLLECT_APPROVALS timeout fires APPROVAL_COLLECTION_FAILED, backs off, and the next cycle rebuilds from scratch', async t => {
        const clock = sinon.useFakeTimers();
        let service;
        try {
            const approvers = [{ key: b4a.alloc(32, 0x02) }];
            const result = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(3) },
                config: { epochSignatureTimeout: 1000 },
                opsOverrides: {
                    approvers: sinon.stub().resolves(approvers),
                    collectSignature: sinon.stub().returns(new Promise(() => {})),
                },
            });
            service = result.service;
            const { mockOps } = result;

            await service.worker(sinon.stub(), sinon.stub());
            t.is(mockOps.calculateVDF.callCount, 1);

            await clock.tickAsync(1100); // epochSignatureTimeout elapses -> APPROVAL_COLLECTION_FAILED -> BACKOFF -> cycle ends
            t.absent(mockOps.buildSetEpochPayload.called);

            await service.worker(sinon.stub(), sinon.stub()); // the scheduler starts a fresh cycle
            t.is(mockOps.calculateVDF.callCount, 2, 'a fresh cycle always recomputes the VDF');
            t.is(mockOps.createProofProposal.callCount, 2, 'proposal rebuilt for the new cycle');
        } finally {
            if (service) await service.close();
            clock.restore();
        }
    });

    test('a straggling approval from an abandoned cycle does not count toward a later cycle\'s quorum', async t => {
    // Regression test: cycle 1 times out -> BACKOFF -> ends; the scheduler starts cycle 2 as a
    // brand new EpochStateMachine with its own `proposals` object. A cycle-1 collectSignature
    // promise that resolves late - after cycle 2 is already dispatched - must not be mistaken
    // for a cycle-2 confirmation (each cycle's `proposals` is a distinct object captured by
    // closure in #dispatchApprovalRequests, not read back off the current machine state).
        const clock = sinon.useFakeTimers();
        let service;
        try {
            const approvers = [{ key: b4a.alloc(32, 0x02) }];
            let resolveRound1;
            let resolveRound2;
            const collectSignature = sinon.stub();
            collectSignature.onCall(0).returns(new Promise((resolve) => { resolveRound1 = resolve; }));
            collectSignature.onCall(1).returns(new Promise((resolve) => { resolveRound2 = resolve; }));

            const result = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(3) }, // quorum = 2 -> self + 1 approval
                config: { epochSignatureTimeout: 1000 },
                opsOverrides: { approvers: sinon.stub().resolves(approvers), collectSignature },
            });
            service = result.service;
            const { mockOps } = result;

            await service.worker(sinon.stub(), sinon.stub()); // cycle 1 dispatches (call 0)
            await clock.tickAsync(1100); // epochSignatureTimeout -> APPROVAL_COLLECTION_FAILED -> BACKOFF -> cycle 1 ends

            await service.worker(sinon.stub(), sinon.stub()); // cycle 2 dispatches (call 1)
            t.is(collectSignature.callCount, 2, 'cycle 2 was dispatched');

            resolveRound1(makeConfirmation()); // cycle 1's stale promise finally settles
            await drainMicrotasks();
            t.absent(mockOps.buildSetEpochPayload.called, 'cycle 1\'s stale confirmation must not count toward cycle 2\'s quorum');

            resolveRound2(makeConfirmation()); // cycle 2's own approval arrives
            await drainMicrotasks();
            t.ok(mockOps.buildSetEpochPayload.calledOnce, 'cycle 2 reaches quorum from its own confirmation');
        } finally {
            if (service) await service.close();
            clock.restore();
        }
    });

    // --- append / re-check-before-append flow ---

    test('TARGET_EPOCH_ALREADY_SIGNED reloads the signed context and restarts from INITIALIZE_VDF without appending', async t => {
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onCall(0).resolves(5n); // #shouldRun() guard
        getCurrentEpoch.onCall(1).resolves(5n); // seed for this cycle (context.currentEpoch)
        getCurrentEpoch.onCall(2).resolves(6n); // REFRESH_SIGNED_STATE_BEFORE_APPEND sees it already advanced
        getCurrentEpoch.resolves(6n); // RELOAD_SIGNED_CONTEXT re-seed and anything after

        const { service, mockOps } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(1), getCurrentEpoch },
        });
        t.teardown(() => service.close());

        await service.worker(sinon.stub(), sinon.stub());

        // First pass builds a payload for the stale target, discovers it's already signed via
        // TARGET_EPOCH_ALREADY_SIGNED, and reloads instead of appending; the retried pass (against
        // the now-current epoch) builds again and this time appends exactly once.
        t.is(mockOps.buildSetEpochPayload.callCount, 2, 'built once for the stale target, once after reload');
        t.is(mockOps.appendSetEpoch.callCount, 1, 'only the reloaded pass actually appends');
        t.is(mockOps.calculateVDF.callCount, 2, 'restarted from INITIALIZE_VDF against the reloaded epoch');
    });

    test('APPEND_FAILED backs off, and the next cycle rebuilds the proof and retries the append', async t => {
        let service;
        try {
            const result = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(1) },
                opsOverrides: { appendSetEpoch: sinon.stub().rejects(new Error('append failed')) },
            });
            service = result.service;
            const { mockOps } = result;

            await service.worker(sinon.stub(), sinon.stub());
            await drainMicrotasks(); // let the fire-and-forget append rejection reach BACKOFF
            t.is(mockOps.appendSetEpoch.callCount, 1);
            t.is(mockOps.calculateVDF.callCount, 1);

            await service.worker(sinon.stub(), sinon.stub()); // the scheduler starts a fresh cycle after backoff
            await drainMicrotasks();
            t.is(mockOps.calculateVDF.callCount, 2, 'a fresh cycle always recomputes the VDF');
            t.is(mockOps.createProofProposal.callCount, 2, 'proposal rebuilt for the new cycle');
            t.is(mockOps.appendSetEpoch.callCount, 2, 'append retried on the new cycle');
        } finally {
            if (service) await service.close();
        }
    });

    test('a fresh cycle naturally picks up an epoch that advanced since the last cycle', async t => {
    // A successful append is terminal (SEND_APPEND_SIGNAL has no outgoing transition) - there is
    // no in-cycle wait-and-recheck. Discovering that someone else's epoch landed in the meantime
    // is just what LOAD_EPOCH_CONTEXT does on every fresh cycle, nothing special about backoff.
        let service;
        try {
            const getCurrentEpoch = sinon.stub().resolves(5n);
            const result = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(1), getCurrentEpoch },
            });
            service = result.service;
            const { mockOps } = result;

            await service.worker(sinon.stub(), sinon.stub());
            await drainMicrotasks();
            t.is(mockOps.appendSetEpoch.callCount, 1, 'first cycle appends successfully and ends');

            // Someone else's epoch landed before the next scheduler tick.
            getCurrentEpoch.resolves(6n);

            await service.worker(sinon.stub(), sinon.stub());
            t.is(mockOps.calculateVDF.callCount, 2, 'the new cycle recomputes against the now-current epoch');
        } finally {
            if (service) await service.close();
        }
    });

    // --- EPOCH_CREATED global listener ---

    // EPOCH_CREATED handling is not implemented in EpochCoordinatorService yet - skipped until it lands.
    test.skip('EPOCH_CREATED always restarts the cycle, regardless of current machine state', async t => {
        const { service, state } = await setup({
            stateOverrides: { indexerCount: sinon.stub().resolves(3) },
            opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) }, // never resolves
        });
        t.teardown(() => service.close());

        const next = sinon.stub();
        await service.worker(next, sinon.stub()); // sits in COLLECT_APPROVALS
        t.absent(next.called);

        await state.emit(EPOCH_CREATED);
        t.ok(next.calledOnce);
        t.ok(next.calledWith(CONFIG.epochInterval));
    });

    // EPOCH_CREATED handling is not implemented in EpochCoordinatorService yet - skipped until it lands.
    test.skip('a stale COLLECT_APPROVALS timeout firing after EPOCH_CREATED does not restart a second time', async t => {
        const clock = sinon.useFakeTimers();
        let service;
        try {
            const result = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(3) },
                config: { epochSignatureTimeout: 1000 },
                opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
            });
            service = result.service;
            const { state } = result;

            const next = sinon.stub();
            await service.worker(next, sinon.stub());
            await state.emit(EPOCH_CREATED);
            t.ok(next.calledOnce);

            await clock.tickAsync(1100); // stale timeout - must not fire a second next()
            t.ok(next.calledOnce, 'timeout was cleared by the real EPOCH_CREATED event');
        } finally {
            if (service) await service.close();
            clock.restore();
        }
    });

    test('a stale BACKOFF timeout firing after close() does not throw', async t => {
        const clock = sinon.useFakeTimers();
        try {
            const { service } = await setup({
                stateOverrides: { indexerCount: sinon.stub().resolves(1) },
                config: { epochAppendTimeout: 1000 },
            });

            await service.worker(sinon.stub(), sinon.stub()); // append succeeds, moves to BACKOFF
            await service.close();

            await clock.tickAsync(1100); // must not throw - the cycle was already torn down
            t.pass('closing mid-cycle does not crash when the pending BACKOFF timer later fires');
        } finally {
            clock.restore();
        }
    });

}
