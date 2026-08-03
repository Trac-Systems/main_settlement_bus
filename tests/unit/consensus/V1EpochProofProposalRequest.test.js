import test from 'brittle';
import b4a from 'b4a';
import {WalletProvider} from 'trac-wallet';
import tracCryptoApi from 'trac-crypto-api';
import {solveWesolowski} from '@tracsystems/trac-vdf';

import ConsensusMessageBuilder from '../../../src/messages/consensus/v1/ConsensusMessageBuilder.js';
import V1EpochProofProposalRequest from '../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import {V1ConsensusProtocolError} from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import {addressToBuffer} from '../../../src/core/state/utils/address.js';
import {
    createGenesisEpochProof
} from '../../../src/core/state/utils/epochProof.js';
import { encodeVdfConfig } from '../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import {
    createMessage,
    uint8ToBuffer,
    uint16ToBuffer,
    uint64ToBuffer,
    uint32ToBuffer
} from '../../../src/utils/buffer.js';
import {
    ConsensusOperationType,
    ConsensusProtocolVersion,
    ConsensusResultCode,
    VDF_BLOB_PROOF_SIZE
} from '../../../src/utils/constants.js';
import {config} from '../../helpers/config.js';
import {testKeyPair1, testKeyPair2} from '../../fixtures/apply.fixtures.js';

const TEST_VDF_PARAMS = Object.freeze({
    vdfDifficulty: 1,
    vdfDiscriminantSize: 2048
});
const vdfProofCache = new Map();
const defaultPreviousEpochRecordHash = b4a.alloc(32, 1);

function keepBareEventLoopAlive(t) {
    if (typeof globalThis.Bare === 'undefined') return;

    const interval = setInterval(() => {}, 100);
    t.teardown(() => clearInterval(interval));
}

function createState({
    currentEpoch = 0n,
    currentEpochHash = defaultPreviousEpochRecordHash,
    vdfDifficulty = TEST_VDF_PARAMS.vdfDifficulty,
    vdfDiscriminantSize = TEST_VDF_PARAMS.vdfDiscriminantSize,
    isIndexer = true
} = {}) {
    return {
        requireCurrentEpoch: async () => currentEpoch,
        requireEpoch: async () => currentEpochHash,
        requireSignedVDFParams: async () => ({
            vdfDifficulty,
            vdfDiscriminantSize
        }),
        isIndexerAddress: async () => isIndexer
    };
}

async function createWallet(keyPair = testKeyPair1) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildGenesisEpochHash(wallet, vdfParams = TEST_VDF_PARAMS) {
    const vdfParamsEntry = encodeVdfConfig({
        difficulty: uint32ToBuffer(vdfParams.vdfDifficulty),
        discriminantBitSize: uint16ToBuffer(vdfParams.vdfDiscriminantSize)
    });
    const genesisEpoch = await createGenesisEpochProof(config, wallet.address, vdfParamsEntry);

    return await tracCryptoApi.hash.blake3(genesisEpoch);
}

async function buildVdfParametersHash(vdfParams = TEST_VDF_PARAMS) {
    const message = createMessage(
        uint32ToBuffer(vdfParams.vdfDifficulty),
        uint16ToBuffer(vdfParams.vdfDiscriminantSize)
    );

    return await tracCryptoApi.hash.blake3(message);
}

async function buildVdfProof(challengeData, vdfParams = TEST_VDF_PARAMS) {
    const cacheKey = [
        vdfParams.vdfDifficulty,
        vdfParams.vdfDiscriminantSize,
        b4a.toString(challengeData, 'hex')
    ].join(':');

    if (!vdfProofCache.has(cacheKey)) {
        vdfProofCache.set(cacheKey, await solveWesolowski(
            challengeData,
            vdfParams.vdfDifficulty,
            vdfParams.vdfDiscriminantSize
        ));
    }

    return b4a.from(vdfProofCache.get(cacheKey));
}

async function buildProofProposalPayload(wallet, {
    epoch = 1,
    previousEpochRecordHash = defaultPreviousEpochRecordHash,
    vdfParams = TEST_VDF_PARAMS
} = {}) {
    const builder = new ConsensusMessageBuilder(wallet, config);
    const protocolVersion = uint8ToBuffer(ConsensusProtocolVersion.V1);
    const networkId = uint16ToBuffer(config.networkId);
    const epochBuffer = uint64ToBuffer(epoch);
    const proposer = addressToBuffer(wallet.address, config.addressPrefix);
    const vdfParametersHash = await buildVdfParametersHash(vdfParams);
    const challengeData = createMessage(
        protocolVersion,
        networkId,
        epochBuffer,
        previousEpochRecordHash,
        proposer,
        vdfParametersHash
    );
    const vdfProof = await buildVdfProof(challengeData, vdfParams);

    await builder
        .setType(ConsensusOperationType.PROOF_PROPOSAL)
        .setSessionId('session')
        .setTimestamp()
        .setProtocolVersion(ConsensusProtocolVersion.V1)
        .setNetworkId(config.networkId)
        .setEpoch(epoch)
        .setPreviousEpochRecordHash(previousEpochRecordHash)
        .setProposer(wallet.address)
        .setVdfParametersHash(vdfParametersHash)
        .setVdfProof(vdfProof)
        .buildPayload();

    return builder.getResult();
}

async function assertProtocolError(t, action, resultCode, messageIncludes) {
    let error;
    try {
        await action();
    } catch (err) {
        error = err;
    }

    t.ok(error instanceof V1ConsensusProtocolError);
    t.is(error.resultCode, resultCode);
    if (messageIncludes) {
        t.ok(error.message.includes(messageIncludes));
    }
}

test('V1EpochProofProposalRequest validates proof proposal signature', async t => {
    // Bare does not track Emscripten's cold asynchronous WASM initialization
    // as an active event-loop handle, so Brittle can otherwise report a deadlock.
    keepBareEventLoopAlive(t);

    const wallet = await createWallet();
    const genesisEpochHash = await buildGenesisEpochHash(wallet);
    const state = createState({
        currentEpoch: 0n,
        currentEpochHash: genesisEpochHash
    });
    const requireCurrentEpoch = state.requireCurrentEpoch;
    const requireSignedVDFParams = state.requireSignedVDFParams;
    let currentEpochReads = 0;
    let vdfParamsReads = 0;
    state.requireCurrentEpoch = async () => {
        currentEpochReads++;
        return await requireCurrentEpoch();
    };
    state.requireSignedVDFParams = async () => {
        vdfParamsReads++;
        return await requireSignedVDFParams();
    };
    const validator = new V1EpochProofProposalRequest(config, state);
    const payload = await buildProofProposalPayload(wallet, {
        epoch: 1,
        previousEpochRecordHash: genesisEpochHash
    });

    t.is(payload.proof_proposal.vdf_proof.length, VDF_BLOB_PROOF_SIZE);
    await validator.validate(payload, {remotePublicKey: wallet.publicKey});

    t.is(currentEpochReads, 1);
    t.is(vdfParamsReads, 1);
    t.pass();
});

test('V1EpochProofProposalRequest rejects proposer that is not an indexer', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState({isIndexer: false}));
    const payload = await buildProofProposalPayload(wallet);

    await assertProtocolError(
        t,
        async () => validator.validate(payload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.INDEXER_ROLE_INVALID,
        'Incoming address is not an indexer.'
    );
});

test('V1EpochProofProposalRequest rejects unsupported proof proposal protocol version', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            protocol_version: b4a.from([2])
        }
    };

    await assertProtocolError(
        t,
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.BAD_PROTOCOL_VERSION,
        'Unsupported proof proposal protocol version'
    );
});

test('V1EpochProofProposalRequest rejects invalid VDF parameters hash', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakeProofProposal = {
        ...payload.proof_proposal,
        vdf_parameters_hash: b4a.alloc(32, 9)
    };
    const challengeData = validator.buildProofProposalChallengeData(fakeProofProposal);
    const signatureMessage = createMessage(challengeData, fakeProofProposal.vdf_proof);
    const signatureHash = await tracCryptoApi.hash.blake3(signatureMessage);
    fakeProofProposal.signature = wallet.sign(signatureHash);
    const fakePayload = {
        ...payload,
        proof_proposal: fakeProofProposal
    };

    await assertProtocolError(
        t,
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.VDF_PARAMETERS_HASH_INVALID,
        'VDF parameters hash is invalid'
    );
});

test('V1EpochProofProposalRequest builds proof proposal challenge data from fields one through six', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
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

test('V1EpochProofProposalRequest rejects invalid proof proposal signature', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            signature: b4a.alloc(64, 9)
        }
    };

    await assertProtocolError(
        t,
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.PROPOSAL_SIGNATURE_INVALID,
        'signature verification failed'
    );
});

test('V1EpochProofProposalRequest rejects invalid VDF proof', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakeProofProposal = {
        ...payload.proof_proposal,
        vdf_proof: b4a.alloc(VDF_BLOB_PROOF_SIZE, 4)
    };
    const challengeData = validator.buildProofProposalChallengeData(fakeProofProposal);
    const signatureMessage = createMessage(challengeData, fakeProofProposal.vdf_proof);
    const signatureHash = await tracCryptoApi.hash.blake3(signatureMessage);
    fakeProofProposal.signature = wallet.sign(signatureHash);

    const fakePayload = {
        ...payload,
        proof_proposal: fakeProofProposal
    };

    await assertProtocolError(
        t,
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.VDF_PROOF_INVALID,
        'VDF proof is invalid'
    );
});

test('V1EpochProofProposalRequest accepts proposer address matching remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const validator = new V1EpochProofProposalRequest(config, createState());
    const proposer = addressToBuffer(wallet.address, config.addressPrefix);

    validator.assertAddressWithRemotePublicKey(proposer, wallet.publicKey);

    t.pass();
});

test('V1EpochProofProposalRequest rejects proposer address mismatched with remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const otherWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalRequest(config, createState());
    const proposer = addressToBuffer(wallet.address, config.addressPrefix);

    await assertProtocolError(
        t,
        () => validator.assertAddressWithRemotePublicKey(proposer, otherWallet.publicKey),
        ConsensusResultCode.PUBLIC_KEY_MISMATCH,
        'Address does not match remote public key'
    );
});

test('V1EpochProofProposalRequest rejects invalid proposer address as protocol error', async t => {
    const wallet = await createWallet(testKeyPair1);
    const validator = new V1EpochProofProposalRequest(config, createState());
    const invalidProposer = b4a.alloc(config.addressLength, 1);

    try {
        validator.assertAddressWithRemotePublicKey(invalidProposer, wallet.publicKey);
        t.fail('should throw');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.ADDRESS_INVALID);
        t.ok(error.message.includes('Address is invalid'));
    }
});

test('V1EpochProofProposalRequest rejects invalid proof proposal network id', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakeNetworkId = config.networkId === 1 ? 2 : 1;
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            network_id: uint16ToBuffer(fakeNetworkId)
        }
    };

    await assertProtocolError(
        t,
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        ConsensusResultCode.WRONG_NETWORK_ID,
        'Invalid proof proposal network id'
    );
});

test('V1EpochProofProposalRequest rejects missing payload type as invalid payload', async t => {
    const validator = new V1EpochProofProposalRequest(config, createState());

    await assertProtocolError(
        t,
        () => validator.isPayloadSchemaValid(undefined),
        ConsensusResultCode.INVALID_PAYLOAD,
        'Payload or payload type is missing'
    );
});

test('V1EpochProofProposalRequest rejects invalid operation type', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);

    await assertProtocolError(
        t,
        () => validator.isPayloadSchemaValid({...payload, type: 'proof'}),
        ConsensusResultCode.OPERATION_TYPE_INVALID,
        'Operation type must be an integer'
    );

    await assertProtocolError(
        t,
        () => validator.isPayloadSchemaValid({...payload, type: ConsensusOperationType.UNSPECIFIED}),
        ConsensusResultCode.OPERATION_TYPE_INVALID,
        'Operation type is unspecified'
    );

    await assertProtocolError(
        t,
        () => validator.isPayloadSchemaValid({...payload, type: 999}),
        ConsensusResultCode.OPERATION_TYPE_INVALID,
        'Unknown operation type'
    );
});

test('V1EpochProofProposalRequest rejects invalid proof proposal schema with schema result code', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState());
    const payload = await buildProofProposalPayload(wallet);
    const invalidPayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            signature: b4a.alloc(63, 1)
        }
    };

    await assertProtocolError(
        t,
        () => validator.isPayloadSchemaValid(invalidPayload),
        ConsensusResultCode.SCHEMA_VALIDATION_FAILED,
        'Payload is invalid'
    );
});

test('V1EpochProofProposalRequest rejects proof proposal epoch that is not next epoch', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(config, createState({currentEpoch: 0n}));
    const payload = await buildProofProposalPayload(wallet, {epoch: 2});

    try {
        await validator.validate(payload, {remotePublicKey: wallet.publicKey});
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.EPOCH_INVALID);
        t.is(error.message, 'Unexpected epoch. Proof proposal must be 1 but got 2');
    }
});

test('V1EpochProofProposalRequest rejects previous epoch record hash mismatch', async t => {
    const wallet = await createWallet();
    const expectedHash = await buildGenesisEpochHash(wallet);
    const payloadHash = b4a.alloc(32, 2);
    const validator = new V1EpochProofProposalRequest(config, createState({
        currentEpoch: 0n,
        currentEpochHash: expectedHash
    }));
    const payload = await buildProofProposalPayload(wallet, {
        previousEpochRecordHash: payloadHash
    });
    const expectedMessage = `Previous epoch record hash mismatch for epoch 0: expected ${expectedHash.toString('hex')}, got ${payloadHash.toString('hex')}`;

    try {
        await validator.validate(payload, {remotePublicKey: wallet.publicKey});
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.PREVIOUS_EPOCH_RECORD_HASH_INVALID);
        t.is(error.message, expectedMessage);
    }
});

test('V1EpochProofProposalRequest wraps state failures as protocol errors', async t => {
    const wallet = await createWallet();
    const stateError = new Error('State storage is unavailable.');
    const validator = new V1EpochProofProposalRequest(config, {
        ...createState(),
        requireCurrentEpoch: async () => {
            throw stateError;
        }
    });
    const payload = await buildProofProposalPayload(wallet);

    try {
        await validator.validate(payload, {remotePublicKey: wallet.publicKey});
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.is(error.message, 'State storage is unavailable.');
        t.is(error.cause, stateError);
    }
});
