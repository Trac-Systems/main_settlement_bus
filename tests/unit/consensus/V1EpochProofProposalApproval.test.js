import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalApproval from '../../../src/core/consensus/v1/validators/V1EpochProofProposalApproval.js';
import {V1ConsensusProtocolError} from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import {bufferToAddress} from '../../../src/core/state/utils/address.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {config} from '../../helpers/config.js';
import {testKeyPair1, testKeyPair2, testKeyPair3} from '../../fixtures/apply.fixtures.js';
import {errorMessageIncludes} from '../../helpers/regexHelper.js';
import {createMessage, uint32ToBuffer} from '../../../src/utils/buffer.js';
import {PROOF_OF_TIME_SCHEMA_ID} from '../../../src/core/ledger-config/index.js';

const previousEpochRecordHash = b4a.alloc(32, 1);
const configId = b4a.alloc(32, 2);
const vdfProof = b4a.alloc(VDF_BLOB_PROOF_SIZE, 3);
const activeConfig = Object.freeze({
    descriptor: Object.freeze({
        schemaId: PROOF_OF_TIME_SCHEMA_ID,
        configId
    }),
    adapterConfig: Object.freeze({
        vdfDifficulty: 1,
        vdfDiscriminantSize: 2048
    })
});
const createState = ({isIndexer = true, indexerError = null} = {}) => ({
    requireLedgerConfigConsensusReady: async () => activeConfig,
    isIndexerAddress: async () => {
        if (indexerError) throw indexerError;
        return isIndexer;
    }
});
const state = createState();

async function createWallet(keyPair) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildProofProposalPayload(proposerWallet) {
    const builder = new ConsensusMessageBuilder(proposerWallet, config);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(1)
        .setEpoch(1)
        .setPreviousEpochRecordHash(previousEpochRecordHash)
        .setProposer(proposerWallet.address)
        .setConfigId(configId)
        .setVdfProof(vdfProof)
        .buildPayload();

    return builder.getResult();
}

async function buildProofProposalApprovalPayload(approverWallet, proofProposalPayload, approverAddress = approverWallet.address) {
    const builder = new ConsensusMessageBuilder(approverWallet, config);
    const proofProposal = proofProposalPayload.proof_proposal;

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
        .setSessionId(proofProposalPayload.session_id)
        .setTimestamp()
        .setProtocolVersion(proofProposal.protocol_version[0])
        .setNetworkId(proofProposal.network_id.readUInt16BE(0))
        .setEpoch(Number(proofProposal.epoch.readBigUInt64BE(0)))
        .setPreviousEpochRecordHash(proofProposal.previous_epoch_record_hash)
        .setProposer(bufferToAddress(proofProposal.proposer, config.addressPrefix))
        .setConfigId(proofProposal.config_id)
        .setVdfProof(proofProposal.vdf_proof)
        .setRequesterProofSignature(proofProposal.signature)
        .setResultCode(ConsensusResultCode.OK)
        .setApprover(approverAddress)
        .buildPayload();

    return builder.getResult();
}

async function buildProofProposalRejectionPayload(approverWallet, proofProposalPayload, result = ConsensusResultCode.INVALID_PAYLOAD) {
    const responseHash = await tracCryptoApi.hash.blake3(createMessage(uint32ToBuffer(result)));

    return {
        type: ConsensusOperationType.PROOF_PROPOSAL_APPROVAL,
        session_id: proofProposalPayload.session_id,
        timestamp: Date.now(),
        proof_proposal_response: {
            result,
            response_sig: approverWallet.sign(responseHash),
        },
    };
}

test('V1EpochProofProposalApproval validates approval signature against original proof proposal', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    await validator.validate(
        approvalPayload,
        {remotePublicKey: approverWallet.publicKey},
        proofProposalPayload.proof_proposal
    );

    t.pass();
});

test('V1EpochProofProposalApproval rejects approver that is not an indexer', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, createState({isIndexer: false}));
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    await t.exception(
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('Incoming address is not an indexer.')
    );
});

test('V1EpochProofProposalApproval rejects non-OK response without approval', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalRejectionPayload(approverWallet, proofProposalPayload);

    await t.exception(
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes(`Proof proposal response result code is not OK: ${ConsensusResultCode.INVALID_PAYLOAD}`)
    );
});

test('V1EpochProofProposalApproval rejects fake non-OK response signature before result code handling', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalRejectionPayload(approverWallet, proofProposalPayload);
    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            response_sig: b4a.alloc(64, 9)
        }
    };

    await t.exception(
        async () => validator.validate(
            fakeApprovalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('response signature verification failed')
    );
});

test('V1EpochProofProposalApproval validateSignature does not validate approver address correctness', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const otherWallet = await createWallet(testKeyPair3);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(
        approverWallet,
        proofProposalPayload,
        otherWallet.address
    );

    await validator.validateSignature(
        approvalPayload,
        approverWallet.publicKey,
        proofProposalPayload.proof_proposal
    );

    t.pass();
});

test('V1EpochProofProposalApproval rejects approver address mismatched with remote public key', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const otherWallet = await createWallet(testKeyPair3);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(
        approverWallet,
        proofProposalPayload,
        otherWallet.address
    );

    await t.exception(
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('Address does not match remote public key')
    );
});

test('V1EpochProofProposalApproval rejects fake approval signature message', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);
    const fakeApprover = b4a.from(approvalPayload.proof_proposal_response.approval.approver);
    fakeApprover[0] ^= 0xff;

    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            approval: {
                ...approvalPayload.proof_proposal_response.approval,
                approver: fakeApprover
            }
        }
    };

    await t.exception(
        async () => validator.validateSignature(
            fakeApprovalPayload,
            approverWallet.publicKey,
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('signature verification failed')
    );
});

test('V1EpochProofProposalApproval rejects fake response signature', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);
    const fakeApprovalPayload = {
        ...approvalPayload,
        proof_proposal_response: {
            ...approvalPayload.proof_proposal_response,
            response_sig: b4a.alloc(64, 9)
        }
    };

    await t.exception(
        async () => validator.validate(
            fakeApprovalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        ),
        errorMessageIncludes('response signature verification failed')
    );
});

test('V1EpochProofProposalApproval rejects a proposal for a stale ledger config', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalApproval(config, state);
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);
    const staleProofProposal = {
        ...proofProposalPayload.proof_proposal,
        config_id: b4a.alloc(32, 9)
    };

    await t.exception(
        async () => validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            staleProofProposal
        ),
        errorMessageIncludes('no longer matches the active ledger config')
    );
});

test('V1EpochProofProposalApproval wraps state failures as protocol errors', async t => {
    const proposerWallet = await createWallet(testKeyPair1);
    const approverWallet = await createWallet(testKeyPair2);
    const stateError = new Error('Indexer state is unavailable.');
    const validator = new V1EpochProofProposalApproval(config, createState({indexerError: stateError}));
    const proofProposalPayload = await buildProofProposalPayload(proposerWallet);
    const approvalPayload = await buildProofProposalApprovalPayload(approverWallet, proofProposalPayload);

    try {
        await validator.validate(
            approvalPayload,
            {remotePublicKey: approverWallet.publicKey},
            proofProposalPayload.proof_proposal
        );
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.is(error.message, 'Indexer state is unavailable.');
        t.is(error.cause, stateError);
    }
});
