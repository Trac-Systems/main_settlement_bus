import test from 'brittle';
import b4a from 'b4a';
import sinon from 'sinon';
import { EpochAppenderSelector } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelector.js';
import { EpochAppenderVoteStatus, EpochAppendOutcome } from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import { EpochAppenderSelectionErrorCode } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelectionError.js';
import { createSelectionContext as context, selectionKey as key } from '../../../helpers/epochAppenderSelection.js';

test('three indexers elect an appender with one indexer offline', async t => {
    const nodes = [0, 1].map(index => new EpochAppenderSelector(key(index + 1), {
        load: async () => null,
        save: async () => {},
    }));
    t.teardown(() => Promise.all(nodes.map(node => node.close())));
    const request = await nodes[0].createRequest(context(3), b4a.from('proof'));
    await nodes[1].receiveRequest(request, reply => nodes[0].receiveReply(reply ?? request, key(2)));
    t.is(nodes[0].active.phase, 'HELD', 'own vote and one peer form a majority of three');
});

function cluster(t, count, { clock = false } = {}) {
    const timer = clock ? sinon.useFakeTimers() : null;
    const stored = new Map();
    const disconnected = new Set();
    const snapshot = context(count);
    const nodes = [];
    const operations = index => ({
        load: async () => stored.get(index),
        save: async value => { stored.set(index, JSON.parse(JSON.stringify(value))); },
        readContext: async () => snapshot,
        readOutcome: async () => ({ status: EpochAppendOutcome.UNKNOWN }),
        sendRequest: async (peer, request) => {
            const recipient = snapshot.members.findIndex(member => member.publicKey === peer);
            if (disconnected.has(recipient) || disconnected.has(index)) throw new Error('offline');
            let response;
            await nodes[recipient].receiveRequest(request, reply => { response = reply; });
            return response;
        },
    });
    function create(index) {
        return new EpochAppenderSelector(key(index + 1), operations(index), 10, 1000);
    }
    for (let index = 0; index < count; index++) nodes.push(create(index));
    t.teardown(async () => {
        await Promise.all(nodes.map(node => node.close()));
        timer?.restore();
    });
    async function request(index) {
        return nodes[index].createRequest(snapshot, b4a.from(`proof-${index}`));
    }
    async function deliver(request, recipient, owner) {
        let response;
        await nodes[recipient].receiveRequest(request, reply => { response = reply; });
        if (owner !== undefined) await nodes[owner].receiveReply(response, key(recipient + 1));
        return response;
    }
    return { nodes, stored, disconnected, snapshot, timer, create, request, deliver };
}

for (const [count, votes] of [[1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [6, 4], [7, 4]]) {
    test(`appender election with ${count} members requires ${votes} votes before fallback`, async t => {
        const f = cluster(t, count);
        const request = await f.request(0);
        for (let peer = 1; peer < votes; peer++) {
            t.is(f.nodes[0].active.phase, 'REQUESTING', 'a minority cannot authorize an append');
            await f.deliver(request, peer, 0);
        }
        t.is(f.nodes[0].active.phase, 'HELD');
    });
}

test('a durable vote survives restart and cannot change within the same term, even after timeout', async t => {
    const f = cluster(t, 3, { clock: true });
    const first = await f.request(0);
    const other = await f.request(1);
    t.is((await f.deliver(first, 2)).voteStatus, EpochAppenderVoteStatus.GRANTED);
    await f.nodes[2].close();
    f.nodes[2] = f.create(2);
    t.is((await f.deliver(other, 2)).voteStatus, EpochAppenderVoteStatus.STALE);
    await f.timer.tickAsync(1001);
    t.is((await f.deliver(other, 2)).voteStatus, EpochAppenderVoteStatus.STALE, 'expiry does not erase the previous vote');
    t.is((await f.deliver(first, 2)).voteStatus, EpochAppenderVoteStatus.STALE, 'an old grant is not renewed');
    await f.nodes[1].cancel(other.requestId);
    const next = await f.request(1);
    t.ok(BigInt(next.logicalCounter) > BigInt(first.logicalCounter));
    t.is((await f.deliver(next, 2, 1)).voteStatus, EpochAppenderVoteStatus.GRANTED);
    t.is(f.nodes[1].active.phase, 'HELD');
});

test('an expired selected appender cannot use a queued authorization after voting for its successor', async t => {
    const f = cluster(t, 3, { clock: true });
    const first = await f.request(0);
    await f.deliver(first, 1, 0);
    await f.nodes[0].getSelectedPayload(first.requestId);
    await f.timer.tickAsync(1001);
    const successor = await f.request(1);
    await f.deliver(successor, 0, 1);
    t.is(f.nodes[1].active.phase, 'HELD');
    await t.exception(() => f.nodes[0].authorizeAppend(first.requestId, { writerKey: key(10), from: 0 }));
    t.absent(f.nodes[0].active);
    t.is(f.stored.get(0).vote.request.requestId, successor.requestId);
});

test('an unresolved append allows a later election without claiming that the old write was rejected', async t => {
    const f = cluster(t, 3, { clock: true });
    const first = await f.request(0);
    await f.deliver(first, 1, 0);
    await f.nodes[0].authorizeAppend(first.requestId, { writerKey: key(10), from: 0 });
    t.alike(await f.nodes[0].reconcile(), { status: EpochAppendOutcome.UNKNOWN });
    await f.timer.tickAsync(1001);
    const successor = await f.request(1);
    await f.deliver(successor, 0, 1);
    t.is(f.nodes[1].active.phase, 'HELD');
    t.alike(await f.nodes[0].reconcile(), { status: EpochAppendOutcome.SELECTION_EXPIRED });
    t.alike(f.nodes[0].outcomeFor(first.requestId), { status: EpochAppendOutcome.SELECTION_EXPIRED });
});

for (const count of [2, 3]) {
    test(`an unanswered timeout ${count === 2 ? 'permits' : 'forbids'} a solo append with ${count} members`, async t => {
        const f = cluster(t, count, { clock: true });
        for (let index = 1; index < count; index++) f.disconnected.add(index);
        const request = await f.request(0);
        const waiting = f.nodes[0].waitForReplies(request).catch(error => error);
        await f.timer.tickAsync(999);
        t.is(f.nodes[0].active.phase, 'REQUESTING');
        await f.timer.tickAsync(1);
        const result = await waiting;
        if (count === 2) {
            t.is(result, undefined);
            t.is(f.nodes[0].active.phase, 'HELD');
            t.is(f.nodes[0].active.solo, true);
        } else {
            t.is(result.code, EpochAppenderSelectionErrorCode.REPLY_TIMEOUT);
            t.absent(f.nodes[0].active);
        }
    });
}

test('a two-member partition may elect both sides only after the unanswered timeout', async t => {
    const f = cluster(t, 2, { clock: true });
    f.disconnected.add(0);
    const requests = await Promise.all([f.request(0), f.request(1)]);
    const waiting = f.nodes.map((node, index) => node.waitForReplies(requests[index]));
    await f.timer.tickAsync(999);
    t.ok(f.nodes.every(node => node.active.phase === 'REQUESTING'));
    await f.timer.tickAsync(1);
    await Promise.all(waiting);
    t.ok(f.nodes.every(node => node.active.phase === 'HELD' && node.active.solo), 'the explicitly accepted two-member availability exception');
});

test('a responsive peer denying a two-member election never triggers a solo fallback', async t => {
    const f = cluster(t, 2, { clock: true });
    const request = await f.request(0);
    await f.request(1);
    const waiting = f.nodes[0].waitForReplies(request).catch(error => error);
    await f.timer.tickAsync(1000);
    t.is((await waiting).code, EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE);
    t.absent(f.nodes[0].active);
});

test('a split election retries in a higher term and can then reach a majority', async t => {
    const f = cluster(t, 3, { clock: true });
    const requests = await Promise.all(f.nodes.map((_node, index) => f.request(index)));
    const waiting = f.nodes.map((node, index) => node.waitForReplies(requests[index]).catch(error => error));
    await f.timer.tickAsync(1000);
    t.ok((await Promise.all(waiting)).every(error => error.code === EpochAppenderSelectionErrorCode.REPLIES_INCOMPLETE));
    const retry = await f.request(1);
    await f.nodes[1].waitForReplies(retry);
    t.is(f.nodes[1].active.phase, 'HELD');
    t.ok(BigInt(retry.logicalCounter) > BigInt(requests[1].logicalCounter));
});

test('duplicate and stale votes cannot satisfy a new five-member election', async t => {
    const f = cluster(t, 5);
    const old = await f.request(0);
    const stale = await f.deliver(old, 1);
    await f.nodes[0].cancel(old.requestId);
    const current = await f.request(0);
    await f.nodes[0].receiveReply(stale, key(2));
    const response = await f.deliver(current, 2, 0);
    await f.nodes[0].receiveReply(response, key(3));
    t.is(f.nodes[0].active.phase, 'REQUESTING');
    await t.exception(() => f.nodes[0].receiveReply(response, key(99)));
    await f.nodes[0].receiveReply({ ...response, payloadHash: key(999) }, key(4));
    t.is(f.nodes[0].active.phase, 'REQUESTING');
    await f.deliver(current, 3, 0);
    t.is(f.nodes[0].active.phase, 'HELD');
});

test('authorization checks its deadline again after a slow durable marker write', async t => {
    const timer = sinon.useFakeTimers();
    const gate = Promise.withResolvers();
    const started = Promise.withResolvers();
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async state => {
            if (state.active?.phase === 'PUBLISHING') {
                started.resolve();
                await gate.promise;
            }
        },
    }, undefined, 1000);
    t.teardown(async () => { gate.resolve(); await node.close(); timer.restore(); });
    const request = await node.createRequest(context(1), b4a.from('proof'));
    const publication = node.authorizeAppend(request.requestId, { writerKey: key(10), from: 0 }).catch(error => error);
    await started.promise;
    await timer.tickAsync(1001);
    gate.resolve();
    t.is((await publication).code, EpochAppenderSelectionErrorCode.ELECTION_SUPERSEDED);
});

for (const count of [3, 4, 5, 6, 7]) {
    test(`${count} contenders with reordered campaigns and replies never elect two appenders before expiry`, async t => {
        const timer = sinon.useFakeTimers();
        t.teardown(() => timer.restore());
        for (let seed = 1; seed <= 20; seed++) {
            const f = cluster(t, count);
            const messages = [];
            let random = seed;
            let maximum = 0;
            function broadcast(request, owner) {
                for (let recipient = 0; recipient < count; recipient++) {
                    if (recipient === owner) continue;
                    messages.push(async () => {
                        await f.nodes[recipient].receiveRequest(request, response => {
                            messages.push(() => f.nodes[owner].receiveReply(response, key(recipient + 1)));
                        });
                    });
                }
            }
            for (let index = 0; index < count; index++) {
                messages.push(async () => {
                    try {
                        broadcast(await f.request(index), index);
                    } catch (error) {
                        if (error.code !== EpochAppenderSelectionErrorCode.ELECTION_BUSY) throw error;
                    }
                });
            }
            while (messages.length) {
                random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
                await messages.splice(random % messages.length, 1)[0]();
                const elected = f.nodes.filter(node => node.active?.phase === 'HELD').length;
                maximum = Math.max(maximum, elected);
            }
            t.ok(maximum <= 1, `seed ${seed}: quorum grants do not overlap before expiry`);
            if (!maximum) {
                await timer.tickAsync(1001);
                for (const node of f.nodes) {
                    if (node.active) await node.cancel(node.active.request.requestId);
                }
                const request = await f.request(seed % count);
                await f.nodes[seed % count].waitForReplies(request);
            }
            t.is(f.nodes.filter(node => node.active?.phase === 'HELD').length, 1, `seed ${seed}: a split campaign can recover`);
            await Promise.all(f.nodes.map(node => node.close()));
        }
    });
}

test('missing or malformed durable votes fail recovery instead of allowing a second vote', async t => {
    const f = cluster(t, 3);
    const request = await f.request(0);
    await f.deliver(request, 1);
    for (const corrupt of [
        state => { delete state.vote; },
        state => { state.vote.request.payloadHash = 'invalid'; },
        state => { state.vote.request.selectionVersion = 1; },
        state => { state.vote.expiresAt = -1; },
        state => { state.vote.request.logicalCounter = (BigInt(state.clock) + 1n).toString(); },
    ]) {
        const state = JSON.parse(JSON.stringify(f.stored.get(1)));
        corrupt(state);
        const node = new EpochAppenderSelector(key(2), {
            load: async () => state, save: async () => { t.fail('corruption cannot reset the vote'); },
        });
        const result = await node.open().catch(error => error);
        t.is(result.code, EpochAppenderSelectionErrorCode.SELECTION_STATE_INVALID);
        await node.close();
    }
});

test('a delayed two-member timeout cannot authorize or cancel the next election', async t => {
    const timer = sinon.useFakeTimers();
    const snapshot = context(2);
    const gate = Promise.withResolvers();
    let pauseTimeout = true;
    const node = new EpochAppenderSelector(key(1), {
        load: async () => null,
        save: async () => {},
        readContext: async () => {
            if (pauseTimeout && Date.now() >= 1000) {
                pauseTimeout = false;
                await gate.promise;
            }
            return snapshot;
        },
        sendRequest: async () => { throw new Error('offline'); },
    }, 100, 1000);
    t.teardown(async () => { gate.resolve(); await node.close(); timer.restore(); });
    const first = await node.createRequest(snapshot, b4a.from('first'));
    const firstWait = node.waitForReplies(first).catch(error => error);
    await timer.tickAsync(1000);
    await node.cancel(first.requestId);
    t.is((await firstWait).code, EpochAppenderSelectionErrorCode.REQUEST_CANCELLED);
    const next = await node.createRequest(snapshot, b4a.from('next'));
    let finished = false;
    const nextWait = node.waitForReplies(next).catch(error => error).then(() => { finished = true; });
    gate.resolve();
    await timer.tickAsync(0);
    t.is(node.active.request.requestId, next.requestId);
    t.is(node.active.phase, 'REQUESTING');
    t.is(finished, false, 'the old timeout cannot finish the replacement waiter');
    await node.cancel(next.requestId);
    await nextWait;
});

test('a configuration change cannot erase voting history or reuse an earlier term', async t => {
    const f = cluster(t, 3);
    const first = await f.request(0);
    await f.deliver(first, 1);
    f.snapshot.configHash = key(500);
    const other = await f.request(2);
    const stale = await f.deliver(other, 1, 2);
    t.is(stale.voteStatus, EpochAppenderVoteStatus.STALE, 'changing context cannot create a second vote in term one');
    await f.nodes[2].cancel(other.requestId);
    const next = await f.request(2);
    t.is((await f.deliver(next, 1, 2)).voteStatus, EpochAppenderVoteStatus.GRANTED);
    f.snapshot.configHash = first.configHash;
    t.is((await f.deliver(first, 1)).voteStatus, EpochAppenderVoteStatus.STALE, 'restoring the old context cannot revive its old grant');
    t.is(f.stored.get(1).vote.request.requestId, next.requestId);
});
