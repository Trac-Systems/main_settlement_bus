import test from 'brittle';
import b4a from 'b4a';
import { encodeConsensusConfig } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { encodeVdfConfig } from '../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { uint16ToBuffer, uint32ToBuffer } from '../../../../src/utils/buffer.js';
import { createEpochReadApi, callEpochRpc } from '../../../helpers/epochRpc.js';
import { createConsensusNetwork, VDF_DIFFICULTY, VDF_DISCRIMINANT_BITS, waitFor } from '../helpers/consensusNetwork.js';

if (typeof globalThis.Bare !== 'undefined') {
    test('consensus config RPC integration uses Node module mocks for MSB startup', t => t.pass('Node-only'));
} else {
    test('consensus config RPC exposes an unsigned update only after confirmation in signed mode', async t => {
        const network = await createConsensusNetwork(t, { indexerCount: 2, nodeCount: 2 });
        const { proposer, nodes } = network;
        const { state } = proposer;
        const msb = await createEpochReadApi(t, state, proposer.config);
        const initial = {
            schemaVersion: 1,
            configData: { difficulty: VDF_DIFFICULTY, discriminantBitSize: VDF_DISCRIMINANT_BITS },
        };
        const updated = { schemaVersion: 1, configData: { difficulty: 200, discriminantBitSize: 2048 } };
        for (const query of ['', '?confirmed=true', '?confirmed=false']) {
            t.alike(await callEpochRpc(msb, '/v1/consensus-config' + query), { status: 200, body: initial }, 'genesis config is available');
        }

        await network.disconnect(proposer, nodes[1]);
        const encodedConfig = encodeConsensusConfig({
            sv: b4a.from([1]),
            cd: encodeVdfConfig({
                difficulty: uint32ToBuffer(updated.configData.difficulty),
                discriminantBitSize: uint16ToBuffer(updated.configData.discriminantBitSize),
            }),
        });
        await network.appendAdmin((factory, validity) => factory.buildCompleteSetConsensusConfigMessage(
            proposer.wallet.address, validity, encodedConfig
        ));
        await waitFor('config update applies to the unsigned view', async () =>
            (await state.getUnsignedConsensusConfig())?.configData.difficulty === updated.configData.difficulty
        );
        t.ok(state.getUnsignedLength() > state.getSignedLength(), 'actual unsigned view extends past the signed boundary');
        for (const query of ['', '?confirmed=true']) {
            t.alike(await callEpochRpc(msb, '/v1/consensus-config' + query), { status: 200, body: initial }, 'signed config remains unchanged');
        }
        t.alike(await callEpochRpc(msb, '/v1/consensus-config?confirmed=false'), { status: 200, body: updated });

        await network.reconnect(proposer, nodes[1]);
        await network.waitForReplication('config update is signed on both nodes', async () => {
            const configs = await Promise.all(nodes.map(node => node.state.getSignedConsensusConfig()));
            return configs.every(config => config?.configData.difficulty === updated.configData.difficulty);
        });
        for (const query of ['', '?confirmed=true', '?confirmed=false']) {
            t.alike(await callEpochRpc(msb, '/v1/consensus-config' + query), { status: 200, body: updated }, 'confirmed update is visible in both modes');
        }
    });
}
