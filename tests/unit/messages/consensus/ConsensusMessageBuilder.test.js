import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';

import ConsensusMessageBuilder from '../../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import {bufferToAddress} from '../../../../src/core/state/utils/address.js';
import {
    decodeConsensusMessage,
    encodeConsensusMessage,
    encodeProofProposalApproval
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    createMessage,
    uint8ToBuffer,
    uint16ToBuffer,
    uint64ToBuffer, uint32ToBuffer
} from '../../../../src/utils/buffer.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    NetworkResultCode
} from '../../../../src/utils/constants.js';
import {errorMessageIncludes} from '../../../helpers/regexHelper.js';
import {config} from '../../../helpers/config.js';
import {testKeyPair1} from '../../../fixtures/apply.fixtures.js';
import consensusV1OperationFixtures from '../../../fixtures/consensusV1Operation.fixtures.js';

async function createWallet() {
    return await new WalletProvider(config).fromSecretKey(testKeyPair1.secretKey);
}

function uniqueResultCodes() {
    return [...new Set(Object.values(ConsensusResultCode))].sort((a, b) => a - b);
}

test('ConsensusMessageBuilder builds proof proposal and verifies signature', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const header = consensusV1OperationFixtures.proofProposalHeader;
    const proofProposalFixture = consensusV1OperationFixtures.proofProposal;
    const proposer = bufferToAddress(proofProposalFixture.proposer, config.addressPrefix);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId(header.session_id)
        .setTimestamp()
        .setNetworkId(proofProposalFixture.network_id.readUInt16BE(0))
        .setEpoch(Number(proofProposalFixture.epoch.readBigUInt64BE(0)))
        .setPreviousEpochRecordHash(proofProposalFixture.previous_epoch_record_hash)
        .setProposer(proposer)
        .setDifficulty(proofProposalFixture.difficulty)
        .setDiscriminantBitSize(proofProposalFixture.discriminant_bit_size)
        .setProof(proofProposalFixture.proof)
        .buildPayload();

    const payload = builder.getResult();
    t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL);
    t.is(payload.session_id, header.session_id);
    t.ok(Number.isSafeInteger(payload.timestamp) && payload.timestamp > 0);
    const proofProposal = payload.proof_proposal;
    t.alike(proofProposal.network_id, proofProposalFixture.network_id);
    t.alike(proofProposal.epoch, proofProposalFixture.epoch);
    t.alike(proofProposal.previous_epoch_record_hash, proofProposalFixture.previous_epoch_record_hash);
    t.alike(proofProposal.proposer, proofProposalFixture.proposer);
    t.alike(proofProposal.difficulty, proofProposalFixture.difficulty);
    t.alike(proofProposal.discriminant_bit_size, proofProposalFixture.discriminant_bit_size);
    t.alike(proofProposal.proof, proofProposalFixture.proof);
    t.ok(b4a.isBuffer(proofProposal.signature));

    const msg = createMessage(
        uint8ToBuffer(ConsensusProtocolVersion.V1),
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.difficulty,
        proofProposal.discriminant_bit_size,
        proofProposal.proof
    );
    const hash = await tracCryptoApi.hash.blake3(msg);
    t.ok(wallet.verify(proofProposal.signature, hash, wallet.publicKey));

    const decoded = decodeConsensusMessage(encodeConsensusMessage(payload));
    t.alike(decoded.proof_proposal, proofProposal);
});

test('ConsensusMessageBuilder iterates proof proposal response ConsensusResultCode values', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const header = consensusV1OperationFixtures.proofProposalHeader;
    const proofProposalFixture = consensusV1OperationFixtures.proofProposal;
    const proposer = bufferToAddress(proofProposalFixture.proposer, config.addressPrefix);

    for (const code of uniqueResultCodes()) {
        await builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
            .setSessionId(header.session_id)
            .setTimestamp()
            .setNetworkId(proofProposalFixture.network_id.readUInt16BE(0))
            .setEpoch(Number(proofProposalFixture.epoch.readBigUInt64BE(0)))
            .setPreviousEpochRecordHash(proofProposalFixture.previous_epoch_record_hash)
            .setProposer(proposer)
            .setDifficulty(proofProposalFixture.difficulty)
            .setDiscriminantBitSize(proofProposalFixture.discriminant_bit_size)
            .setProof(proofProposalFixture.proof)
            .setRequesterProofSignature(proofProposalFixture.signature)
            .setResultCode(code)
            .setApprover(proposer)
            .buildPayload();

        const payload = builder.getResult();
        t.is(payload.type, ConsensusOperationType.PROOF_PROPOSAL_APPROVAL);
        t.is(payload.proof_proposal_response.result, code);
        t.ok(b4a.isBuffer(payload.proof_proposal_response.response_sig));

        if (code === ConsensusResultCode.OK) {
            t.alike(payload.proof_proposal_response.approval.approver, proofProposalFixture.proposer);
            t.ok(b4a.isBuffer(payload.proof_proposal_response.approval.approval_sig));

            const approvalMessage = createMessage(
                uint8ToBuffer(ConsensusProtocolVersion.V1),
                proofProposalFixture.network_id,
                proofProposalFixture.epoch,
                proofProposalFixture.previous_epoch_record_hash,
                proofProposalFixture.proposer,
                proofProposalFixture.difficulty,
                proofProposalFixture.discriminant_bit_size,
                proofProposalFixture.proof,
                payload.proof_proposal_response.approval.approver,
                proofProposalFixture.signature
            );
            const approvalHash = await tracCryptoApi.hash.blake3(approvalMessage);
            t.ok(wallet.verify(
                payload.proof_proposal_response.approval.approval_sig,
                approvalHash,
                wallet.publicKey
            ));
        } else {
            t.absent(payload.proof_proposal_response.approval);
        }

        const encodedApproval = payload.proof_proposal_response.approval
            ? encodeProofProposalApproval(payload.proof_proposal_response.approval)
            : b4a.alloc(0);
        const responseMessage = createMessage(
            uint32ToBuffer(code),
            encodedApproval
        );
        const responseHash = await tracCryptoApi.hash.blake3(responseMessage);
        t.ok(wallet.verify(payload.proof_proposal_response.response_sig, responseHash, wallet.publicKey));

        const decoded = decodeConsensusMessage(encodeConsensusMessage(payload));
        t.is(decoded.proof_proposal_response.result, code);
        if (code === ConsensusResultCode.OK) {
            t.alike(decoded.proof_proposal_response.approval, payload.proof_proposal_response.approval);
        } else {
            t.absent(decoded.proof_proposal_response.approval);
        }
    }
});

test('ConsensusMessageBuilder rejects invalid header fields and premature result access', t => {
    const builder = new ConsensusMessageBuilder({}, config);

    t.exception(
        () => builder.setType(undefined),
        errorMessageIncludes('Invalid consensus operation type')
    );

    t.exception(
        () => builder.setType(ConsensusOperationType.UNSPECIFIED),
        errorMessageIncludes('Invalid consensus operation type')
    );

    t.exception(
        () => builder.setSessionId(''),
        errorMessageIncludes('Session id must be a non-empty string.')
    );

    t.exception(
        () => builder.getResult(),
        errorMessageIncludes('Header or payload not set before getResult')
    );
});

test('ConsensusMessageBuilder encodes scalar number fields at byte-width boundaries', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const header = consensusV1OperationFixtures.proofProposalHeader;
    const proofProposalFixture = consensusV1OperationFixtures.proofProposal;
    const proposer = bufferToAddress(proofProposalFixture.proposer, config.addressPrefix);
    const cases = [
        {
            networkId: 1,
            epoch: 1,
        },
        {
            networkId: 0xFFFF,
            epoch: Number.MAX_SAFE_INTEGER,
        },
        {
            networkId: 67,
            epoch: 0x100000000,
        }
    ];

    for (const testCase of cases) {
        const networkIdBuffer = uint16ToBuffer(testCase.networkId);
        const epochBuffer = uint64ToBuffer(testCase.epoch);

        await builder
            .setType(ConsensusOperationType.PROOF_PROPOSAL)
            .setSessionId(header.session_id)
            .setTimestamp()
            .setNetworkId(testCase.networkId)
            .setEpoch(testCase.epoch)
            .setPreviousEpochRecordHash(proofProposalFixture.previous_epoch_record_hash)
            .setProposer(proposer)
            .setDifficulty(proofProposalFixture.difficulty)
            .setDiscriminantBitSize(proofProposalFixture.discriminant_bit_size)
            .setProof(proofProposalFixture.proof)
            .buildPayload();

        const payload = builder.getResult();
        const proofProposal = payload.proof_proposal;

        t.alike(proofProposal.network_id, networkIdBuffer);
        t.is(proofProposal.network_id.length, 2);
        t.is(proofProposal.network_id.readUInt16BE(0), testCase.networkId);
        t.alike(proofProposal.epoch, epochBuffer);
        t.is(proofProposal.epoch.length, 8);
        t.is(proofProposal.epoch.readBigUInt64BE(0), BigInt(testCase.epoch));

        const msg = createMessage(
            uint8ToBuffer(ConsensusProtocolVersion.V1),
            proofProposal.network_id,
            proofProposal.epoch,
            proofProposal.previous_epoch_record_hash,
            proofProposal.proposer,
            proofProposal.difficulty,
            proofProposal.discriminant_bit_size,
            proofProposal.proof
        );
        const hash = await tracCryptoApi.hash.blake3(msg);
        t.ok(wallet.verify(proofProposal.signature, hash, wallet.publicKey));
    }
});

test('ConsensusMessageBuilder rejects invalid network id numbers', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const invalidValues = [
        -1,
        0x10000,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '1',
        1n,
        b4a.alloc(2, 1),
    ];

    for (const value of invalidValues) {
        t.exception(
            () => builder.setNetworkId(value),
            errorMessageIncludes('Value must be an unsigned 16-bit integer.')
        );
    }

    t.exception(
        () => builder.setNetworkId(0),
        errorMessageIncludes('Network id must be greater than zero.')
    );
});

test('ConsensusMessageBuilder rejects invalid epoch numbers', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const invalidNumberValues = [
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
    ];
    const invalidTypeValues = [
        '1',
        b4a.alloc(8, 1),
    ];

    for (const value of invalidNumberValues) {
        t.exception(
            () => builder.setEpoch(value),
            errorMessageIncludes('Value must be a non-negative safe integer')
        );
    }

    for (const value of invalidTypeValues) {
        t.exception(
            () => builder.setEpoch(value),
            errorMessageIncludes('Value must be a number or bigint')
        );
    }

    t.exception(
        () => builder.setEpoch(0),
        errorMessageIncludes('Epoch must be greater than zero.')
    );
    t.exception(
        () => builder.setEpoch(0n),
        errorMessageIncludes('Epoch must be greater than zero.')
    );
});

test('ConsensusMessageBuilder rejects invalid buffer and address fields', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);

    t.exception(
        () => builder.setPreviousEpochRecordHash('not-a-buffer'),
        errorMessageIncludes('Previous epoch record hash must be a buffer.')
    );

    t.exception(
        () => builder.setProposer('invalid'),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setProposer(b4a.alloc(0)),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    const foreignPrefixAddress = tracCryptoApi.address.encode(
        'other',
        b4a.from(testKeyPair1.publicKey, 'hex')
    );
    t.exception(
        () => builder.setProposer(foreignPrefixAddress),
        errorMessageIncludes('Proposer must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setDifficulty('not-a-buffer'),
        errorMessageIncludes('Difficulty must be a buffer.')
    );

    t.exception(
        () => builder.setDiscriminantBitSize('not-a-buffer'),
        errorMessageIncludes('Discriminant bit size must be a buffer.')
    );

    t.exception(
        () => builder.setProof('not-a-buffer'),
        errorMessageIncludes('Proof must be a buffer.')
    );

    t.exception(
        () => builder.setApprover('invalid'),
        errorMessageIncludes('Approver must be a valid TRAC address.')
    );

    t.exception(
        () => builder.setRequesterProofSignature('not-a-buffer'),
        errorMessageIncludes('Requester proof signature must be a buffer.')
    );

    t.exception(
        () => builder.setResultCode(67),
        errorMessageIncludes('Invalid consensus result code: 67')
    );

    t.exception(
        () => builder.setResultCode(NetworkResultCode.TX_INVALID_PAYLOAD),
        errorMessageIncludes(`Invalid consensus result code: ${NetworkResultCode.TX_INVALID_PAYLOAD}`)
    );
});

test('ConsensusMessageBuilder rejects missing fields before build result is available', async t => {
    const wallet = await createWallet();
    const header = consensusV1OperationFixtures.proofProposalHeader;
    const proofProposalFixture = consensusV1OperationFixtures.proofProposal;
    const proposer = bufferToAddress(proofProposalFixture.proposer, config.addressPrefix);
    const networkId = proofProposalFixture.network_id.readUInt16BE(0);
    const epoch = Number(proofProposalFixture.epoch.readBigUInt64BE(0));

    const missingHeader = new ConsensusMessageBuilder(wallet, config);
    await t.exception(
        () => missingHeader
            .setType(ConsensusOperationType.PROOF_PROPOSAL)
            .buildPayload(),
        errorMessageIncludes('Header requires session to be set')
    );

    const responseBuilder = new ConsensusMessageBuilder(wallet, config);
    await t.exception(
        () => responseBuilder
            .setType(ConsensusOperationType.PROOF_PROPOSAL_APPROVAL)
            .setSessionId(header.session_id)
            .setTimestamp()
            .setNetworkId(networkId)
            .setEpoch(epoch)
            .setPreviousEpochRecordHash(proofProposalFixture.previous_epoch_record_hash)
            .setProposer(proposer)
            .setDifficulty(proofProposalFixture.difficulty)
            .setDiscriminantBitSize(proofProposalFixture.discriminant_bit_size)
            .setProof(proofProposalFixture.proof)
            .setRequesterProofSignature(proofProposalFixture.signature)
            .setApprover(proposer)
            .buildPayload(),
        errorMessageIncludes('Result code must be set before build.')
    );
});

test('ConsensusMessageBuilder signs non-zero network id and uint64 epochs without dropping fields', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const header = consensusV1OperationFixtures.proofProposalHeader;
    const proofProposalFixture = consensusV1OperationFixtures.proofProposal;
    const proposer = bufferToAddress(proofProposalFixture.proposer, config.addressPrefix);
    const networkId = 1;
    const networkIdBuffer = uint16ToBuffer(networkId);
    const epoch = 0x100000000;
    const epochBuffer = uint64ToBuffer(epoch);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId(header.session_id)
        .setTimestamp()
        .setNetworkId(networkId)
        .setEpoch(epoch)
        .setPreviousEpochRecordHash(proofProposalFixture.previous_epoch_record_hash)
        .setProposer(proposer)
        .setDifficulty(proofProposalFixture.difficulty)
        .setDiscriminantBitSize(proofProposalFixture.discriminant_bit_size)
        .setProof(proofProposalFixture.proof)
        .buildPayload();

    const proofProposal = builder.getResult().proof_proposal;
    t.alike(proofProposal.network_id, networkIdBuffer);
    t.alike(proofProposal.epoch, epochBuffer);

    const signedMessage = createMessage(
        uint8ToBuffer(ConsensusProtocolVersion.V1),
        proofProposal.network_id,
        proofProposal.epoch,
        proofProposal.previous_epoch_record_hash,
        proofProposal.proposer,
        proofProposal.difficulty,
        proofProposal.discriminant_bit_size,
        proofProposal.proof
    );
    const signedHash = await tracCryptoApi.hash.blake3(signedMessage);

    t.ok(wallet.verify(proofProposal.signature, signedHash, wallet.publicKey));

    const legacyMessage = createMessage(
        ConsensusProtocolVersion.V1,
        networkId,
        epoch,
        proofProposalFixture.previous_epoch_record_hash,
        proofProposalFixture.proposer,
        proofProposalFixture.difficulty,
        proofProposalFixture.discriminant_bit_size,
        proofProposalFixture.proof
    );
    const legacyHash = await tracCryptoApi.hash.blake3(legacyMessage);
    t.not(wallet.verify(proofProposal.signature, legacyHash, wallet.publicKey));
});

test('ConsensusMessageBuilder rejects invalid result codes before signing responses', async t => {
    const wallet = await createWallet();
    const builder = new ConsensusMessageBuilder(wallet, config);
    const invalidResultCodes = [-1, 0x100000000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1'];

    for (const code of invalidResultCodes) {
        t.exception(
            () => builder.setResultCode(code),
            errorMessageIncludes(`Invalid consensus result code: ${code}`)
        );
    }
});
