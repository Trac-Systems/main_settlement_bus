import {
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
} from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import {
    createEpochAppenderSelector,
} from '../../../../src/core/consensus/epochAppenderSelection/createEpochAppenderSelector.js';
import test from 'brittle';
import b4a from 'b4a';
import sinon from 'sinon';
import { EpochAppenderSelector } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelector.js';
import tracCryptoApi from 'trac-crypto-api';
import {
    EpochAppenderSelectionError,
    EpochAppenderSelectionErrorCode,
} from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelectionError.js';
import {
    decodeSelectionState,
    encodeSelectionState,
} from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionStorage.js';
import compatibility from '../../../fixtures/epochAppendCompatibility.js';
import { createSelectionContext as context, selectionKey as key, appendSelected } from '../../../helpers/epochAppenderSelection.js';

const clone = value => JSON.parse(JSON.stringify(value));

function cluster(count) {
    const messages = [];
    const selectionStates = new Map();
    const nodes = [];
    const outcomes = new Map();
    const appends = [];
    const operations = index => ({
        load: async () => selectionStates.get(index),
        save: async selectionState => { selectionStates.set(index, clone(selectionState)); },
        readOutcome: async () => ({ status: outcomes.get(index) ?? EpochAppendOutcome.UNKNOWN }),
    });
    const publish = (index, requestId) => appendSelected(nodes[index], requestId, async (payload, before) => {
        await before({ writerKey: key(index + 10), from: 0 });
        appends.push({ index, payload });
    });
    for (let i = 0; i < count; i++) nodes.push(new EpochAppenderSelector(key(i + 1), operations(i)));
    async function broadcast(request, owner) {
        for (let recipient = 0; recipient < count; recipient++) {
            if (recipient === owner) continue;
            messages.push(() => nodes[recipient].receiveRequest(request, async reply => {
                messages.push(() => nodes[owner].receiveReply(reply, key(recipient + 1)));
            }));
        }
    }
    return { nodes, messages, selectionStates, outcomes, appends, broadcast, publish };
}

test('epoch append: coordination state persistence failure prevents permission and publication', async t => {
    let replies = 0;
    const diskFailure = new Error('disk failure');
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => { throw diskFailure; }
    });
    const { nodes } = cluster(2);
    const request = await nodes[1].createRequest(context(2), b4a.from('proof'));
    const failure = await node.receiveRequest(request, () => { replies++; }).catch(error => error);
    t.ok(failure instanceof EpochAppenderSelectionError);
    t.is(failure.code, EpochAppenderSelectionErrorCode.PERSISTENCE_FAILED);
    t.is(failure.cause, diskFailure);
    await t.exception(() => node.createRequest(context(2), b4a.from('local')));
    t.is(replies, 0);
    await node.close();
    await Promise.all(nodes.map(item => item.close()));
});

test('epoch append: payload bytes and request metadata stay immutable after permission acquisition', async t => {
    const { nodes, appends, publish } = cluster(1);
    const payload = b4a.from('original bytes');
    const request = await nodes[0].createRequest(context(1), payload);
    payload.fill(0);
    request.payloadHash = key(999);
    const exposed = nodes[0].active;
    exposed.payload = '00';
    exposed.request.members.length = 0;
    const selectedPayload = await nodes[0].getSelectedPayload(request.requestId);
    selectedPayload.fill(0);
    await publish(0, request.requestId);
    t.is(appends[0].payload.toString(), 'original bytes');
    t.is(nodes[0].active.request.members.length, 1);
    await nodes[0].close();
});

test('epoch append: a signed-context change while queued prevents the actual append', async t => {
    let release;
    const queue = new Promise(resolve => { release = resolve; });
    let writes = 0;
    let snapshot = { ...context(1), currentWriterKeys: [key(10)] };
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => {},
        readContext: async () => snapshot
    });
    const request = await node.createRequest(snapshot, b4a.from('proof'));
    const publication = appendSelected(node, request.requestId, async (_payload, before) => {
        await queue;
        await before({ writerKey: key(10), from: 0 });
        writes++;
    });
    snapshot = { ...snapshot, configHash: key(999) };
    release();
    await t.exception(() => publication);
    t.is(writes, 0);
    t.is(await node.cancel(request.requestId), true, 'pre-publication cancellation remains safe');
    await node.close();
});

test('epoch append: persisted logical clocks retain precision and refuse overflow', async t => {
    let stored = { version: 1, clock: '9007199254740993', active: null };
    const operations = {
        load: async () => stored, save: async value => { stored = clone(value); },
    };
    let node = new EpochAppenderSelector(key(1), operations);
    const request = await node.createRequest(context(1), b4a.from('proof'));
    t.is(request.logicalCounter, '9007199254740994');
    await node.close();
    node = new EpochAppenderSelector(key(1), operations);
    await t.exception(() => node.createRequest(context(1), b4a.from('too soon')), 'the durable vote survives restart');
    const next = await node.createRequest({ ...context(1), targetEpoch: '8' }, b4a.from('next'));
    t.is(next.logicalCounter, '9007199254740995', 'restart does not reuse a ticket');
    await node.close();
    stored = { version: 1, clock: ((1n << 64n) - 1n).toString(), active: null };
    node = new EpochAppenderSelector(key(1), operations);
    await t.exception(() => node.createRequest(context(1), b4a.from('overflow')));
    await node.close();
});

for (const failSave of [false, true]) {
    test(`epoch appender selection: append waits for durable authorization (${failSave ? 'failed' : 'successful'} save)`, async t => {
        const markerReached = Promise.withResolvers();
        const markerWrite = Promise.withResolvers();
        const diskError = new Error('cannot save append authorization');
        let stored;
        let writes = 0;
        const selector = new EpochAppenderSelector(key(1), {
            load: async () => null,
            save: async value => {
                if (value.active?.phase === EpochAppenderSelectionPhase.PUBLISHING) {
                    markerReached.resolve();
                    await markerWrite.promise;
                }
                stored = clone(value);
            }
        });
        t.teardown(() => selector.close());
        const request = await selector.createRequest(context(1), b4a.from('proof'));
        const execution = appendSelected(selector, request.requestId, async (_payload, beforeAppend) => {
            await beforeAppend({ writerKey: key(10), from: 5 });
            writes++;
        }).catch(error => error);

        await markerReached.promise;
        t.is(writes, 0, 'no append while its authorization is still being saved');
        t.is(stored.active.phase, EpochAppenderSelectionPhase.HELD);
        if (failSave) markerWrite.reject(diskError);
        else markerWrite.resolve();
        const result = await execution;

        if (failSave) {
            t.is(result.code, EpochAppenderSelectionErrorCode.PERSISTENCE_FAILED);
            t.is(result.cause, diskError);
            t.is(writes, 0, 'failed persistence never reaches the writer');
        } else {
            t.is(writes, 1);
            t.is(stored.active.phase, EpochAppenderSelectionPhase.PUBLISHING);
            t.is(stored.active.publication.from, 5);
        }
        await t.exception(() => selector.authorizeAppend(request.requestId, { writerKey: key(10), from: 6 }));
        t.is(writes, failSave ? 0 : 1, 'authorization cannot be reused');
    });
}

test('epoch append: appender selection is always active from the first epoch', async t => {
    const state = { base: { getUserData: async () => null } };
    const wallet = { address: tracCryptoApi.address.encode('trac', b4a.from(key(1), 'hex')) };
    const node = createEpochAppenderSelector(state, wallet, { epochBackoffDelay: 1000 }, () => null);
    t.teardown(() => node.close());
    await node.open();
    t.is(node.enabledFor('0'), false);
    t.is(node.enabledFor('1'), true);
    t.is(node.enabledFor('9007199254740993'), true);
});

test('epoch append: legacy activation metadata does not disable selection or discard durable votes', async t => {
    let stored = { activationEpoch: '7', journal: clone(compatibility.journal) };
    const state = {
        base: {
            getUserData: async () => b4a.from(JSON.stringify(stored)),
            setUserData: async (_key, value) => { stored = JSON.parse(value.toString()); },
        },
    };
    const wallet = {
        address: tracCryptoApi.address.encode('trac', b4a.from(compatibility.request.requester, 'hex')),
    };
    const config = { epochBackoffDelay: 1000 };
    const node = createEpochAppenderSelector(state, wallet, config, () => null);
    t.teardown(() => node.close());
    await node.open();
    t.ok(node.enabledFor('1'));
    t.is(node.active.request.requestId, compatibility.request.requestId);
    t.alike(node.active.publication, compatibility.journal.active.publication);
    t.is(stored.journal.clock, compatibility.journal.clock);
    t.is(stored.journal.vote.request.requestId, compatibility.request.requestId);
});

test('epoch append: permission timeout identifies the missing peer and its last send failure', async t => {
    const clock = sinon.useFakeTimers();
    const snapshot = context(5);
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => {},
        readContext: async () => snapshot,
        sendRequest: async (peer, request) => {
            if (peer === key(2)) return granted(request);
            throw new Error('PeerConnectionManager: no session');
        }
    }, 100, 1000);
    t.teardown(async () => { await node.close(); clock.restore(); });
    const request = await node.createRequest(snapshot, b4a.from('proof'));
    const waiting = node.waitForReplies(request).catch(error => error);
    await clock.tickAsync(1000);
    const error = await waiting;
    t.is(error.code, EpochAppenderSelectionErrorCode.REPLY_TIMEOUT);
    t.is(error.details.received, 1);
    t.is(error.details.required, 2);
    t.is(error.details.requestId, request.requestId);
    t.is(error.details.missingPeers[0].publicKey, key(3));
    t.is(error.details.missingPeers[0].error.message, 'PeerConnectionManager: no session');
    t.ok(error.message.includes('timed out after 1000 ms'));
    t.ok(error.message.includes('epoch=7; replies=1/2'));
    t.ok(error.message.includes(`${key(3)} (PeerConnectionManager: no session)`));
    t.absent(error.message.includes(key(2)), 'the peer that granted permission is not reported missing');
    t.absent(node.active, 'a timed out request is withdrawn before retry');
});

test('epoch append: a three-member timeout without replies cancels pending RPCs', async t => {
    const clock = sinon.useFakeTimers();
    const snapshot = context(3);
    const cancel = sinon.spy();
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => {},
        readContext: async () => snapshot,
        sendRequest: (_peer, _request, lifetime) => {
            lifetime.onPending(cancel);
            return new Promise(() => {});
        }
    }, 100, 1000);
    t.teardown(async () => { await node.close(); clock.restore(); });
    const request = await node.createRequest(snapshot, b4a.from('proof'));
    const waiting = node.waitForReplies(request).catch(error => error);
    await clock.tickAsync(1000);
    const error = await waiting;
    t.ok(error.message.includes('replies=0/1'));
    t.ok(error.message.includes(`${key(2)} (no reply received)`));
    t.is(cancel.callCount, 2);
    t.absent(node.active);
});

test('epoch append: a changed signed context is distinguished from a permission timeout', async t => {
    const snapshot = context(2);
    let current = snapshot;
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => {},
        readContext: async () => current
    });
    t.teardown(() => node.close());
    const request = await node.createRequest(snapshot, b4a.from('proof'));
    current = { ...snapshot, targetEpoch: '8' };
    const failure = await node.waitForReplies(request).catch(error => error);
    t.is(failure.code, EpochAppenderSelectionErrorCode.CONTEXT_CHANGED);
    t.absent(node.active);
});



test('epoch append: pre-refactor coordination state recovers without changing publication identity', async t => {
    const encoded = b4a.from(JSON.stringify({ activationEpoch: '1', journal: compatibility.journal }));
    const selectionState = decodeSelectionState(encoded);
    t.alike(encodeSelectionState(selectionState), encoded, 'the local v1 storage envelope stays byte-compatible');
    t.alike(decodeSelectionState(encodeSelectionState(selectionState)), compatibility.journal);
    const migrations = [];
    const node = new EpochAppenderSelector(compatibility.request.requester, {
        load: async () => selectionState,
        save: async state => { migrations.push(clone(state)); },
        readOutcome: async () => ({ status: EpochAppendOutcome.UNKNOWN }),
    });
    t.teardown(() => node.close());
    await node.open();
    const recovered = node.active;
    t.alike(recovered.publication, compatibility.journal.active.publication);
    t.is(recovered.payload, compatibility.journal.active.payload);
    t.is(recovered.request.requestId, compatibility.journal.active.request.requestId);
    t.is(recovered.request.selectionVersion, 2);
    const exposed = node.active;
    exposed.request.currentWriterKeys.length = 0;
    exposed.publication.from = 999;
    t.alike(node.active, recovered, 'nested snapshots do not expose the durable reservation');
    t.alike(await node.reconcile(), { status: EpochAppendOutcome.UNKNOWN });
    t.is(migrations.length, 1, 'the upgrade is durable and UNKNOWN does not rewrite the marker');
    t.is(migrations[0].version, 2);
    t.alike(migrations[0].active.publication, compatibility.journal.active.publication);
});

test('epoch append: corruption fails recovery with a stable code and original parse error', async t => {
    try {
        decodeSelectionState(b4a.from('{broken'));
        t.fail('invalid JSON must fail recovery');
    } catch (error) {
        t.is(error.code, EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID);
        t.ok(error.cause instanceof SyntaxError);
    }
    try {
        decodeSelectionState(b4a.from(JSON.stringify({ activationEpoch: '1' })));
        t.fail('a stored envelope without its coordination state cannot reset the logical clock');
    } catch (error) {
        t.is(error.code, EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID);
    }
    const selectionState = clone(compatibility.journal);
    selectionState.active.publication.from = -1;
    const node = new EpochAppenderSelector(compatibility.request.requester, {
        load: async () => selectionState,
        save: async () => { t.fail('invalid coordination state must not be overwritten'); },
    });
    t.teardown(() => node.close());
    const error = await node.open().catch(error => error);
    t.is(error.code, EpochAppenderSelectionErrorCode.PUBLICATION_MARKER_INVALID);
});

function granted(request) {
    return { ...request, voteStatus: 1, observedCounter: request.logicalCounter, vote: request };
}
