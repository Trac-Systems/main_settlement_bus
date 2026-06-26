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

function assertThrowsMessageIncludes(t, fn, expectedMessage) {
    try {
        fn();
        t.fail(`Expected error including: ${expectedMessage}`);
    } catch (error) {
        t.ok(error?.message?.includes(expectedMessage));
    }
}

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

test('registerPendingRequest stores the expected entry shape for proof proposals', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const promise = service.registerPendingRequest(validPeerA, message);
    promise.catch(() => {});
    t.teardown(() => service.close());

    const entry = service.getPendingRequest(message.session_id);
    t.alike(entry, {
        id: message.session_id,
        requestType: message.type,
        requestedTo: validPeerA,
        timeoutId: entry.timeoutId,
        resolve: entry.resolve,
        reject: entry.reject,
    });
    t.absent('requestEpochProofProposalHash' in entry);
    t.is(typeof entry.resolve, 'function');
    t.is(typeof entry.reject, 'function');
});

test('registerPendingRequest rejects invalid proof proposal input', async t => {
    const service = new IndexerPendingRequestService(config);
    const validProposal = await buildProofProposal({ sessionId: 'invalid-peer' });

    assertThrowsMessageIncludes(
        t,
        () => service.registerPendingRequest(validPeerA, 'not-an-object'),
        'Pending request ID must be a non-empty string.'
    );

    assertThrowsMessageIncludes(
        t,
        () => service.registerPendingRequest(validPeerA, {
            session_id: '',
            type: ConsensusOperationType.PROOF_PROPOSAL
        }),
        'Pending request ID must be a non-empty string.'
    );

    assertThrowsMessageIncludes(
        t,
        () => service.registerPendingRequest(validPeerA, {
            session_id: 'invalid-type',
            type: 'PROOF_PROPOSAL'
        }),
        'Unsupported pending request type'
    );

    assertThrowsMessageIncludes(
        t,
        () => service.registerPendingRequest('deadbeef', validProposal),
        'Invalid peer public key. Expected 32-byte hex string.'
    );

    t.is(service.getPendingRequest('invalid-type'), null);
});

test('registerPendingRequest throws when proof proposal message is null', t => {
    const service = new IndexerPendingRequestService(config);

    try {
        service.registerPendingRequest(validPeerA, null);
        t.fail('Expected registerPendingRequest to throw for null message');
    } catch (error) {
        t.ok(error?.message?.includes('Pending request ID must be a non-empty string.'));
    }
});
