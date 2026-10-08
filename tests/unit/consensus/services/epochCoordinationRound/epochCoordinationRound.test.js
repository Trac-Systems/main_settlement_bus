import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import {
    ConsensusResultCode,
    CustomEventType,
} from '../../../../../src/utils/constants.js';
import {
    createMessage,
    uint16ToBuffer,
    uint32ToBuffer,
    uint64ToBuffer,
} from '../../../../../src/utils/buffer.js';
import { EpochCoordinationRound } from '../../../../../src/core/consensus/services/EpochCoordinationRound.js';
import { addressToBuffer } from '../../../../../src/core/state/utils/address.js';
import {
    CONFIG,
    drainMicrotasks,
    flush,
    makeConfirmation,
    makeIndexers,
    makeOperations,
    makeState,
} from '../epochCoordinatorTestHelpers.js';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

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
    const rounds = [];

    const createRound = () => {
        const round = new EpochCoordinationRound({
            state,
            wallet,
            config,
            manager,
            logger,
            operations,
            intervalMs: config.epochInterval,
        });
        rounds.push(round);
        return round;
    };

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
        createRound,
        runRound,
        closeRounds: () => Promise.all(rounds.map(round => round.cancel())),
    };
}

test('an absent epoch finishes the round without starting consensus work', async t => {
    const context = setupRound({
        stateOverrides: { getCurrentEpoch: sinon.stub().resolves(null) },
    });
    t.teardown(context.closeRounds);
    const next = sinon.stub();

    await context.runRound(next);

    t.ok(next.calledOnceWith(CONFIG.epochInterval));
    t.absent(context.operations.calculateVDF.called);
});

test('quorum and approvers use the same membership read for an attempt', async t => {
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: { collectSignature: sinon.stub().returns(new Promise(() => {})) },
    });
    t.teardown(context.closeRounds);

    await context.runRound();

    t.is(context.state.getIndexersEntry.callCount, 1);
    t.ok(context.operations.approvers.calledOnceWithExactly(await context.state.getIndexersEntry.firstCall.returnValue));
    t.absent(context.state.indexerCount.called);
});

for (const indexerCount of [1, 2]) {
    test(`quorum is one when the network has ${indexerCount} indexer(s)`, async t => {
        const context = setupRound({
            stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(indexerCount)) },
        });
        t.teardown(context.closeRounds);

        await context.runRound();

        t.absent(context.operations.collectSignature.called);
        t.ok(context.operations.buildSetEpochPayload.calledOnce);
    });
}

test('self and one external approval reach quorum in a three-indexer network', async t => {
    const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: { approvers: sinon.stub().returns(approvers) },
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
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(5)) },
        opsOverrides: { approvers: sinon.stub().returns(approvers), collectSignature },
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
    t.absent(context.operations.collectSignature.called);
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
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: {
            approvers: sinon.stub().returns(approvers),
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
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: { approvers: sinon.stub().returns(approvers) },
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
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: {
            approvers: sinon.stub().returns(approvers),
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
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const approvers = [{ key: b4a.alloc(32, 0x02) }, { key: b4a.alloc(32, 0x03) }];
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onCall(0).resolves(5n);
        getCurrentEpoch.onCall(1).resolves(5n);
        getCurrentEpoch.resolves(6n);
        context = setupRound({
            stateOverrides: {
                getIndexersEntry: sinon.stub().resolves(makeIndexers(3)),
                getCurrentEpoch,
            },
            opsOverrides: {
                approvers: sinon.stub().returns(approvers),
                collectSignature: sinon.stub().rejects(new Error('no signature')),
            },
        });
        const next = sinon.stub();

        await context.runRound(next);
        await drainMicrotasks();
        t.absent(context.state.refresh.called);

        await clock.tickAsync(CONFIG.epochBackoffDelay);

        t.ok(context.state.refresh.calledOnce);
        t.absent(context.operations.buildSetEpochPayload.called);
        t.absent(context.operations.appendSetEpoch.called);
        t.ok(next.calledOnceWith(CONFIG.epochInterval));
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
});

test('approval rejection retries within the same round using the local VDF', async t => {
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const approvers = makeIndexers(3).slice(1);
        const rejection = new Error('epoch mismatch');
        rejection.resultCode = ConsensusResultCode.EPOCH_INVALID;
        context = setupRound({
            stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
            opsOverrides: {
                approvers: sinon.stub().returns(approvers),
                collectSignature: sinon.stub()
                    .onCall(0).rejects(rejection)
                    .onCall(1).rejects(rejection)
                    .resolves(makeConfirmation()),
            },
        });

        await context.runRound();
        await drainMicrotasks();
        t.is(context.operations.collectSignature.callCount, 2);

        await clock.tickAsync(CONFIG.epochBackoffDelay);

        t.is(context.operations.calculateVDF.callCount, 1);
        t.is(context.operations.createProofProposal.callCount, 2);
        t.is(context.operations.collectSignature.callCount, 4);
        t.ok(context.state.refresh.calledOnce);
        t.ok(context.operations.buildSetEpochPayload.calledOnce);
        t.ok(context.operations.appendSetEpoch.calledOnce);
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
});

test('collection timeout traverses BACKOFF and signed-state refresh on the real FSM', async t => {
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onCall(0).resolves(5n);
        getCurrentEpoch.onCall(1).resolves(5n);
        getCurrentEpoch.resolves(6n);
        context = setupRound({
            stateOverrides: {
                getIndexersEntry: sinon.stub().resolves(makeIndexers(3)),
                getCurrentEpoch,
            },
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: {
                approvers: sinon.stub().returns(makeIndexers(3).slice(1)),
                collectSignature: sinon.stub().returns(new Promise(() => {})),
            },
        });
        const next = sinon.stub();

        await context.runRound(next);
        await clock.tickAsync(2000);

        t.ok(context.state.refresh.calledOnce);
        t.absent(context.operations.appendSetEpoch.called);
        t.ok(next.calledOnceWith(CONFIG.epochInterval));
        t.ok(context.logger.warn.calledOnceWithExactly(
            '[EpochCoordinationRound] approval collection failed for epoch 6; ' +
            'entering backoff after receiving 0 of 1 required external approvals.',
        ));
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
});

test('a late approval remains isolated from a later round', async t => {
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const approvers = makeIndexers(3).slice(1);
        let resolveFirst;
        let resolveSecond;
        const collectSignature = sinon.stub().returns(new Promise(() => {}));
        collectSignature.onCall(0).returns(new Promise(resolve => { resolveFirst = resolve; }));
        collectSignature.onCall(2).returns(new Promise(resolve => { resolveSecond = resolve; }));
        const getCurrentEpoch = sinon.stub();
        getCurrentEpoch.onCall(0).resolves(5n);
        getCurrentEpoch.onCall(1).resolves(5n);
        getCurrentEpoch.resolves(6n);
        context = setupRound({
            stateOverrides: {
                getIndexersEntry: sinon.stub().resolves(makeIndexers(3)),
                getCurrentEpoch,
            },
            config: { epochSignatureTimeout: 1000 },
            opsOverrides: { approvers: sinon.stub().returns(approvers), collectSignature },
        });

        await context.runRound();
        await clock.tickAsync(2000);
        t.ok(context.state.refresh.calledOnce);
        await context.runRound();
        t.is(collectSignature.callCount, 4);

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
    getCurrentEpoch.onCall(1).resolves(5n);
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
    const clock = sinon.useFakeTimers();
    let context;
    try {
        const appendSetEpoch = sinon.stub();
        appendSetEpoch.onFirstCall().rejects(new Error('append failed'));
        appendSetEpoch.onSecondCall().resolves();
        context = setupRound({
            opsOverrides: { appendSetEpoch },
        });

        const running = context.runRound();
        await clock.tickAsync(0);
        t.is(context.operations.appendSetEpoch.callCount, 1);

        await clock.tickAsync(CONFIG.epochBackoffDelay);
        await running;

        t.is(context.operations.calculateVDF.callCount, 1);
        t.is(context.operations.createProofProposal.callCount, 2);
        t.is(context.operations.appendSetEpoch.callCount, 2);
        t.ok(context.state.refresh.calledOnce);
    } finally {
        await context?.closeRounds();
        clock.restore();
    }
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
        epoch: uint64ToBuffer(6n),
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
        epoch: uint64ToBuffer(6n),
        proposerAddress: 'trac1peer',
    });
    await flush();

    t.is(context.operations.calculateVDF.callCount, 1);
    t.is(context.operations.appendSetEpoch.callCount, 1);
    t.ok(next.calledOnceWith(CONFIG.epochInterval));
});

test('global EPOCH_CREATED outside append state closes and schedules the round', async t => {
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
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

test('cancel during the epoch preflight prevents the round from starting', async t => {
    const epoch = deferred();
    const context = setupRound({
        stateOverrides: { getCurrentEpoch: sinon.stub().returns(epoch.promise) },
    });
    const round = context.createRound();
    const next = sinon.stub();
    const running = round.run(next);
    await drainMicrotasks();

    await round.cancel();
    epoch.resolve(5n);
    await running;

    t.absent(context.operations.calculateVDF.called);
    t.absent(next.called);
});

test('cancel stops a pending VDF path and ignores its late result', async t => {
    const calculation = deferred();
    const context = setupRound({
        opsOverrides: { calculateVDF: sinon.stub().returns(calculation.promise) },
    });
    const round = context.createRound();
    const next = sinon.stub();
    const running = round.run(next);
    await flush();
    t.ok(context.operations.calculateVDF.calledOnce);

    await round.cancel();
    calculation.resolve({ solution: b4a.alloc(8), difficulty: 100, discriminantSizeBits: 2048 });
    await running;

    t.absent(context.operations.createProofProposal.called);
    t.absent(next.called);
});

test('cancel during manager connection prevents approval requests', async t => {
    const connection = deferred();
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        managerOverrides: { connect: sinon.stub().returns(connection.promise) },
    });
    const round = context.createRound();
    const running = round.run();
    await flush();
    t.ok(context.manager.connect.calledOnce);

    await round.cancel();
    connection.resolve();
    await running;

    t.absent(context.operations.collectSignature.called);
});

test('cancel ignores an approval received after its request was sent', async t => {
    const approval = deferred();
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: {
            approvers: sinon.stub().returns(makeIndexers(3).slice(1)),
            collectSignature: sinon.stub().returns(approval.promise),
        },
    });
    const round = context.createRound();
    await round.run();
    t.is(context.operations.collectSignature.callCount, 2);

    await round.cancel();
    approval.resolve(makeConfirmation());
    await drainMicrotasks();

    t.absent(context.operations.buildSetEpochPayload.called);
});

test('cancel while building the payload prevents a stale append', async t => {
    const payload = deferred();
    const context = setupRound({
        opsOverrides: { buildSetEpochPayload: sinon.stub().returns(payload.promise) },
    });
    const round = context.createRound();
    const running = round.run();
    await flush();
    t.ok(context.operations.buildSetEpochPayload.calledOnce);

    await round.cancel();
    payload.resolve(b4a.alloc(64, 0xdd));
    await running;

    t.absent(context.operations.appendSetEpoch.called);
});

test('cancel ignores a late append failure', async t => {
    const append = deferred();
    const context = setupRound({
        opsOverrides: { appendSetEpoch: sinon.stub().returns(append.promise) },
    });
    const round = context.createRound();
    const next = sinon.stub();
    const running = round.run(next);
    await flush();
    t.ok(context.operations.appendSetEpoch.calledOnce);

    await round.cancel();
    append.reject(new Error('late append failure'));
    await running;

    t.absent(context.logger.error.called);
    t.absent(next.called);
});

test('cancel interrupts the remote-proposal delay', async t => {
    const proposal = deferred();
    const context = setupRound({
        config: { epochRemoteProposalTimeout: 60_000 },
        opsOverrides: { createProofProposal: sinon.stub().returns(proposal.promise) },
    });
    const round = context.createRound();
    const running = round.run();
    await drainMicrotasks();

    await context.state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, {
        proofProposal: { epoch: uint64ToBuffer(6n), previous_epoch_record_hash: b4a.alloc(32, 0xaa) },
    });
    proposal.resolve({ proof_proposal: { epoch: b4a.alloc(8) } });
    await drainMicrotasks();
    await round.cancel();
    await running;

    t.is(context.state.getCurrentEpoch.callCount, 2);
    t.absent(context.operations.buildSetEpochPayload.called);
});

test('cancel interrupts the backoff delay', async t => {
    const context = setupRound({
        config: { epochBackoffDelay: 60_000 },
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
        opsOverrides: {
            approvers: sinon.stub().returns(makeIndexers(3).slice(1)),
            collectSignature: sinon.stub().rejects(new Error('no signature')),
        },
    });
    const round = context.createRound();

    await round.run();
    await drainMicrotasks();
    t.ok(context.logger.warn.calledOnce);

    await round.cancel();

    t.absent(context.state.refresh.called);
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

test('retry after shrinking from five to two indexers drops old approvals and uses quorum one', async t => {
    const clock = sinon.useFakeTimers();
    const collectSignature = sinon.stub().returns(new Promise(() => {}));
    collectSignature.onFirstCall().resolves(makeConfirmation());
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(5)) },
        opsOverrides: { collectSignature },
    });
    try {
        await context.runRound();
        await clock.tickAsync(0);
        const previousCollection = collectSignature.firstCall.args[3];
        t.is(previousCollection.approvals.length, 1);
        t.absent(context.operations.buildSetEpochPayload.called);

        context.state.getIndexersEntry.resolves(makeIndexers(2));
        await clock.tickAsync(CONFIG.epochSignatureTimeout + CONFIG.epochBackoffDelay);

        t.ok(previousCollection.closed);
        t.is(collectSignature.callCount, 4);
        t.is(context.operations.calculateVDF.callCount, 1);
        t.alike(context.operations.buildSetEpochPayload.firstCall.args[1], []);
        t.ok(context.operations.appendSetEpoch.calledOnce);
    } finally {
        await context.closeRounds();
        clock.restore();
    }
});

test('retry after growing from two to five indexers requires two new external approvals', async t => {
    const clock = sinon.useFakeTimers();
    const firstApproval = deferred();
    const secondApproval = deferred();
    const collectSignature = sinon.stub().returns(new Promise(() => {}));
    collectSignature.onCall(0).returns(firstApproval.promise);
    collectSignature.onCall(1).returns(secondApproval.promise);
    const appendSetEpoch = sinon.stub().resolves();
    appendSetEpoch.onFirstCall().rejects(new Error('append failed'));
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(2)) },
        opsOverrides: { collectSignature, appendSetEpoch },
    });
    try {
        const running = context.runRound();
        await clock.tickAsync(0);
        t.ok(appendSetEpoch.calledOnce);
        t.absent(collectSignature.called);

        context.state.getIndexersEntry.resolves(makeIndexers(5));
        await clock.tickAsync(CONFIG.epochBackoffDelay);
        await running;
        t.is(collectSignature.callCount, 4);

        firstApproval.resolve(makeConfirmation());
        await clock.tickAsync(0);
        t.is(appendSetEpoch.callCount, 1);
        secondApproval.resolve(makeConfirmation());
        await clock.tickAsync(0);

        t.is(appendSetEpoch.callCount, 2);
        t.is(context.operations.buildSetEpochPayload.lastCall.args[1].length, 2);
        t.is(context.operations.calculateVDF.callCount, 1);
    } finally {
        await context.closeRounds();
        clock.restore();
    }
});

for (const replacementSize of [3, 5]) {
    test(`membership change before append restarts collection with ${replacementSize} indexers`, async t => {
        const oldApproval = deferred();
        const newFirstApproval = deferred();
        const newSecondApproval = deferred();
        const collectSignature = sinon.stub().returns(new Promise(() => {}));
        collectSignature.onCall(0).returns(oldApproval.promise);
        collectSignature.onCall(2).returns(newFirstApproval.promise);
        collectSignature.onCall(3).returns(newSecondApproval.promise);
        const originalIndexers = makeIndexers(3);
        const replacement = [originalIndexers[0], ...makeIndexers(replacementSize + 1).slice(2)];
        const context = setupRound({
            stateOverrides: { getIndexersEntry: sinon.stub().resolves(originalIndexers) },
            opsOverrides: { collectSignature },
        });
        t.teardown(context.closeRounds);
        await context.runRound();

        context.state.getIndexersEntry.resolves(replacement);
        oldApproval.resolve(makeConfirmation());
        await flush();

        t.absent(context.operations.appendSetEpoch.called);
        t.is(collectSignature.callCount, 2 + replacementSize - 1);
        t.alike(collectSignature.getCalls().slice(2).map(call => call.args[0]), replacement.slice(1));
        const freshConfirmation = makeConfirmation();
        newFirstApproval.resolve(freshConfirmation);
        await flush();
        if (replacementSize === 5) {
            t.absent(context.operations.appendSetEpoch.called);
            newSecondApproval.resolve(makeConfirmation());
            await flush();
        }

        t.ok(context.operations.appendSetEpoch.calledOnce);
        t.is(context.operations.buildSetEpochPayload.callCount, 2);
        t.is(context.operations.buildSetEpochPayload.lastCall.args[1][0], freshConfirmation);
        t.ok(context.operations.calculateVDF.calledOnce);
    });
}

test('membership order and buffer identity do not restart approval collection', async t => {
    const getIndexersEntry = sinon.stub().resolves(makeIndexers(3).reverse());
    getIndexersEntry.onFirstCall().resolves(makeIndexers(3));
    const context = setupRound({ stateOverrides: { getIndexersEntry } });
    t.teardown(context.closeRounds);

    await context.runRound();
    await flush();

    t.ok(context.operations.approvers.calledOnce);
    t.is(context.operations.collectSignature.callCount, 2);
    t.ok(context.operations.appendSetEpoch.calledOnce);
});

for (const phase of ['backoff', 'next attempt']) {
    for (const rejected of [false, true]) {
        test(`a late ${rejected ? 'rejection' : 'approval'} during ${phase} cannot affect a retried collection`, async t => {
            const clock = sinon.useFakeTimers();
            const lateResponse = deferred();
            const collectSignature = sinon.stub().returns(new Promise(() => {}));
            collectSignature.onFirstCall().returns(lateResponse.promise);
            const context = setupRound({
                stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(3)) },
                opsOverrides: { collectSignature },
            });
            try {
                await context.runRound();
                const oldCollection = collectSignature.firstCall.args[3];
                await clock.tickAsync(CONFIG.epochSignatureTimeout);
                t.ok(oldCollection.closed);
                context.state.getIndexersEntry.resolves(makeIndexers(5));
                if (phase === 'next attempt') await clock.tickAsync(CONFIG.epochBackoffDelay);

                if (rejected) lateResponse.reject(new Error('late rejection'));
                else lateResponse.resolve(makeConfirmation());
                await clock.tickAsync(0);

                t.alike(oldCollection.approvals, []);
                t.alike(oldCollection.rejections, []);
                t.absent(context.operations.buildSetEpochPayload.called);
                t.ok(context.logger.warn.calledOnce);
                if (phase === 'next attempt') {
                    t.is(collectSignature.callCount, 6);
                    t.absent(collectSignature.lastCall.args[3].closed);
                }
            } finally {
                await context.closeRounds();
                clock.restore();
            }
        });
    }
}

test('unreachable peers do not reduce quorum on retry when State membership is unchanged', async t => {
    const clock = sinon.useFakeTimers();
    const collectSignature = sinon.stub().returns(new Promise(() => {}));
    for (let i = 0; i < 4; i++) collectSignature.onCall(i).rejects(new Error('peer is banned or disconnected'));
    collectSignature.onCall(4).resolves(makeConfirmation());
    const context = setupRound({
        stateOverrides: { getIndexersEntry: sinon.stub().resolves(makeIndexers(5)) },
        opsOverrides: { collectSignature },
    });
    try {
        await context.runRound();
        await clock.tickAsync(CONFIG.epochBackoffDelay);

        t.is(collectSignature.callCount, 8);
        t.is(collectSignature.lastCall.args[3].approvals.length, 1);
        t.absent(context.operations.buildSetEpochPayload.called);
        t.absent(context.operations.appendSetEpoch.called);
    } finally {
        await context.closeRounds();
        clock.restore();
    }
});

for (const indexers of [[], makeIndexers(3).slice(1)]) {
    test(`a local writer absent from ${indexers.length} indexers cannot count its own approval`, async t => {
        const context = setupRound({
            stateOverrides: { getIndexersEntry: sinon.stub().resolves(indexers) },
        });
        t.teardown(context.closeRounds);
        const next = sinon.stub();

        await context.runRound(next);

        t.absent(context.operations.collectSignature.called);
        t.absent(context.operations.buildSetEpochPayload.called);
        t.absent(context.operations.appendSetEpoch.called);
        t.ok(next.calledOnceWith(CONFIG.epochInterval));
    });
}
