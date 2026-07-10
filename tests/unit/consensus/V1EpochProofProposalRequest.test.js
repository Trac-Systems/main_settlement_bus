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
    createGenesisEpochProof,
    encodeVdfParameters
} from '../../../src/core/state/utils/epochProof.js';
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
import {errorMessageIncludes} from '../../helpers/regexHelper.js';

const vdfTestConfig = new Proxy(config, {
    get(target, property) {
        if (property === 'vdfDifficulty') return 1;
        if (property === 'vdfDiscriminantSizeBits') return 2048;
        return target[property];
    }
});
const vdfProofCache = new Map();
const defaultPreviousEpochRecordHash = b4a.alloc(32, 1);

function createState({
    currentEpoch = 0n,
    currentEpochHash = defaultPreviousEpochRecordHash
} = {}) {
    return {
        getCurrentEpoch: async () => currentEpoch,
        getEpoch: async () => currentEpochHash,
        isIndexerAddress: async () => true
    };
}

async function createWallet(keyPair = testKeyPair1) {
    return await new WalletProvider(config).fromSecretKey(keyPair.secretKey);
}

async function buildGenesisEpochHash(wallet, vdfConfig = vdfTestConfig) {
    const vdfParamsEntry = encodeVdfParameters(
        uint32ToBuffer(vdfConfig.vdfDifficulty),
        uint16ToBuffer(vdfConfig.vdfDiscriminantSizeBits)
    );
    const genesisEpoch = await createGenesisEpochProof(vdfConfig, wallet.address, vdfParamsEntry);

    return await tracCryptoApi.hash.blake3(genesisEpoch);
}

async function buildVdfParametersHash(vdfConfig = vdfTestConfig) {
    const message = createMessage(
        uint32ToBuffer(vdfConfig.vdfDifficulty),
        uint16ToBuffer(vdfConfig.vdfDiscriminantSizeBits)
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

async function buildProofProposalPayload(wallet, vdfConfig = vdfTestConfig, {
    epoch = 1,
    previousEpochRecordHash = defaultPreviousEpochRecordHash
} = {}) {
    const builder = new ConsensusMessageBuilder(wallet, vdfConfig);
    const protocolVersion = uint8ToBuffer(ConsensusProtocolVersion.V1);
    const networkId = uint16ToBuffer(vdfConfig.networkId);
    const epochBuffer = uint64ToBuffer(epoch);
    const proposer = addressToBuffer(wallet.address, vdfConfig.addressPrefix);
    const vdfParametersHash = await buildVdfParametersHash(vdfConfig);
    const challengeData = createMessage(
        protocolVersion,
        networkId,
        epochBuffer,
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
        .setNetworkId(vdfConfig.networkId)
        .setEpoch(epoch)
        .setPreviousEpochRecordHash(previousEpochRecordHash)
        .setProposer(wallet.address)
        .setVdfParametersHash(vdfParametersHash)
        .setVdfProof(vdfProof)
        .buildPayload();

    return builder.getResult();
}

test('V1EpochProofProposalRequest validates proof proposal signature', async t => {
    const wallet = await createWallet();
    const genesisEpochHash = await buildGenesisEpochHash(wallet);
    const state = createState({
        currentEpoch: 0n,
        currentEpochHash: genesisEpochHash
    });
    const getCurrentEpoch = state.getCurrentEpoch;
    let currentEpochReads = 0;
    state.getCurrentEpoch = async () => {
        currentEpochReads++;
        return await getCurrentEpoch();
    };
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, state);
    const payload = await buildProofProposalPayload(wallet, vdfTestConfig, {
        epoch: 1,
        previousEpochRecordHash: genesisEpochHash
    });

    t.is(payload.proof_proposal.vdf_proof.length, VDF_BLOB_PROOF_SIZE);
    await validator.validate(payload, {remotePublicKey: wallet.publicKey});

    t.is(currentEpochReads, 1);
    t.pass();
});

test('V1EpochProofProposalRequest rejects unsupported proof proposal protocol version', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
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
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
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
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
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
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
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

test('V1EpochProofProposalRequest rejects invalid VDF proof', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
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

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('VDF proof is invalid')
    );
});

test('V1EpochProofProposalRequest accepts proposer address matching remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
    const proposer = addressToBuffer(wallet.address, vdfTestConfig.addressPrefix);

    validator.assertAddressWithRemotePublicKey(proposer, wallet.publicKey);

    t.pass();
});

test('V1EpochProofProposalRequest rejects proposer address mismatched with remote public key', async t => {
    const wallet = await createWallet(testKeyPair1);
    const otherWallet = await createWallet(testKeyPair2);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
    const proposer = addressToBuffer(wallet.address, vdfTestConfig.addressPrefix);

    t.exception(
        () => validator.assertAddressWithRemotePublicKey(proposer, otherWallet.publicKey),
        errorMessageIncludes('Address does not match remote public key')
    );
});

test('V1EpochProofProposalRequest rejects invalid proposer address as protocol error', async t => {
    const wallet = await createWallet(testKeyPair1);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
    const invalidProposer = b4a.alloc(vdfTestConfig.addressLength, 1);

    try {
        validator.assertAddressWithRemotePublicKey(invalidProposer, wallet.publicKey);
        t.fail('should throw');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.ok(error.message.includes('Address is invalid'));
    }
});

test('V1EpochProofProposalRequest rejects invalid proof proposal network id', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState());
    const payload = await buildProofProposalPayload(wallet);
    const fakeNetworkId = vdfTestConfig.networkId === 1 ? 2 : 1;
    const fakePayload = {
        ...payload,
        proof_proposal: {
            ...payload.proof_proposal,
            network_id: uint16ToBuffer(fakeNetworkId)
        }
    };

    await t.exception(
        async () => validator.validate(fakePayload, {remotePublicKey: wallet.publicKey}),
        errorMessageIncludes('Invalid proof proposal network id')
    );
});

test('V1EpochProofProposalRequest rejects proof proposal epoch that is not next epoch', async t => {
    const wallet = await createWallet();
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState({currentEpoch: 0n}));
    const payload = await buildProofProposalPayload(wallet, vdfTestConfig, {epoch: 2});

    try {
        await validator.validate(payload, {remotePublicKey: wallet.publicKey});
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.is(error.message, 'Unexpected epoch. Proof proposal must be 1 but got 2');
    }
});

test('V1EpochProofProposalRequest rejects previous epoch record hash mismatch', async t => {
    const wallet = await createWallet();
    const expectedHash = await buildGenesisEpochHash(wallet);
    const payloadHash = b4a.alloc(32, 2);
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, createState({
        currentEpoch: 0n,
        currentEpochHash: expectedHash
    }));
    const payload = await buildProofProposalPayload(wallet, vdfTestConfig, {
        previousEpochRecordHash: payloadHash
    });
    const expectedMessage = `Previous epoch record hash mismatch for epoch 0: expected ${expectedHash.toString('hex')}, got ${payloadHash.toString('hex')}`;

    try {
        await validator.validate(payload, {remotePublicKey: wallet.publicKey});
        t.fail('should reject');
    } catch (error) {
        t.ok(error instanceof V1ConsensusProtocolError);
        t.is(error.resultCode, ConsensusResultCode.UNEXPECTED_ERROR);
        t.is(error.message, expectedMessage);
    }
});

test('V1EpochProofProposalRequest wraps state failures as protocol errors', async t => {
    const wallet = await createWallet();
    const stateError = new Error('State storage is unavailable.');
    const validator = new V1EpochProofProposalRequest(vdfTestConfig, {
        ...createState(),
        getCurrentEpoch: async () => {
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
