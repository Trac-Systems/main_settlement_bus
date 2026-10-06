import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import { createGenesisEpochProof, createVdfV1GenesisEpochProof } from '../../../../src/core/state/utils/epochProof.js';
import { encodeConsensusConfig, decodeEpochRecord, decodeEpochProofV1 } from '../../../../src/codecs/apply/applyOperationCodec.js';
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

test('VDF V1 genesis hashes its versioned record and preserves the inner proof bytes', async t => {
    const wallet = await createProposer();
    const encoded = await createGenesisEpochProof(wallet.address, encodeInitialConfig(), networkConfig);
    t.is(encoded.length, 461);
    const hash = await tracCryptoApi.hash.blake3(encoded);
    t.is(hash.toString('hex'), 'c0c374e460dcdbea7ae2d4b1eda5664518f62496eaaf4164429450667e583dff');

    const record = decodeEpochRecord(encoded);
    t.alike(record.sv, b4a.from([1]));
    t.is(record.data.length, 455, 'the V1 proof keeps its existing encoding length');
    const innerHash = await tracCryptoApi.hash.blake3(record.data);
    t.is(innerHash.toString('hex'), '4b8c7f1563bf5e6cd0667dfcb803702c50df35def35b0df9d7864cc0f42fdbac',
        'the V1 proof bytes remain unchanged inside the new record');
    t.absent(b4a.equals(hash, innerHash), 'the epoch hash commits to the entire versioned record');

    const epochProof = decodeEpochProofV1(record.data);
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

test('VDF V1 genesis factory decodes its config bytes and rejects malformed input', async t => {
    const wallet = await createProposer();
    const encodedConfig = encodeVdfConfig({
        difficulty: uint32ToBuffer(1),
        discriminantBitSize: uint16ToBuffer(1024),
    });
    const encodedProof = await createVdfV1GenesisEpochProof(networkConfig, wallet.address, encodedConfig);
    t.is(encodedProof.length, 455, 'the version-specific factory returns the inner proof');
    t.is((await tracCryptoApi.hash.blake3(encodedProof)).toString('hex'),
        '4b8c7f1563bf5e6cd0667dfcb803702c50df35def35b0df9d7864cc0f42fdbac');

    for (const invalidConfig of [null, 'config', {}, { difficulty: 1, discriminantBitSize: 1024 },
        b4a.alloc(0), b4a.alloc(5), b4a.alloc(7)]) {
        t.is(await createVdfV1GenesisEpochProof(networkConfig, wallet.address, invalidConfig), null);
    }
});
