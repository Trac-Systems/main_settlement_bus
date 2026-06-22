import test from 'brittle';
import b4a from 'b4a';
import {WalletProvider} from 'trac-wallet';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
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

async function buildProofProposalPayload(wallet) {
    const builder = new ConsensusMessageBuilder(wallet, config);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(1)
        .setEpoch(1)
        .setPreviousEpochRecordHash(b4a.alloc(32, 1))
        .setProposer(wallet.address)
        .setVdfParametersHash(b4a.alloc(32, 2))
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
