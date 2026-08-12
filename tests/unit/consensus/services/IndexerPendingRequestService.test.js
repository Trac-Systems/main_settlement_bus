import { test } from 'brittle';
import b4a from 'b4a';
import { v7 as uuidv7 } from 'uuid';
import IndexerPendingRequestService, { IndexerPendingRequestServiceTimeoutError } from '../../../../src/core/consensus/services/IndexerPendingRequestService.js';
import ConsensusMessageBuilder from '../../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE
} from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';
import { WalletProvider } from 'trac-wallet';

const validPeerA = testKeyPair1.publicKey;
const validPeerB = testKeyPair2.publicKey;

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
        .setDifficulty(b4a.alloc(VDF_DIFFICULTY_SIZE))
        .setDiscriminantBitSize(b4a.alloc(VDF_DISCRIMINANT_SIZE))
        .setProof(b4a.alloc(VDF_BLOB_PROOF_SIZE))
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
        proofProposal: message.proof_proposal,
        timeoutId: entry.timeoutId,
        resolve: entry.resolve,
        reject: entry.reject,
    });
    t.ok('proofProposal' in entry, 'proofProposal field is present');
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

test('registerPendingRequest throws when max pending requests reached', async t => {
    // Config is a class with getters — create a plain interface-compatible object
    const limitConfig = {
        maxPendingRequestsInPendingRequestsService: 1,
        indexerPendingRequestTimeout: config.indexerPendingRequestTimeout,
        addressPrefix: config.addressPrefix,
    };
    const service = new IndexerPendingRequestService(limitConfig);

    const msg1 = await buildProofProposal();
    const p1 = service.registerPendingRequest(validPeerA, msg1);
    p1.catch(() => {});
    t.teardown(() => service.close());

    const msg2 = await buildProofProposal();
    try {
        service.registerPendingRequest(validPeerA, msg2);
        t.fail('Expected error for max pending requests');
    } catch (error) {
        t.ok(error.message.includes('Maximum number of pending requests reached.'));
    }
});

test('registerPendingRequest throws on duplicate session id', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const p = service.registerPendingRequest(validPeerA, message);
    p.catch(() => {});
    t.teardown(() => service.close());

    try {
        service.registerPendingRequest(validPeerA, message);
        t.fail('Expected error for duplicate session id');
    } catch (error) {
        t.ok(error.message.includes(`Pending request with ID ${message.session_id}`));
    }
});

test('has returns correct state', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    t.absent(service.has(message.session_id), 'absent before registration');

    const p = service.registerPendingRequest(validPeerA, message);
    p.catch(() => {});
    t.teardown(() => service.close());

    t.ok(service.has(message.session_id), 'present after registration');
});

test('resolvePendingRequest resolves the promise with OK result', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const promise = service.registerPendingRequest(validPeerA, message);
    const resolved = service.resolvePendingRequest(message.session_id);

    t.ok(resolved, 'resolvePendingRequest returns true');
    const result = await promise;
    t.is(result, ConsensusResultCode.OK);
    t.absent(service.has(message.session_id), 'entry removed after resolution');
});

test('resolvePendingRequest returns false for unknown id', t => {
    const service = new IndexerPendingRequestService(config);
    t.absent(service.resolvePendingRequest('nonexistent-id'));
});

test('rejectPendingRequest rejects the promise with an error', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();
    const error = new Error('test rejection');

    const promise = service.registerPendingRequest(validPeerA, message);
    const rejected = service.rejectPendingRequest(message.session_id, error);

    t.ok(rejected, 'rejectPendingRequest returns true');
    t.absent(service.has(message.session_id), 'entry removed after rejection');

    try {
        await promise;
        t.fail('Expected promise to reject');
    } catch (err) {
        t.is(err.message, 'test rejection');
    }
});

test('rejectPendingRequest wraps non-Error rejections', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const promise = service.registerPendingRequest(validPeerA, message);
    service.rejectPendingRequest(message.session_id, { message: 'plain object' });

    try {
        await promise;
        t.fail('Expected rejection');
    } catch (err) {
        t.ok(err instanceof Error);
        t.is(err.message, 'plain object');
    }
});

test('rejectPendingRequest returns false for unknown id', t => {
    const service = new IndexerPendingRequestService(config);
    t.absent(service.rejectPendingRequest('nonexistent-id', new Error('x')));
});

test('getAndDeletePendingRequest removes and returns the entry', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const p = service.registerPendingRequest(validPeerA, message);
    p.catch(() => {});

    const entry = service.getAndDeletePendingRequest(message.session_id);
    t.ok(entry, 'entry returned');
    t.is(entry.id, message.session_id);
    t.absent(service.has(message.session_id), 'removed from map');

    const again = service.getAndDeletePendingRequest(message.session_id);
    t.absent(again, 'returns null on second call');
});

test('rejectPendingRequestsForPeer rejects all requests for a peer', async t => {
    const service = new IndexerPendingRequestService(config);

    const msgA1 = await buildProofProposal();
    const msgA2 = await buildProofProposal();
    const msgB = await buildProofProposal();

    const pA1 = service.registerPendingRequest(validPeerA, msgA1);
    const pA2 = service.registerPendingRequest(validPeerA, msgA2);
    const pB = service.registerPendingRequest(validPeerB, msgB);
    const pA1Rejected = t.exception(async () => pA1, /peer gone/);
    const pA2Rejected = t.exception(async () => pA2, /peer gone/);

    const count = service.rejectPendingRequestsForPeer(validPeerA, new Error('peer gone'));
    t.is(count, 2, 'rejected 2 requests for peerA');
    t.ok(service.has(msgB.session_id), 'peerB request untouched');

    await pA1Rejected;
    await pA2Rejected;

    service.resolvePendingRequest(msgB.session_id);
    await pB;
});

test('rejectPendingRequestsForPeer returns 0 when peer has no requests', async t => {
    const service = new IndexerPendingRequestService(config);
    const count = service.rejectPendingRequestsForPeer(validPeerA, new Error('x'));
    t.is(count, 0);
});

test('stopPendingRequestTimeout stops the timeout', async t => {
    const service = new IndexerPendingRequestService(config);
    const message = await buildProofProposal();

    const p = service.registerPendingRequest(validPeerA, message);
    p.catch(() => {});

    const entry = service.getPendingRequest(message.session_id);
    t.ok(entry.timeoutId, 'timeout is set');

    const stopped = service.stopPendingRequestTimeout(message.session_id);
    t.ok(stopped, 'returns true when stopped');
    t.absent(entry.timeoutId, 'timeoutId is null after stop');

    service.rejectPendingRequest(message.session_id, new Error('cleanup'));
});

test('stopPendingRequestTimeout returns false for unknown id', t => {
    const service = new IndexerPendingRequestService(config);
    t.absent(service.stopPendingRequestTimeout('nonexistent'));
});

test('close rejects all pending requests', async t => {
    const service = new IndexerPendingRequestService(config);

    const msg1 = await buildProofProposal();
    const msg2 = await buildProofProposal();

    const p1 = service.registerPendingRequest(validPeerA, msg1);
    const p2 = service.registerPendingRequest(validPeerB, msg2);
    const p1Rejected = t.exception(async () => p1, /cancelled \(shutdown\)/);
    const p2Rejected = t.exception(async () => p2, /cancelled \(shutdown\)/);

    service.close();

    await p1Rejected;
    await p2Rejected;

    t.absent(service.has(msg1.session_id), 'all entries cleared');
    t.absent(service.has(msg2.session_id), 'all entries cleared');
});

test('IndexerPendingRequestServiceTimeoutError has correct name and message', t => {
    const err = new IndexerPendingRequestServiceTimeoutError('sess-123', 'trac1abc', 5000);
    t.is(err.name, 'IndexerPendingRequestServiceTimeoutError');
    t.ok(err.message.includes('sess-123'));
    t.ok(err.message.includes('trac1abc'));
    t.ok(err.message.includes('5000'));
});
