import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import { createGenesisEpochProof } from '../../../../src/core/state/utils/epochProof.js';
import { encodeConsensusConfig, decodeEpochProofV1 } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { encodeVdfConfig } from '../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { decodeProofProposal } from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { uint8ToBuffer, uint16ToBuffer, uint32ToBuffer } from '../../../../src/utils/buffer.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1 } from '../../../fixtures/apply.fixtures.js';

const networkConfig = { ...config, networkId: 918, addressPrefix: 'trac' };

function encodeInitialConfig(schemaVersion = 1, difficulty = 1) {
    return encodeConsensusConfig({
        sv: uint8ToBuffer(schemaVersion),
        cd: encodeVdfConfig({
            difficulty: uint32ToBuffer(difficulty),
            discriminantBitSize: uint16ToBuffer(1024),
        }),
    });
}

async function createProposer() {
    return new WalletProvider(networkConfig).fromSecretKey(testKeyPair1.secretKey);
}

test('VDF V1 genesis preserves its canonical bytes and hash', async t => {
    const wallet = await createProposer();
    const encoded = await createGenesisEpochProof(wallet.address, encodeInitialConfig(), networkConfig);
    t.is(encoded.length, 455);
    const hash = await tracCryptoApi.hash.blake3(encoded);
    t.is(hash.toString('hex'), '4b8c7f1563bf5e6cd0667dfcb803702c50df35def35b0df9d7864cc0f42fdbac');

    const epochProof = decodeEpochProofV1(encoded);
    const proposal = decodeProofProposal(epochProof.pd);
    t.alike(epochProof.app, []);
    t.is(proposal.epoch.readBigUInt64BE(0), 0n);
    t.alike(proposal.previous_epoch_record_hash, b4a.alloc(32));
    t.alike(proposal.proof, b4a.alloc(260));
    t.alike(proposal.signature, b4a.alloc(64));
    t.absent(Object.hasOwn(proposal, 'protocol_version'));
});

test('Genesis never falls back to VDF for an unsupported initial consensus', async t => {
    const wallet = await createProposer();
    for (const version of [0, 2, 255]) {
        t.is(await createGenesisEpochProof(wallet.address, encodeInitialConfig(version), networkConfig), null);
    }
});

test('Genesis is determined by the initial operation config, including during replay', async t => {
    const wallet = await createProposer();
    const initialConfig = encodeInitialConfig();
    const initial = await createGenesisEpochProof(wallet.address, initialConfig, networkConfig);
    const otherNetworkGenesis = await createGenesisEpochProof(wallet.address, encodeInitialConfig(1, 2), networkConfig);
    t.absent(b4a.equals(initial, otherNetworkGenesis), 'different initial parameters produce different genesis bytes');
    t.alike(
        await createGenesisEpochProof(wallet.address, initialConfig, networkConfig),
        initial,
        'replaying the initial config reproduces the original genesis'
    );
});

test('Genesis rejects malformed encoded configs without creating a VDF record', async t => {
    const wallet = await createProposer();
    for (const encoded of [null, 'config', b4a.alloc(0), b4a.from([0xff])]) {
        t.is(await createGenesisEpochProof(wallet.address, encoded, networkConfig), null);
    }
});
