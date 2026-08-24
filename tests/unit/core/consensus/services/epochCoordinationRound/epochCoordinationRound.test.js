import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import {
    ConsensusProtocolVersion,
    ConsensusResultCode,
    CustomEventType,
} from '../../../../../../src/utils/constants.js';
import {
    createMessage,
    uint16ToBuffer,
    uint32ToBuffer,
    uint64ToBuffer,
    uint8ToBuffer,
} from '../../../../../../src/utils/buffer.js';
import { SCHEDULABLE_SERVICE_EVENTS } from '../../../../../../src/utils/scheduler/SchedulableService.js';
import { EpochCoordinationRound } from '../../../../../../src/core/consensus/services/EpochCoordinationRound.js';
import { addressToBuffer } from '../../../../../../src/core/state/utils/address.js';
import {
    CONFIG,
    drainMicrotasks,
    flush,
    makeConfirmation,
    makeEmitter,
    makeOperations,
    makeState,
} from '../epochCoordinatorTestHelpers.js';

function setupRound(overrides = {}) {
    const state = makeState(overrides.stateOverrides);
    const operations = makeOperations(overrides.opsOverrides);
    const config = { ...CONFIG, ...(overrides.config ?? {}) };
    const wallet = overrides.wallet ?? { address: 'trac1wallet' };
    const manager = {
        connect: sinon.stub().resolves(),
        ...(overrides.managerOverrides ?? {}),
    };
    const logger = overrides.logger ?? {
        debug: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        info: sinon.stub(),
    };
    const stopEmitter = makeEmitter();

    const createRound = () => new EpochCoordinationRound({
        state,
        wallet,
        config,
        manager,
        logger,
        operations,
        intervalMs: config.epochInterval,
        stopEmitter,
    });

    const runRound = async (next = sinon.stub()) => {
        const round = createRound();
        await round.run(next);
        return round;
    };

    return {
        state,
        operations,
        config,
        wallet,
        manager,
        logger,
        stopEmitter,
        createRound,
        runRound,
        closeRounds: () => stopEmitter.emit(SCHEDULABLE_SERVICE_EVENTS.STOP),
    };
}

test('queries the indexer count once per round', async t => {
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
    });
    t.teardown(context.closeRounds);

    await context.runRound();

    t.is(context.state.indexerCount.callCount, 1);
});

for (const indexerCount of [1, 2]) {
    test(`quorum is one when the network has ${indexerCount} indexer(s)`, async t => {
        const context = setupRound({
            stateOverrides: { indexerCount: sinon.stub().resolves(indexerCount) },
        });
        t.teardown(context.closeRounds);

        await context.runRound();

        t.absent(context.operations.approvers.called);
        t.ok(context.operations.buildSetEpochPayload.calledOnce);
    });
}

test('self and one external approval reach quorum in a three-indexer network', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: { approvers: sinon.stub().resolves(approvers) },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.ok(context.operations.approvers.calledOnce);
    t.ok(context.operations.buildSetEpochPayload.calledOnce);
});

test('a five-indexer network waits for two external approvals', async t => {
    const approvers = [
        { key: b4a.alloc(32, 0x02) },
        { key: b4a.alloc(32, 0x03) },
        { key: b4a.alloc(32, 0x04) },
        { key: b4a.alloc(32, 0x05) },
    ];
    let resolveSecond;
    const collectSignature = sinon.stub();
    collectSignature.onCall(0).resolves(makeConfirmation());
    collectSignature.onCall(1).returns(new Promise(resolve => { resolveSecond = resolve; }));
    collectSignature.onCall(2).returns(new Promise(() => {}));
    collectSignature.onCall(3).returns(new Promise(() => {}));
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(5) },
        opsOverrides: { approvers: sinon.stub().resolves(approvers), collectSignature },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();
    t.absent(context.operations.buildSetEpochPayload.called);

    resolveSecond(makeConfirmation());
    await drainMicrotasks();
    t.ok(context.operations.buildSetEpochPayload.calledOnce);
});

test('runs the quorum-one path from VDF calculation through append', async t => {
    const context = setupRound();
    t.teardown(context.closeRounds);

    await context.runRound();

    t.ok(context.operations.calculateVDF.calledOnce);
    t.ok(context.operations.createProofProposal.calledOnce);
    t.absent(context.operations.approvers.called);
    t.ok(context.operations.buildSetEpochPayload.calledOnce);
    t.ok(context.operations.appendSetEpoch.calledOnce);
    t.ok(b4a.equals(
        context.operations.appendSetEpoch.firstCall.args[0],
        await context.operations.buildSetEpochPayload.firstCall.returnValue,
    ));
});

test('builds the VDF challenge with the signed difficulty and discriminant size', async t => {
    const currentEpoch = 5n;
    const currentEpochHash = b4a.alloc(32, 0xaa);
    const difficulty = 123_456;
    const discriminantBitSize = 2048;
    const wallet = {
        address: 'trac1xf5sa6k8ykee2dmawpqawj0yjxfx42arx7924eh6k7edf72wrn7seev3pa',
    };
    const context = setupRound({
        wallet,
        stateOverrides: {
            getCurrentEpoch: sinon.stub().resolves(currentEpoch),
            getEpoch: sinon.stub().resolves(currentEpochHash),
            getSignedConsensusConfig: sinon.stub().resolves({
                schemaVersion: 1,
                configData: { difficulty, discriminantBitSize },
            }),
        },
    });
    t.teardown(context.closeRounds);

    await context.runRound();

    const expectedChallenge = createMessage(
        uint8ToBuffer(ConsensusProtocolVersion.V1),
        uint16ToBuffer(context.config.networkId),
        uint64ToBuffer(currentEpoch + 1n),
        currentEpochHash,
        addressToBuffer(wallet.address, context.config.addressPrefix),
        uint32ToBuffer(difficulty),
        uint16ToBuffer(discriminantBitSize),
    );
    const [challenge, actualDifficulty, actualDiscriminantBitSize] =
        context.operations.calculateVDF.firstCall.args;

    t.ok(b4a.equals(challenge, expectedChallenge));
    t.is(actualDifficulty, difficulty);
    t.is(actualDiscriminantBitSize, discriminantBitSize);
});

test('builds a quorum-one payload without external approvals', async t => {
    const context = setupRound();
    t.teardown(context.closeRounds);

    await context.runRound();

    const [proofProposal, approvals] = context.operations.buildSetEpochPayload.firstCall.args;
    t.ok(proofProposal);
    t.alike(approvals, []);
});

test('dispatches the proposal to every approver and waits for quorum', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: {
            approvers: sinon.stub().resolves(approvers),
            collectSignature: sinon.stub().returns(new Promise(() => {})),
        },
    });
    t.teardown(context.closeRounds);

    await context.runRound();

    t.ok(context.operations.approvers.calledOnce);
    t.is(context.operations.collectSignature.callCount, 2);
    t.absent(context.operations.buildSetEpochPayload.called);
});

test('reaching quorum builds and appends the set-epoch payload', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: { approvers: sinon.stub().resolves(approvers) },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.ok(context.operations.buildSetEpochPayload.calledOnce);
    t.ok(context.operations.appendSetEpoch.calledOnce);
    const [, approvals] = context.operations.buildSetEpochPayload.firstCall.args;
    t.ok(approvals.length >= 1);
});

test('one failed request does not fail a round while quorum remains reachable', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: {
            approvers: sinon.stub().resolves(approvers),
            collectSignature: sinon.stub()
                .onFirstCall().rejects(new Error('connection error'))
                .onSecondCall().resolves(makeConfirmation()),
        },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.ok(context.operations.buildSetEpochPayload.calledOnce);
});

test('an unreachable quorum backs off and exits after discovering a newer epoch', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const getCurrentEpoch = sinon.stub();
    getCurrentEpoch.onFirstCall().resolves(5n);
    getCurrentEpoch.resolves(6n);
    const context = setupRound({
        stateOverrides: {
            indexerCount: sinon.stub().resolves(3),
            getCurrentEpoch,
        },
        opsOverrides: {
            approvers: sinon.stub().resolves(approvers),
            collectSignature: sinon.stub().rejects(new Error('no signature')),
        },
    });
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);
    await flush();

    t.ok(context.state.refresh.calledOnce);
    t.absent(context.operations.buildSetEpochPayload.called);
    t.absent(context.operations.appendSetEpoch.called);
    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('approval rejection retries within the same round using the local VDF', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }];
    const rejection = new Error('epoch mismatch');
    rejection.resultCode = ConsensusResultCode.EPOCH_INVALID;
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: {
            approvers: sinon.stub().resolves(approvers),
            collectSignature: sinon.stub()
                .onFirstCall().rejects(rejection)
                .onSecondCall().resolves(makeConfirmation()),
        },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.is(context.operations.calculateVDF.callCount, 1);
    t.is(context.operations.createProofProposal.callCount, 2);
    t.is(context.operations.collectSignature.callCount, 2);
    t.ok(context.state.refresh.calledOnce);
    t.ok(context.operations.buildSetEpochPayload.calledOnce);
    t.ok(context.operations.appendSetEpoch.calledOnce);
});

test('collection timeout traverses BACKOFF and signed-state refresh on the real FSM', async t => {
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onFirstCall().resolves(5n);
        getCurrentEpoch.resolves(6n);
        context = setupRound({
            stateOverrides: {
                indexerCount: sinon.stub().resolves(3),
                getCurrentEpoch,
            },
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: {
                approvers: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]),
                collectSignature: sinon.stub().returns(new Promise(() => {})),
            },
        });
        const next = sinon.stub();

        await context.runRound(next);
        await clock.tickAsync(1100);

        t.ok(context.state.refresh.calledOnce);
        t.absent(context.operations.appendSetEpoch.called);
        t.ok(next.calledOnceWith(CONFIG.epochInterval));
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
});

test('a late approval remains isolated from a later round', async t => {
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const approvers = [{ key: b4a.alloc(32, 0x02) }];
        let resolveFirst;
        let resolveSecond;
        const collectSignature = sinon.stub();
        collectSignature.onCall(0).returns(new Promise(resolve => { resolveFirst = resolve; }));
        collectSignature.onCall(1).returns(new Promise(resolve => { resolveSecond = resolve; }));
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onCall(0).resolves(5n);
        getCurrentEpoch.onCall(1).resolves(6n);
        getCurrentEpoch.resolves(6n);
        context = setupRound({
            stateOverrides: {
                indexerCount: sinon.stub().resolves(3),
                getCurrentEpoch,
            },
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: { approvers: sinon.stub().resolves(approvers), collectSignature },
        });

        await context.runRound();
        await clock.tickAsync(1100);
        t.ok(context.state.refresh.calledOnce);
        await context.runRound();
        t.is(collectSignature.callCount, 2);

        resolveFirst(makeConfirmation());
        await drainMicrotasks();
        t.absent(context.operations.buildSetEpochPayload.called);

        resolveSecond(makeConfirmation());
        await drainMicrotasks();
        t.ok(context.operations.buildSetEpochPayload.calledOnce);
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
});

test('an already-signed target ends the round without appending', async t => {
    const getCurrentEpoch = sinon.stub();
    getCurrentEpoch.onCall(0).resolves(5n);
    getCurrentEpoch.onCall(1).resolves(6n);
    getCurrentEpoch.resolves(6n);
    const context = setupRound({
        stateOverrides: { getCurrentEpoch },
    });
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);

    t.is(context.operations.buildSetEpochPayload.callCount, 1);
    t.is(context.operations.appendSetEpoch.callCount, 0);
    t.is(context.operations.calculateVDF.callCount, 1);
    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('append failure retries within the same round using the local VDF', async t => {
    const appendSetEpoch = sinon.stub();
    appendSetEpoch.onFirstCall().rejects(new Error('append failed'));
    appendSetEpoch.onSecondCall().resolves();
    const context = setupRound({
        opsOverrides: { appendSetEpoch },
    });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.is(context.operations.calculateVDF.callCount, 1);
    t.is(context.operations.createProofProposal.callCount, 2);
    t.is(context.operations.appendSetEpoch.callCount, 2);
    t.ok(context.state.refresh.calledOnce);
});

test('append completion waits for the target EPOCH_CREATED event', async t => {
    const context = setupRound();
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);
    await drainMicrotasks();

    t.ok(context.operations.appendSetEpoch.calledOnce);
    t.absent(next.called);

    await context.state.emit(CustomEventType.EPOCH_CREATED, {
        epoch: 6n,
        proposerAddress: context.wallet.address,
    });
    await drainMicrotasks();

    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('peer EPOCH_CREATED in append state reloads without repeating work', async t => {
    const context = setupRound();
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);
    await drainMicrotasks();
    t.ok(context.operations.appendSetEpoch.calledOnce);

    await context.state.emit(CustomEventType.EPOCH_CREATED, {
        epoch: 6n,
        proposerAddress: 'trac1peer',
    });
    await flush();

    t.is(context.operations.calculateVDF.callCount, 1);
    t.is(context.operations.appendSetEpoch.callCount, 1);
    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('global EPOCH_CREATED outside append state closes and schedules the round', async t => {
    const context = setupRound({
        stateOverrides: { indexerCount: sinon.stub().resolves(3) },
        opsOverrides: {
            collectSignature: sinon.stub().returns(new Promise(() => {})),
        },
    });
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);
    t.absent(next.called);

    await context.state.emit(CustomEventType.EPOCH_CREATED);

    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('a fresh round reads an epoch that advanced since the previous round', async t => {
    const getCurrentEpoch = sinon.stub().resolves(5n);
    const context = setupRound({ stateOverrides: { getCurrentEpoch } });
    t.teardown(context.closeRounds);

    await context.runRound();
    await drainMicrotasks();
    t.is(context.operations.appendSetEpoch.callCount, 1);

    getCurrentEpoch.resolves(6n);
    await context.runRound();

    t.is(context.operations.calculateVDF.callCount, 2);
});
