import test from 'brittle';
import b4a from 'b4a';
import {WalletProvider} from 'trac-wallet';
import tracCryptoApi from 'trac-crypto-api';
import {solveWesolowski} from '@tracsystems/trac-vdf';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import {addressToBuffer} from '../../../src/core/state/utils/address.js';
import {createMessage, safeWriteUInt32BE, uint8ToBuffer, uint16ToBuffer, uint64ToBuffer} from '../../../src/utils/buffer.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {config} from '../../helpers/config.js';
import {testKeyPair1, testKeyPair2} from '../../fixtures/apply.fixtures.js';
import {errorMessageIncludes} from '../../helpers/regexHelper.js';

const vdfTestConfig = new Proxy(config, {
    get(target, property) {
        if (property === 'vdfDifficulty') return 1;
        if (property === 'vdfDiscriminantSizeBits') return 2048;
        return target[property];
    }
});
const vdfProofCache = new Map();

async function createWallet(keyPair = testKeyPair1) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildVdfParametersHash(vdfConfig = vdfTestConfig) {
    const message = createMessage(
        safeWriteUInt32BE(vdfConfig.vdfDifficulty, 0),
        safeWriteUInt32BE(vdfConfig.vdfDiscriminantSizeBits, 0)
    );

    return await tracCryptoApi.hash.blake3(message);
}

async function buildVdfProof(challengeData, vdfConfig = vdfTestConfig) {
    const cacheKey = [
        vdfConfig.vdfDifficulty,
        vdfConfig.vdfDiscriminantSizeBits,
        b4a.toString(challengeData, 'hex')
    ].join(':');

    if (!vdfProofCache.has(cacheKey)) {
        vdfProofCache.set(cacheKey, await solveWesolowski(
            challengeData,
            vdfConfig.vdfDifficulty,
            vdfConfig.vdfDiscriminantSizeBits
        ));
    }

    return b4a.from(vdfProofCache.get(cacheKey));
}

async function buildProofProposalPayload(wallet, vdfConfig = vdfTestConfig) {
    const builder = new ConsensusMessageBuilder(wallet, vdfConfig);
    const protocolVersion = uint8ToBuffer(ConsensusProtocolVersion.V1, 'Protocol version');
    const networkId = uint16ToBuffer(1, 'Network id');
    const epoch = uint64ToBuffer(1, 'Epoch');
    const previousEpochRecordHash = b4a.alloc(32, 1);
    const proposer = addressToBuffer(wallet.address, vdfConfig.addressPrefix);
    const vdfParametersHash = await buildVdfParametersHash(vdfConfig);
    const challengeData = createMessage(
        protocolVersion,
        networkId,
        epoch,
        previousEpochRecordHash,
        proposer,
        vdfParametersHash
    );
    const vdfProof = await buildVdfProof(challengeData, vdfConfig);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(1)
        .setEpoch(1)
        .setPreviousEpochRecordHash(previousEpochRecordHash)
        .setProposer(wallet.address)
        .setVdfParametersHash(vdfParametersHash)
        .setVdfProof(vdfProof)
        .buildPayload();

    return builder.getResult();
}

test('V1EpochProofProposalRequest validates proof proposal signature', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);

    t.is(payload.proof_proposal.vdf_proof.length, VDF_BLOB_PROOF_SIZE);
    await validator.validate(payload, {remotePublicKey: wallet.publicKey});

    t.pass();
});

test('V1EpochProofProposalRequest rejects unsupported proof proposal protocol version', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            protocol_version: b4a.from([2])
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('Unsupported proof proposal protocol version')
    );
});

test('V1EpochProofProposalRequest rejects invalid VDF parameters hash', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            vdf_parameters_hash: b4a.alloc(32, 9)
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('VDF parameters hash is invalid')
    );
});

test('V1EpochProofProposalRequest builds proof proposal challenge data from fields one through six', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);
    const proofProposal = payload.proof_proposal;
    const challengeData = validator.buildProofProposalChallengeData(proofProposal);
    const expectedChallengeData = createMessage(
        proofProposal.protocol_version,
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.vdf_parameters_hash
    );
    const signatureMessage = createMessage(expectedChallengeData, proofProposal.vdf_proof);

    t.ok(b4a.equals(challengeData, expectedChallengeData));
    t.not(b4a.equals(challengeData, signatureMessage));
});

test('V1EpochProofProposalRequest rejects invalid VDF proof', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);

    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE, 4)
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('VDF proof is invalid')
    );
});

test('V1EpochProofProposalRequest rejects invalid proof proposal signature', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const payload = await buildProofProposalPayload(wallet);
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            signature: b4a.alloc(64, 9)
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('signature verification failed')
    );
});

test('V1EpochProofProposalRequest accepts proposer address matching remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const proposer = addressToBuffer(wallet.address, vdfTestConfig.addressPrefix);

    validator.assertAddressWithRemotePublicKey(proposer, wallet.publicKey);

    t.pass();
});

test('V1EpochProofProposalRequest rejects proposer address mismatched with remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const otherWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig);
    const proposer = addressToBuffer(wallet.address, vdfTestConfig.addressPrefix);

    t.exception(
        () => validator.assertAddressWithRemotePublicKey(proposer, otherWallet.publicKey),
        errorMessageIncludes('Proposer address does not match remote public key')
    );
});
