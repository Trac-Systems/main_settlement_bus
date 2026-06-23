import { test } from 'brittle';
import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';
import IndexerPendingRequestService from '../../../../src/core/consensus/services/IndexerPendingRequestService.js';
import ConsensusMessageBuilder from '../../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import { ConsensusOperationType, ConsensusProtocolVersion } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1 } from '../../../fixtures/apply.fixtures.js';
import { WalletProvider } from 'trac-wallet';

const validPeerA = testKeyPair1.publicKey;

async function createWallet() {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
}

async function buildProofProposal({ sessionId = uuidv7() } = {}) {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId(sessionId)
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(config.networkId)
        .setEpoch(1n)
        .setPreviousEpochRecordHash(b4a.alloc(32))
        .setProposer(wallet.address)
        .setVdfParametersHash(b4a.alloc(32))
        .setVdfProof(b4a.alloc(64))
        .buildPayload();
    return builder.getResult();
}

test('registerPendingRequest stores requestEpochProofProposalHash from proof_proposal', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const promise = service.registerPendingRequest(validPeerA, message);
    promise.catch(() => {});
    t.teardown(() => service.close());

    const entry = service.getPendingRequest(message.session_id);
    t.ok(b4a.isBuffer(entry.requestEpochProofProposalHash));
    t.ok(entry.requestEpochProofProposalHash.length > 0);
});

test('requestEpochProofProposalHash matches hash in proof_proposal body', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const promise = service.registerPendingRequest(validPeerA, message);
    promise.catch(() => {});
    t.teardown(() => service.close());

    const entry = service.getPendingRequest(message.session_id);
    t.alike(entry.requestEpochProofProposalHash, message.proof_proposal.hash);
});

test('registerPendingRequest stores null hash when proof_proposal.hash is missing', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();
    delete message.proof_proposal.hash;

    const promise = service.registerPendingRequest(validPeerA, message);
    promise.catch(() => {});
    t.teardown(() => service.close());

    const entry = service.getPendingRequest(message.session_id);
    t.is(entry.requestEpochProofProposalHash, null);
});
