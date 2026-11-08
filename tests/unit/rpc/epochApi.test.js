import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import {
    encodeApplyOperation, encodeEpochRecord, encodeEpochProofV1, decodeEpochProofV1,
} from '../../../src/codecs/apply/applyOperationCodec.js';
import { encodeProofProposal, decodeProofProposal } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { EntryType, OperationType } from '../../../src/utils/constants.js';
import { uint64ToBuffer } from '../../../src/utils/buffer.js';
import { normalizeDecodedPayloadForJson } from '../../../src/utils/normalizers.js';
import fixtures from '../../fixtures/applyOperation.fixtures.js';
import { config } from '../../helpers/config.js';
import { createEpochReadApi, callEpochRpc } from '../../helpers/epochRpc.js';

const { validTransferOperation } = fixtures;

if (typeof globalThis.Bare !== 'undefined') {
    test('epoch RPC unit tests use Node module mocks', t => t.pass('Node-only'));
} else {
    function readState() {
        return {
            getSigned: sinon.stub().resolves(null),
            getEpochProof: sinon.stub().resolves(null),
            getSignedLength: () => 20,
            getUnsignedLength: () => 25,
            getCurrentEpoch: sinon.stub().resolves(null),
            getCurrentEpochUnsigned: sinon.stub().resolves(null),
        };
    }

    test('epoch history includes only exact record keys and preserves signed, half-open ranges', async t => {
        const { default: esmock } = await import('esmock');
        const tx = 'ab'.repeat(32);
        const epoch = 'cd'.repeat(32);
        const unsigned = 'ef'.repeat(32);
        const entries = [
            { type: 'put', key: tx, seq: 1 },
            { type: 'put', key: EntryType.EPOCH_CURRENT, seq: 2 },
            { type: 'put', key: EntryType.EPOCH + '1', seq: 3 },
            { type: 'put', key: EntryType.EPOCH_HASH + epoch, seq: 4 },
            { type: 'del', key: EntryType.EPOCH_HASH + epoch, seq: 5 },
            ...[epoch.slice(2), epoch + 'aa', 'zz'.repeat(32), epoch + '/suffix'].map((hash, i) =>
                ({ type: 'put', key: EntryType.EPOCH_HASH + hash, seq: 6 + i })),
            { type: 'put', key: '/other' + EntryType.EPOCH_HASH + epoch, seq: 10 },
            { type: 'put', key: EntryType.EPOCH_HASH + unsigned, seq: 12 },
        ];
        const createHistoryStream = sinon.spy(async function* ({ gte, lte }) {
            yield* entries.filter(entry => entry.seq >= gte && entry.seq <= lte);
        });
        const State = await esmock('../../../src/core/state/State.js', {
            autobase: class {
                constructor() { return { view: { core: { signedLength: 12 }, createHistoryStream } }; }
            },
        });
        const state = new State(null, null, config);
        t.alike(await state.confirmedTransactionsBetween(0, 100), [
            { hash: tx, confirmed_length: 1 }, { hash: epoch, confirmed_length: 4 },
        ]);
        t.ok(createHistoryStream.calledOnceWithExactly({ gte: 0, lte: 11 }), 'one bounded history scan');
        t.alike(await state.confirmedTransactionsBetween(1, 4), [{ hash: tx, confirmed_length: 1 }]);
        t.alike(await state.confirmedTransactionsBetween(4, 5), [{ hash: epoch, confirmed_length: 4 }]);
        t.alike(await state.confirmedTransactionsBetween(5, 12), []);
        t.alike(await state.confirmedTransactionsBetween(4, 4), []);
        t.alike(await state.confirmedTransactionsBetween(0, 0), []);
        await t.exception(() => state.confirmedTransactionsBetween(12, 13), /Invalid range/);
        for (const [start, end] of [[-1, 2], [3, 2], [0.5, 2], [0, '2']]) {
            await t.exception(() => state.confirmedTransactionsBetween(start, end));
        }
    });

    test('bulk preserves transfers, exposes versioned epochs and reports missing hashes', async t => {
        const state = readState();
        const msb = await createEpochReadApi(t, state, config);
        const txHash = validTransferOperation.tro.tx.toString('hex');
        const epochHash = 'cd'.repeat(32);
        const missingHash = 'ef'.repeat(32);
        const epoch = 18446744073709551615n;
        const record = {
            sv: b4a.from([1]),
            data: encodeEpochProofV1({ pd: encodeProofProposal({ epoch: uint64ToBuffer(epoch) }), app: [] }),
        };
        state.getSigned.withArgs(txHash).resolves(encodeApplyOperation(validTransferOperation));
        // Even if both namespaces contain a hash, the existing transaction path takes precedence.
        state.getEpochProof.withArgs(txHash).resolves(encodeEpochRecord(record));
        state.getEpochProof.withArgs(epochHash).resolves(encodeEpochRecord(record));

        const response = await callEpochRpc(msb, '/v1/tx-payloads-bulk', {
            hashes: [txHash, epochHash, missingHash, epochHash],
        });
        t.is(response.status, 200);
        t.alike(response.body, {
            results: [
                { hash: txHash, payload: normalizeDecodedPayloadForJson(validTransferOperation, config) },
                { hash: epochHash, payload: { type: OperationType.SET_EPOCH, seo: {
                    sv: '01', data: record.data.toString('hex'),
                } } },
            ],
            missing: [missingHash],
        });
        t.absent(state.getEpochProof.calledWith(txHash), 'ordinary transactions do not incur an epoch read');
        t.is(state.getEpochProof.callCount, 2, 'one fallback per unique missing transaction');
        const proof = decodeEpochProofV1(b4a.from(response.body.results[1].payload.seo.data, 'hex'));
        t.is(decodeProofProposal(proof.pd).epoch.readBigUInt64BE(), epoch, 'uint64 remains byte-exact');
        t.is(await msb.getConfirmedTxInfo(epochHash), null, 'transaction-only lookup retains its contract');
    });

    test('bulk reports corrupt stored records and read failures as errors, not missing hashes', async t => {
        const state = readState();
        const msb = await createEpochReadApi(t, state, config);
        const hash = 'ab'.repeat(32);
        for (const corrupt of [b4a.alloc(0), b4a.from([0xff]), b4a.from([0x0a, 0x01, 0x00])]) {
            state.getEpochProof.resolves(corrupt);
            await t.exception.all(() => msb.fetchBulkTxPayloads([hash]));
            const response = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes: [hash] });
            t.is(response.status, 500);
            t.absent(response.body.missing);
        }
        state.getEpochProof.rejects(new Error('signed read failed'));
        await t.exception(() => msb.fetchBulkTxPayloads([hash]), /signed read failed/);
        state.getEpochProof.resetHistory();
        state.getSigned.resolves(b4a.from([0xff]));
        await t.exception(() => msb.fetchBulkTxPayloads([hash]), /Failed to decode payload for transaction hash/);
        t.absent(state.getEpochProof.called, 'a corrupt transaction does not fall through to epochs');
    });

    test('bulk keeps the existing hash count and response size limits for epoch records', async t => {
        const state = readState();
        const msb = await createEpochReadApi(t, state, config);
        const hashes = Array.from({ length: 1501 }, (_, i) => i.toString(16).padStart(64, '0'));
        const tooMany = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes });
        t.is(tooMany.status, 400);
        t.absent(state.getSigned.called, 'count limit is checked before reads');
        state.getEpochProof.resolves(encodeEpochRecord({ sv: b4a.from([1]), data: b4a.alloc(3000, 1) }));
        const tooLarge = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes: hashes.slice(0, 400) });
        t.is(tooLarge.status, 413);
        t.is(tooLarge.body.error, 'Response too large. Reduce number of hashes.');
    });
    test('current epoch RPC selects signed or unsigned state and preserves null, zero and uint64 precision', async t => {
        const state = readState();
        const msb = await createEpochReadApi(t, state, config);
        for (const [query, signed] of [['', true], ['?confirmed=true', true], ['?confirmed=false', false]]) {
            for (const epoch of [null, 0n, 18446744073709551615n]) {
                const selected = signed ? state.getCurrentEpoch : state.getCurrentEpochUnsigned;
                const other = signed ? state.getCurrentEpochUnsigned : state.getCurrentEpoch;
                selected.resetHistory();
                other.resetHistory();
                selected.resolves(epoch);
                const response = await callEpochRpc(msb, '/v1/current-epoch' + query);
                t.alike(response, { status: 200, body: { current_epoch: epoch === null ? null : epoch.toString() } });
                t.ok(selected.calledOnceWithExactly(), 'the selected view is read once');
                t.absent(other.called, 'the other view is not read');
            }
        }
    });

    test('current epoch RPC rejects invalid confirmation modes before reading state and propagates read errors', async t => {
        const state = readState();
        const msb = await createEpochReadApi(t, state, config);
        for (const value of ['', '1', '0', 'TRUE', 'False', 'maybe']) {
            const response = await callEpochRpc(msb, '/v1/current-epoch?confirmed=' + value);
            t.alike(response, { status: 400, body: { error: 'Parameter "confirmed" must be exactly "true" or "false"' } });
        }
        t.absent(state.getCurrentEpoch.called);
        t.absent(state.getCurrentEpochUnsigned.called);
        state.getCurrentEpoch.rejects(new Error('signed epoch read failed'));
        state.getCurrentEpochUnsigned.rejects(new Error('unsigned epoch read failed'));
        await t.exception(() => msb.getCurrentEpoch(), /signed epoch read failed/);
        await t.exception(() => msb.getCurrentEpoch(false), /unsigned epoch read failed/);
    });
}
