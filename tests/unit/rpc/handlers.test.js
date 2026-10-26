import test from 'brittle';
import EventEmitter from 'bare-events';
import b4a from 'b4a';
import sinon from 'sinon';
import tracCryptoApi from 'trac-crypto-api';
import {
    handleAccountDetails,
    handleBalance,
    handleBroadcastTransaction,
    handleConfirmedLength,
    handleFee,
    handleFetchBulkTxPayloads,
    handleHealth,
    handleHtlc,
    handleHtlcClaim,
    handleHtlcLock,
    handleHtlcRefund,
    handleTransactionDetails,
    handleTransactionExtendedDetails,
    handleTxHashes,
    handleTxv,
    handleUnconfirmedLength,
} from '../../../rpc/handlers.js';
import { OperationType } from '../../../src/utils/constants.js';

const lockId = 'ab'.repeat(32);
const txHash = 'cd'.repeat(32);
const address = tracCryptoApi.address.encode('trac', b4a.alloc(32, 1));

function request(url, params = {}) {
    const req = new EventEmitter();
    req.url = url;
    req.params = params;
    req.headers = { host: 'localhost' };
    req.resume = sinon.spy();
    return req;
}

function context(msbInstance, url, params) {
    const responses = [];
    return {
        req: request(url, params),
        msbInstance,
        respond: (status, body) => responses.push({ status, body }),
        responses,
    };
}

async function submit(handler, msbInstance, url, payload, params = {}) {
    const ctx = context(msbInstance, url, params);
    const pending = handler(ctx);
    const body = { payload: b4a.toString(b4a.from(JSON.stringify(payload)), 'base64') };
    ctx.req.emit('data', b4a.from(JSON.stringify(body)));
    ctx.req.emit('end');
    await pending;
    return ctx;
}

test('HTLC RPC submissions pass signed operations to the corresponding MSB methods', async t => {
    const result = { tx: txHash, signedLength: 2, unsignedLength: 3 };
    const msb = {
        htlcLock: sinon.stub().resolves(result),
        htlcClaim: sinon.stub().resolves(result),
        htlcRefund: sinon.stub().resolves(result),
    };
    for (const [handler, method, type, key, url, params] of [
        [handleHtlcLock, 'htlcLock', OperationType.HTLC_LOCK, 'hlo', '/v1/htlc', {}],
        [handleHtlcClaim, 'htlcClaim', OperationType.HTLC_CLAIM, 'hco', `/v1/htlc/${lockId}/claim`, { id: lockId }],
        [handleHtlcRefund, 'htlcRefund', OperationType.HTLC_REFUND, 'hro', `/v1/htlc/${lockId}/refund`, { id: lockId }],
    ]) {
        const payload = { type, address, [key]: { li: lockId, tx: txHash } };
        const ctx = await submit(handler, msb, url, payload, params);
        t.alike(ctx.responses, [{ status: 200, body: { result: { ...result, message: 'Transaction broadcasted successfully.' } } }]);
        t.alike(msb[method].lastCall.args[0], payload);
    }
});

test('HTLC claim/refund paths reject a different lock ID before submission', async t => {
    const msb = { htlcClaim: sinon.stub(), htlcRefund: sinon.stub() };
    for (const [handler, method, type, key] of [
        [handleHtlcClaim, 'htlcClaim', OperationType.HTLC_CLAIM, 'hco'],
        [handleHtlcRefund, 'htlcRefund', OperationType.HTLC_REFUND, 'hro'],
    ]) {
        const ctx = await submit(handler, msb, `/v1/htlc/${lockId}/${key}`, {
            type, address, [key]: { li: txHash }
        }, { id: lockId });
        t.is(ctx.responses[0].status, 400);
        t.is(msb[method].callCount, 0);
    }
});

test('HTLC RPC submission maps validation and broadcast failures', async t => {
    const { ValidationError, BroadcastError } = await import('../../../src/utils/errors.js');
    const msb = { htlcLock: sinon.stub() };
    const payload = { type: OperationType.HTLC_LOCK, address, hlo: { tx: txHash } };
    msb.htlcLock.rejects(new ValidationError('Invalid lock.'));
    let ctx = await submit(handleHtlcLock, msb, '/v1/htlc', payload);
    t.alike(ctx.responses, [{ status: 400, body: { error: 'Invalid lock.' } }]);
    msb.htlcLock.rejects(new BroadcastError('No validator accepted the lock.'));
    ctx = await submit(handleHtlcLock, msb, '/v1/htlc', payload);
    t.alike(ctx.responses, [{ status: 429, body: { error: 'No validator accepted the lock.' } }]);
});

test('HTLC RPC rejects missing, malformed and oversized request bodies', async t => {
    const msb = { htlcLock: sinon.stub() };
    for (const [body, status] of [
        ['', 400],
        ['{', 400],
        ['{}', 400],
        [JSON.stringify({ payload: b4a.toString(b4a.from('null'), 'base64') }), 400],
        [JSON.stringify({ payload: 'invalid!' }), 400],
        [JSON.stringify({ payload: 'a'.repeat(2_000_001) }), 413],
    ]) {
        const ctx = context(msb, '/v1/htlc');
        const pending = handleHtlcLock(ctx);
        ctx.req.emit('data', b4a.from(body));
        ctx.req.emit('end');
        await pending;
        t.is(ctx.responses[0].status, status);
        t.is(ctx.responses.length, 1);
    }
    t.is(msb.htlcLock.callCount, 0);
});

test('HTLC claim rejects a non-string lock reference', async t => {
    const msb = { htlcClaim: sinon.stub() };
    const ctx = await submit(handleHtlcClaim, msb, `/v1/htlc/${lockId}/claim`, {
        type: OperationType.HTLC_CLAIM,
        address,
        hco: { li: 42 },
    }, { id: lockId });
    t.is(ctx.responses[0].status, 400);
    t.is(msb.htlcClaim.callCount, 0);
});

test('HTLC submission stops when the caller aborts the upload', async t => {
    const msb = { htlcLock: sinon.stub() };
    const ctx = context(msb, '/v1/htlc');
    const pending = handleHtlcLock(ctx);
    ctx.req.emit('aborted');
    await pending;
    t.is(ctx.responses.length, 0);
    t.is(msb.htlcLock.callCount, 0);
});

test('HTLC lookup validates the ID and confirmation mode', async t => {
    const msb = { getHtlc: sinon.stub().resolves({ lockId, status: 'PENDING' }) };
    let ctx = context(msb, `/v1/htlc/${lockId}?confirmed=false`, { id: lockId });
    await handleHtlc(ctx);
    t.alike(ctx.responses, [{ status: 200, body: { htlc: { lockId, status: 'PENDING' } } }]);
    t.alike(msb.getHtlc.firstCall.args, [lockId, false]);

    ctx = context(msb, '/v1/htlc/invalid', { id: 'invalid' });
    await handleHtlc(ctx);
    t.is(ctx.responses[0].status, 400);

    ctx = context(msb, `/v1/htlc/${lockId}?confirmed=maybe`, { id: lockId });
    await handleHtlc(ctx);
    t.is(ctx.responses[0].status, 400);

    msb.getHtlc.resolves(null);
    ctx = context(msb, `/v1/htlc/${lockId}`, { id: lockId });
    await handleHtlc(ctx);
    t.is(ctx.responses[0].status, 404);
});

test('RPC health and scalar endpoints return their MSB values', async t => {
    const msb = {
        opened: true,
        getTxv: sinon.stub().resolves('01'),
        handleGetFee: sinon.stub().returns(5n),
        getConfirmedLength: sinon.stub().returns(12),
        getUnconfirmedLength: sinon.stub().returns(13),
    };
    for (const [handler, expected] of [
        [handleHealth, { ok: true }],
        [handleTxv, { txv: '01' }],
        [handleFee, { fee: '5' }],
        [handleConfirmedLength, { confirmed_length: 12 }],
        [handleUnconfirmedLength, { unconfirmed_length: 13 }],
    ]) {
        const ctx = context(msb, '/v1/test');
        await handler(ctx);
        t.alike(ctx.responses, [{ status: 200, body: expected }]);
    }
    const offline = context({ opened: false }, '/v1/health');
    await handleHealth(offline);
    t.is(offline.responses[0].status, 503);
});

test('RPC account, balance and transaction lookups pass parsed inputs', async t => {
    const msb = {
        config: { addressPrefix: 'trac' },
        getBalance: sinon.stub().resolves({ balance: '7' }),
        getTxDetails: sinon.stub().resolves({ type: OperationType.TRANSFER }),
        getExtendedTxDetails: sinon.stub().resolves({ txDetails: { type: OperationType.TRANSFER } }),
        state: { getNodeEntry: sinon.stub().resolves(null), getNodeEntryUnsigned: sinon.stub().resolves(null) },
    };
    let ctx = context(msb, `/v1/balance/${address}?confirmed=true`);
    await handleBalance(ctx);
    t.alike(ctx.responses, [{ status: 200, body: { address, balance: '7' } }]);
    t.alike(msb.getBalance.firstCall.args, [address, true]);

    ctx = context(msb, `/v1/account/${address}?confirmed=false`);
    await handleAccountDetails(ctx);
    t.is(ctx.responses[0].status, 200);
    t.is(ctx.responses[0].body.balance, '0');
    t.ok(msb.state.getNodeEntryUnsigned.calledOnceWithExactly(address));

    ctx = context(msb, `/v1/tx/${txHash.toUpperCase()}`);
    await handleTransactionDetails(ctx);
    t.is(ctx.responses[0].status, 200);
    t.ok(msb.getTxDetails.calledOnceWithExactly(txHash));

    ctx = context(msb, `/v1/tx/details/${txHash}?confirmed=false`);
    await handleTransactionExtendedDetails(ctx);
    t.is(ctx.responses[0].status, 200);
    t.ok(msb.getExtendedTxDetails.calledOnceWithExactly(txHash, false));
});

test('RPC tx hash ranges are capped at the confirmed length', async t => {
    const msb = {
        getConfirmedLength: sinon.stub().resolves(10),
        getTxHashes: sinon.stub().resolves({ hashes: [{ hash: txHash, confirmed_length: 8 }] }),
    };
    let ctx = context(msb, '/v1/tx-hashes/2/12');
    await handleTxHashes(ctx);
    t.is(ctx.responses[0].status, 200);
    t.ok(msb.getTxHashes.calledOnceWithExactly(2, 10));

    ctx = context(msb, '/v1/tx-hashes/12/2');
    await handleTxHashes(ctx);
    t.is(ctx.responses[0].status, 400);
});

test('RPC generic broadcast forwards the decoded operation', async t => {
    const msb = { broadcastTransaction: sinon.stub().resolves({ tx: txHash, signedLength: 2, unsignedLength: 3 }) };
    const payload = { type: OperationType.TRANSFER, address, tro: { tx: txHash } };
    const ctx = context(msb, '/v1/broadcast-transaction');
    handleBroadcastTransaction(ctx);
    ctx.req.emit('data', b4a.from(JSON.stringify({ payload: b4a.toString(b4a.from(JSON.stringify(payload)), 'base64') })));
    ctx.req.emit('end');
    await new Promise(resolve => setTimeout(resolve, 0));
    t.is(ctx.responses[0].status, 200);
    t.alike(msb.broadcastTransaction.firstCall.args[0], payload);
});

test('RPC bulk payload lookup de-duplicates hashes before querying MSB', async t => {
    const msb = { fetchBulkTxPayloads: sinon.stub().resolves({ results: [], missing: [txHash] }) };
    const ctx = context(msb, '/v1/tx-payloads-bulk');
    handleFetchBulkTxPayloads(ctx);
    ctx.req.emit('data', b4a.from(JSON.stringify({ hashes: [txHash, txHash] })));
    ctx.req.emit('end');
    await new Promise(resolve => setTimeout(resolve, 0));
    t.is(ctx.responses[0].status, 200);
    t.alike(msb.fetchBulkTxPayloads.firstCall.args[0], [txHash]);
});
