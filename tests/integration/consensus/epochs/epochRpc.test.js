import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';
import { createEpochReadApi, callEpochRpc } from '../../../helpers/epochRpc.js';
import { decodeEpochProofV1 } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { decodeProofProposal } from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { EntryType, OperationType } from '../../../../src/utils/constants.js';
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import { withSignedEpochView } from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionLedgerReader.js';

if (typeof globalThis.Bare !== 'undefined') {
    test('epoch RPC integration uses Node module mocks for MSB transport startup', t => t.pass('Node-only'));
} else {
    test('RPC reads real signed genesis, epoch 1, a transaction and epoch 2 without duplicate epoch entries', async t => {
        const network = await createConsensusNetwork(t, { indexerCount: 3, nodeCount: 3 });
        const { proposer, nodes } = network;
        const { state } = proposer;
        const msb = await createEpochReadApi(t, state, proposer.config);
        const appends = sinon.spy(proposer.operations, 'appendSetEpoch');
        const start = state.getSignedLength();

        const first = network.startRound();
        await assertSignedEpoch(t, network);
        await waitFor('first epoch round completion', () => first.completed);

        let transaction;
        await network.appendAdmin(async (factory, validity) => {
            transaction = await factory.buildCompleteBalanceInitializationMessage(
                proposer.wallet.address,
                tracCryptoApi.address.encode(proposer.config.addressPrefix, b4a.alloc(32, 7)),
                $TNK(1n), validity,
            );
            return transaction;
        });
        const txHash = transaction.bio.tx.toString('hex');
        await network.waitForReplication('ordinary transaction is signed', async () =>
            (await Promise.all(nodes.map(node => node.state.getSigned(txHash)))).every(Boolean)
        );

        const second = network.startRound();
        await assertSignedEpoch(t, network, { epoch: 2n });
        await waitFor('second epoch round completion', () => second.completed);

        const confirmed = await callEpochRpc(msb, '/v1/confirmed-length');
        t.is(confirmed.status, 200);
        const end = confirmed.body.confirmed_length;
        t.is(end, state.getSignedLength());
        const hashes = await callEpochRpc(msb, `/v1/tx-hashes/0/${end}`);
        t.is(hashes.status, 200);
        const requested = hashes.body.hashes.map(({ hash }) => hash);
        const bulk = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes: requested });
        t.is(bulk.status, 200);
        t.alike(bulk.body.missing, []);
        const epochResults = bulk.body.results.filter(({ payload }) => payload.type === OperationType.SET_EPOCH);
        t.is(epochResults.length, 3, 'one record per epoch, including genesis');
        for (let epoch = 0n; epoch <= 2n; epoch++) {
            const hash = (await state.getEpoch(epoch)).toString('hex');
            const result = epochResults.find(result => result.hash === hash);
            t.ok(result, `signed epoch ${epoch} is discoverable through the existing RPC flow`);
            t.is(requested.filter(value => value === hash).length, 1, 'pointer and number index do not duplicate the epoch');
            t.alike(Object.keys(result.payload).sort(), ['seo', 'type'], 'no fabricated transaction envelope');
            t.is(result.payload.seo.sv, '01');
            const proof = decodeEpochProofV1(b4a.from(result.payload.seo.data, 'hex'));
            t.is(decodeProofProposal(proof.pd).epoch.readBigUInt64BE(), epoch);
            const entry = await state.base.view.get(EntryType.EPOCH_HASH + hash);
            t.alike(hashes.body.hashes.find(item => item.hash === hash), { hash, confirmed_length: entry.seq });
        }
        t.is(bulk.body.results.filter(({ payload }) => payload.type === OperationType.SET_GENESIS_EPOCH).length, 1,
            'the original genesis transaction retains type 15');
        const ordinary = bulk.body.results.find(result => result.hash === txHash);
        t.is(ordinary.payload.type, OperationType.BALANCE_INITIALIZATION);
        t.is(ordinary.payload.bio.tx, txHash);

        const mixed = await callEpochRpc(msb, `/v1/tx-hashes/${start}/${end}`);
        t.alike(mixed.body.hashes.map(item => item.hash), [
            (await state.getEpoch(1n)).toString('hex'), txHash, (await state.getEpoch(2n)).toString('hex'),
        ], 'transactions and epochs retain their history order');
        for (const item of mixed.body.hashes) {
            const single = await callEpochRpc(msb, `/v1/tx-hashes/${item.confirmed_length}/${item.confirmed_length + 1}`);
            t.alike(single.body.hashes, [item], 'start is inclusive and end is exclusive');
        }
        const capped = await callEpochRpc(msb, `/v1/tx-hashes/${start}/${end + 10}`);
        t.alike(capped.body, mixed.body, 'end is capped at the signed boundary');
        const empty = await callEpochRpc(msb, `/v1/tx-hashes/${end}/${end}`);
        t.alike(empty.body, { hashes: [] });

        async function appendWithoutEpoch(payload) {
            await state.append(payload);
            const writerLength = state.base.local.length;
            await network.waitForReplication('append has been processed by the signed writer clock', () =>
                withSignedEpochView(state.base, async ({ system }) =>
                    (await system.get(state.writingKey))?.length >= writerLength
                )
            );
            t.is(await state.getCurrentEpoch(), 2n);
            const after = await callEpochRpc(msb, `/v1/tx-hashes/0/${state.getSignedLength()}`);
            t.alike(after.body, hashes.body, 'processed append adds no epoch or transaction to the feed');
        }
        await appendWithoutEpoch(appends.lastCall.args[0]);
        const nextProposal = await network.createProofProposal();
        const rejected = await proposer.operations.buildSetEpochPayload(nextProposal.proof_proposal, []);
        await appendWithoutEpoch(rejected); // Three indexers require an external proof approval.
    });

    test('RPC excludes a real unsigned epoch until indexers reconnect and confirm it', async t => {
        const network = await createConsensusNetwork(t, { indexerCount: 2, nodeCount: 2 });
        const { proposer, nodes } = network;
        const { state } = proposer;
        const msb = await createEpochReadApi(t, state, proposer.config);
        const before = await callEpochRpc(msb, `/v1/tx-hashes/0/${state.getSignedLength()}`);
        const entered = network.deferred();
        const gate = network.deferred();
        const append = state.appendEpoch.bind(state);
        let localWriteDone = false;
        state.appendEpoch = async (payload, authorize) => {
            const result = await append(payload, async location => {
                await authorize(location);
                entered.resolve();
                await gate.promise;
            });
            localWriteDone = true;
            return result;
        };
        const round = network.startRound();
        await entered.promise;
        await network.disconnect(proposer, nodes[1]);
        gate.resolve();
        await waitFor('unsigned epoch applied locally', async () =>
            localWriteDone && await state.getCurrentEpochUnsigned() === 1n
        );
        t.is(await state.getCurrentEpoch(), 0n, 'signed epoch has not advanced');
        t.ok(state.getUnsignedLength() > state.getSignedLength(), 'real unsigned view extends beyond signed history');
        const hash = (await state.get(EntryType.EPOCH + '1')).toString('hex');
        t.ok(await state.get(EntryType.EPOCH_HASH + hash), 'epoch record exists in unsigned state');
        const unsignedHistory = await callEpochRpc(msb, `/v1/tx-hashes/0/${state.getUnsignedLength()}`);
        t.alike(unsignedHistory.body, before.body, 'unsigned record is excluded from the hash list');
        const unsignedBulk = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes: [hash] });
        t.alike(unsignedBulk.body, { results: [], missing: [hash] });

        await network.reconnect(proposer, nodes[1]);
        await assertSignedEpoch(t, network);
        await waitFor('round completes after confirmation', () => round.completed);
        const signedHistory = await callEpochRpc(msb, `/v1/tx-hashes/0/${state.getSignedLength()}`);
        t.is(signedHistory.body.hashes.filter(item => item.hash === hash).length, 1);
        const signedBulk = await callEpochRpc(msb, '/v1/tx-payloads-bulk', { hashes: [hash] });
        t.is(signedBulk.body.results[0].payload.type, OperationType.SET_EPOCH);
        t.alike(signedBulk.body.missing, []);
    });
}
