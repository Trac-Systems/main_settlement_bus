import test from 'brittle';
import b4a from 'b4a';
import {WalletProvider} from 'trac-wallet';
import tracCryptoApi from 'trac-crypto-api';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import {createMessage, safeWriteUInt32BE} from '../../../src/utils/buffer.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {config} from '../../helpers/config.js';
import {testKeyPair1, testKeyPair2} from '../../fixtures/apply.fixtures.js';
import {errorMessageIncludes} from '../../helpers/regexHelper.js';

async function createWallet(keyPair = testKeyPair1) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildVdfParametersHash() {
    const message = createMessage(
        safeWriteUInt32BE(config.vdfDifficulty, 0),
        safeWriteUInt32BE(config.vdfDiscriminantSizeBits, 0)
    );

    return await tracCryptoApi.hash.blake3(message);
}

async function buildProofProposalPayload(wallet) {
    const builder = new ConsensusMessageBuilder(wallet, config);
    const vdfParametersHash = await buildVdfParametersHash();

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(1)
        .setEpoch(1)
        .setPreviousEpochRecordHash(b4a.alloc(32, 1))
        .setProposer(wallet.address)
        .setVdfParametersHash(vdfParametersHash)
        .setVdfProof(b4a.alloc(VDF_BLOB_PROOF_SIZE, 3))
        .buildPayload();

    return builder.getResult();
}

test('V1EpochProofProposalRequest validates proof proposal signature', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config);
    const payload = await buildProofProposalPayload(wallet);

    await validator.validate(payload, {remotePublicKey: wallet.publicKey});

    t.pass();
});

test('V1EpochProofProposalRequest builds proof proposal challenge data from fields one through six', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config);
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

test('V1EpochProofProposalRequest rejects proof proposal with mismatched signature message', async t => {
    const wallet = await createWallet(testKeyPair1);
    const otherWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalRequest(config);
    const payload = await buildProofProposalPayload(wallet);

    await t.exception(
        async () => validator.validate(payload, {remotePublicKey: otherWallet.publicKey}),
        errorMessageIncludes('signature verification failed')
    );

    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE, 4)
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('signature verification failed')
    );
});

test('V1EpochProofProposalRequest rejects unsupported proof proposal protocol version', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config);
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
    const validator = new V1EpochProofProposalRequest(config);
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
