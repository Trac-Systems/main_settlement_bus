import test from 'brittle';
import b4a from 'b4a';
import { EpochAppenderSelector } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelector.js';
import {
    validateSelectionState,
    EpochAppenderSelectionPhase,
    EpochAppenderVoteStatus,
    EpochAppendOutcome,
} from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import { EpochAppenderSelectionErrorCode } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelectionError.js';
import { EPOCH_APPENDER_SELECTION_MAX_COUNTER, EPOCH_APPENDER_SELECTION_COUNTER_LIMIT, EPOCH_APPENDER_SELECTION_COUNTER_STEP } from '../../../../src/utils/constants.js';
import { encodeSelectionState, decodeSelectionState } from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionStorage.js';
import { createSelectionContext, selectionKey } from '../../../helpers/epochAppenderSelection.js';

for (const counter of [EPOCH_APPENDER_SELECTION_MAX_COUNTER, EPOCH_APPENDER_SELECTION_MAX_COUNTER - 1n,
    EPOCH_APPENDER_SELECTION_COUNTER_LIMIT + 1n]) {
    test(`unsafe REQUEST and REPLY counters leave votes and clock unchanged: ${counter}`, async t => {
        const fixture = createCounterFixture(t);
        const localRequest = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('proof'));
        const savedBefore = fixture.stored;
        let replies = 0;
        const requestError = await fixture.selector.handleSelectionRequest(
            savedVoteRequest(counter), () => { replies++; }
        ).catch(error => error);
        t.is(requestError.code, EpochAppenderSelectionErrorCode.LOGICAL_COUNTER_INVALID);
        const replyError = await fixture.selector.handleSelectionReply({
            ...localRequest, voteStatus: EpochAppenderVoteStatus.GRANTED,
            observedCounter: counter, vote: localRequest,
        }, selectionKey(2)).catch(error => error);
        t.is(replyError.code, EpochAppenderSelectionErrorCode.REQUEST_STALE);
        t.alike(fixture.stored, savedBefore);
        t.is(replies, 0);
        await fixture.restart();
        t.is(fixture.stored.clock, savedBefore.clock, 'restart does not retain a hostile counter');
    });
}

test('REQUEST counters below the wire limit can advance the clock by only one bounded step', async t => {
    const fixture = createCounterFixture(t);
    const localRequest = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('local proof'));
    const peerRequest = savedVoteRequest(EPOCH_APPENDER_SELECTION_COUNTER_LIMIT - 10n);
    let replies = 0;
    t.is(await fixture.selector.handleSelectionRequest(peerRequest, () => { replies++; }), false);
    t.is(fixture.stored.clock, 1n + EPOCH_APPENDER_SELECTION_COUNTER_STEP);
    t.is(fixture.stored.vote.request.requestId, localRequest.requestId, 'no vote is stored for the large term');
    t.is(replies, 0);
    await fixture.selector.cancel(localRequest.requestId);
    const retry = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('retry'));
    t.is(retry.logicalCounter, 2n + EPOCH_APPENDER_SELECTION_COUNTER_STEP);
});

test('a correlated GRANTED reply cannot copy an arbitrary observed counter into storage', async t => {
    const fixture = createCounterFixture(t);
    const request = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('proof'));
    await fixture.selector.handleSelectionReply({
        ...request, voteStatus: EpochAppenderVoteStatus.GRANTED,
        observedCounter: EPOCH_APPENDER_SELECTION_COUNTER_LIMIT - 10n, vote: request,
    }, selectionKey(2));
    t.is(fixture.stored.clock, 1n + EPOCH_APPENDER_SELECTION_COUNTER_STEP);
    t.is(fixture.selector.activeReservation.phase, EpochAppenderSelectionPhase.HELD);
    await fixture.selector.cancel(request.requestId);
    const retry = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('retry'));
    t.is(retry.logicalCounter, 2n + EPOCH_APPENDER_SELECTION_COUNTER_STEP);
});

test('repeated requests let a lagging voter catch up without skipping the counter bound', async t => {
    const fixture = createCounterFixture(t);
    const request = savedVoteRequest(EPOCH_APPENDER_SELECTION_COUNTER_STEP * 3n + 1n);
    let reply;
    for (let step = 1n; step <= 3n; step++) {
        t.is(await fixture.selector.handleSelectionRequest(request, value => { reply = value; }), false);
        t.is(fixture.stored.clock, step * EPOCH_APPENDER_SELECTION_COUNTER_STEP);
        t.absent(fixture.stored.vote);
    }
    t.absent(reply);
    t.is(await fixture.selector.handleSelectionRequest(request, value => { reply = value; }), true);
    t.is(reply.voteStatus, EpochAppenderVoteStatus.GRANTED);
    t.is(fixture.stored.clock, request.logicalCounter);
});

for (const observedCounter of [EPOCH_APPENDER_SELECTION_MAX_COUNTER, EPOCH_APPENDER_SELECTION_COUNTER_LIMIT - 4096n]) {
    test(`recovering an inflated clock keeps the last vote and forbids another candidate in its term: ${observedCounter}`, async t => {
        const request = savedVoteRequest(7n);
        const fixture = createCounterFixture(t, {
            version: 2, clock: observedCounter.toString(),
            active: null, vote: { request, expiresAt: 0 },
        });
        await fixture.selector.open();
        t.is(fixture.stored.version, 3);
        t.is(fixture.stored.clock, 7n);
        await fixture.restart();
        let reply;
        await fixture.selector.handleSelectionRequest({
            ...request, requestId: 'different-candidate', requester: selectionKey(3),
        }, value => { reply = value; });
        t.is(reply.voteStatus, EpochAppenderVoteStatus.STALE);
        t.is(fixture.stored.vote.request.requestId, request.requestId);
        const next = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('proof'));
        t.is(next.logicalCounter, 8n);
    });
}

test('an exhausted saved vote needs a newer signed epoch and blocks old requests after recovery', async t => {
    const request = savedVoteRequest(EPOCH_APPENDER_SELECTION_MAX_COUNTER);
    const fixture = createCounterFixture(t, {
        version: 2, clock: request.logicalCounter, active: null, vote: { request, expiresAt: 0 },
    });
    await fixture.selector.open();
    for (const change of [() => {}, () => { fixture.context.configHash = selectionKey(900); }, () => {
        fixture.context.members = fixture.context.members.filter(member => member.publicKey !== request.requester);
        fixture.context.membershipContext = selectionKey(901);
    }]) {
        change();
        const error = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('proof')).catch(error => error);
        t.is(error.code, EpochAppenderSelectionErrorCode.LOGICAL_CLOCK_EXHAUSTED);
        t.alike(fixture.stored.vote.request, request, 'timeout and context changes within the epoch cannot erase a vote');
        await fixture.restart();
    }
    const forgedContext = { ...fixture.context, targetEpoch: '8' };
    const error = await fixture.selector.createSelectionRequest(forgedContext, b4a.from('proof')).catch(error => error);
    t.is(error.code, EpochAppenderSelectionErrorCode.CONTEXT_CHANGED, 'the caller cannot claim signed epoch progress');
    fixture.context.targetEpoch = '8';
    fixture.context.parentHash = selectionKey(902);
    const recovered = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('new epoch'));
    t.is(recovered.logicalCounter, 1n);
    t.is(fixture.stored.minimumElectionEpoch, '8');
    await fixture.restart();
    const oldRequest = { ...request, logicalCounter: 2n, requestId: 'delayed-old-epoch' };
    const stale = await fixture.selector.handleSelectionRequest(oldRequest, () => t.fail('old epoch must not receive a vote')).catch(error => error);
    t.is(stale.code, EpochAppenderSelectionErrorCode.REQUEST_STALE);
    t.is(fixture.stored.vote.request.requestId, recovered.requestId);
});

test('clock recovery keeps a pending publication until its outcome has been checked', async t => {
    const request = { ...savedVoteRequest(EPOCH_APPENDER_SELECTION_MAX_COUNTER), requester: selectionKey(1) };
    const publication = { writerKey: selectionKey(10), from: 3, payloadHash: request.payloadHash, targetEpoch: '7' };
    const fixture = createCounterFixture(t, {
        version: 2, clock: request.logicalCounter, vote: { request, expiresAt: 0 },
        active: { request, payload: 'abcd', publication, phase: EpochAppenderSelectionPhase.PUBLISHING, expiresAt: 0, solo: false },
    });
    fixture.context.targetEpoch = '8';
    const blocked = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('new epoch')).catch(error => error);
    t.is(blocked.code, EpochAppenderSelectionErrorCode.PUBLICATION_UNRESOLVED);
    t.alike(fixture.stored.active.publication, publication);
    fixture.operations.readOutcome = async () => ({ status: EpochAppendOutcome.EPOCH_ADVANCED });
    await fixture.selector.refreshAppendOutcome();
    const recovered = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('new epoch'));
    t.is(recovered.logicalCounter, 1n);
    t.is(fixture.stored.minimumElectionEpoch, '8');
});

test('an uncertain recovery save prevents votes and keeps the epoch floor after restart', async t => {
    const request = savedVoteRequest(EPOCH_APPENDER_SELECTION_MAX_COUNTER);
    const fixture = createCounterFixture(t, {
        version: 3, minimumElectionEpoch: '0', clock: request.logicalCounter,
        active: null, vote: { request, expiresAt: 0 },
    });
    await fixture.selector.open();
    fixture.context.targetEpoch = '8';
    const save = fixture.operations.save;
    fixture.operations.save = async value => {
        await save(value);
        throw new Error('write completed but acknowledgement failed');
    };
    const failure = await fixture.selector.createSelectionRequest(fixture.context, b4a.from('proof')).catch(error => error);
    t.is(failure.code, EpochAppenderSelectionErrorCode.PERSISTENCE_FAILED);
    t.is(fixture.stored.minimumElectionEpoch, '8');
    const savedRequest = fixture.stored.vote.request;
    const contender = { ...savedRequest, requester: selectionKey(2), requestId: 'another-candidate' };
    const stopped = await fixture.selector.handleSelectionRequest(contender, () => t.fail('failed storage must stop replies')).catch(error => error);
    t.is(stopped.code, EpochAppenderSelectionErrorCode.PERSISTENCE_FAILED);
    fixture.operations.save = save;
    await fixture.restart();
    let reply;
    await fixture.selector.handleSelectionRequest(contender, value => { reply = value; });
    t.is(reply.voteStatus, EpochAppenderVoteStatus.STALE);
    t.is(fixture.stored.vote.request.requestId, savedRequest.requestId);
});

test('peer requests cannot reset an exhausted vote without a newer local signed context', async t => {
    const request = savedVoteRequest(EPOCH_APPENDER_SELECTION_MAX_COUNTER);
    const fixture = createCounterFixture(t, {
        version: 2, clock: request.logicalCounter, active: null, vote: { request, expiresAt: 0 },
    });
    const nextRequest = { ...request, targetEpoch: '8', logicalCounter: 1n, requestId: 'next-epoch' };
    const changedContext = await fixture.selector.handleSelectionRequest(nextRequest,
        () => t.fail('peer claims cannot authorize recovery')).catch(error => error);
    t.is(changedContext.code, EpochAppenderSelectionErrorCode.CONTEXT_CHANGED);
    t.alike(fixture.stored.vote.request, request);
    fixture.operations.readContext = undefined;
    const missingContext = await fixture.selector.handleSelectionRequest(nextRequest,
        () => t.fail('recovery needs a local signed context')).catch(error => error);
    t.is(missingContext.code, EpochAppenderSelectionErrorCode.LOGICAL_CLOCK_EXHAUSTED);
    t.alike(fixture.stored.vote.request, request);
    fixture.context.targetEpoch = '8';
    fixture.operations.readContext = async () => ({ ...fixture.context });
    let reply;
    t.is(await fixture.selector.handleSelectionRequest(nextRequest, value => { reply = value; }), true);
    t.is(reply.voteStatus, EpochAppenderVoteStatus.GRANTED);
    t.is(fixture.stored.minimumElectionEpoch, '8');
    await fixture.restart();
    const contender = { ...nextRequest, requester: selectionKey(3), requestId: 'another-candidate' };
    await fixture.selector.handleSelectionRequest(contender, value => { reply = value; });
    t.is(reply.voteStatus, EpochAppenderVoteStatus.STALE, 'recovery cannot grant another vote in the new term');
});

test('recovery rejects a reservation whose durable vote is missing or older', async t => {
    for (const vote of [null, { request: savedVoteRequest(7n), expiresAt: 0 }]) {
        const request = { ...savedVoteRequest(EPOCH_APPENDER_SELECTION_MAX_COUNTER), requester: selectionKey(1) };
        const fixture = createCounterFixture(t, {
            version: 2, clock: request.logicalCounter, vote,
            active: { request, payload: 'abcd', publication: null, phase: EpochAppenderSelectionPhase.REQUESTING, expiresAt: 0, solo: false },
        });
        const error = await fixture.selector.open().catch(error => error);
        t.is(error.code, EpochAppenderSelectionErrorCode.RESERVATION_INVALID);
        t.is(fixture.stored.clock, request.logicalCounter, 'inconsistent storage cannot silently reset the clock');
    }
});

test('selection storage keeps decimal bytes and restores precise BigInt counters', t => {
    for (const counter of [0n, 9007199254740993n, EPOCH_APPENDER_SELECTION_MAX_COUNTER]) {
        const state = {
            version: 3, clock: counter, minimumElectionEpoch: '0', active: null,
            vote: counter > 0n ? { request: savedVoteRequest(counter), expiresAt: 0 } : null,
        };
        const encoded = encodeSelectionState(state);
        const envelope = JSON.parse(b4a.toString(encoded));
        t.is(envelope.journal.clock, counter.toString(), 'JSON keeps the existing decimal format');
        if (state.vote) {
            t.is(envelope.journal.vote.request.logicalCounter, counter.toString());
        }
        const decoded = decodeSelectionState(encoded);
        t.alike(decoded, state, 'reading storage preserves the exact counter and its type');
        validateSelectionState(decoded, selectionKey(1));
        t.alike(encodeSelectionState(decoded), encoded, 'reading and saving preserves the bytes');
    }
});

test('selection storage rejects malformed numeric fields before recovery', t => {
    const invalidValues = [
        null, false, 1, Number.MAX_SAFE_INTEGER + 1,
        '', '-1', '1.5', '1e3', '0x10', '+1', ' 1', '1 ', '01', 'not-a-number',
        (EPOCH_APPENDER_SELECTION_MAX_COUNTER + 1n).toString(),
    ];
    for (const field of ['clock', 'logicalCounter', 'minimumElectionEpoch', 'targetEpoch']) {
        for (const value of invalidValues) {
            const stored = JSON.parse(b4a.toString(encodeSelectionState({
                version: 3, clock: 7n, minimumElectionEpoch: '0', active: null,
                vote: { request: savedVoteRequest(7n), expiresAt: 0 },
            })));
            const record = field === 'logicalCounter' || field === 'targetEpoch'
                ? stored.journal.vote.request : stored.journal;
            record[field] = value;
            try {
                decodeSelectionState(b4a.from(JSON.stringify(stored)));
                t.fail(`invalid ${field} must prevent recovery: ${value}`);
            } catch (error) {
                t.is(error.code, EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID);
            }
        }
    }
});

function savedVoteRequest(counter) {
    return {
        ...createSelectionContext(3), requestId: 'saved-vote', requester: selectionKey(2),
        logicalCounter: counter, payloadHash: selectionKey(200), selectionVersion: 2,
    };
}

function createCounterFixture(t, initialState = null) {
    let stored = initialState && encodeSelectionState(initialState);
    const context = createSelectionContext(3);
    const operations = {
        load: async () => stored && decodeSelectionState(stored),
        save: async value => { stored = encodeSelectionState(value); },
        readContext: async () => ({ ...context }),
        readOutcome: async () => ({ status: EpochAppendOutcome.UNKNOWN }),
    };
    let selector = new EpochAppenderSelector(selectionKey(1), operations);
    t.teardown(() => selector.close());
    return {
        context, operations,
        get selector() { return selector; },
        get stored() { return stored && decodeSelectionState(stored); },
        async restart() {
            await selector.close();
            selector = new EpochAppenderSelector(selectionKey(1), operations);
            await selector.open();
        },
    };
}
