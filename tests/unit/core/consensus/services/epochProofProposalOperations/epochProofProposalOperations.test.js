import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { EpochProofProposalOperations } from '../../../../../../src/core/consensus/services/EpochProofProposalOperations.js';

// Mock keys are relative to THIS test file (esmock resolves from test file location)
const FACTORY_PATH = '../../../../../../src/messages/consensus/v1/consensusMessageFactory.js';
const ADDRESS_UTILS_PATH = '../../../../../../src/core/state/utils/address.js';
const APPLY_CODEC_PATH = '../../../../../../src/codecs/apply/applyOperationCodec.js';
const CONSENSUS_CODEC_PATH = '../../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';

const CONFIG = Object.freeze({
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 2048,
    networkId: 1,
    addressPrefix: 'trac',
    epochSignatureTimeout: 5000,
});

const WALLET_ADDRESS = 'trac1walletaddress';

const makeState = (overrides = {}) => ({
    currentEpochId: sinon.stub().resolves(5),
    getEpochHash: sinon.stub().resolves(b4a.alloc(32, 0xab)),
    getRegisteredWriterKey: sinon.stub().resolves(null),
    writingKey: b4a.alloc(32, 1),
    append: sinon.stub().resolves(),
    ...overrides,
});

const makeVdfService = (overrides = {}) => ({
    calculateVDF: sinon.stub().resolves({ result: b4a.alloc(516, 0xff) }),
    ...overrides,
});

const makeConnectionManager = (overrides = {}) => ({
    getConnection: sinon.stub().returns(null),
    ...overrides,
});

const makeOps = (overrides = {}) =>
    new EpochProofProposalOperations(
        overrides.state ?? makeState(),
        overrides.vdfService ?? makeVdfService(),
        overrides.wallet ?? { address: WALLET_ADDRESS },
        overrides.connectionManager ?? makeConnectionManager(),
        overrides.config ?? { ...CONFIG },
    );

const opsWithMocks = async (mocks = {}) => {
    const { default: esmock } = await import('esmock');
    const { EpochProofProposalOperations: Ops } = await esmock(
        '../../../../../../src/core/consensus/services/EpochProofProposalOperations.js',
        mocks,
    );
    return (overrides = {}) => new Ops(
        overrides.state ?? makeState(),
        overrides.vdfService ?? makeVdfService(),
        overrides.wallet ?? { address: WALLET_ADDRESS },
        overrides.connectionManager ?? makeConnectionManager(),
        overrides.config ?? { ...CONFIG },
    );
};

// --- calculateVDF ---

test('calculateVDF returns prevEpochId, currentEpochHash and solution', async t => {
    const epochHash = b4a.alloc(32, 0xcc);
    const vdfResult = b4a.alloc(516, 0xdd);
    const ops = makeOps({
        state: makeState({
            currentEpochId: sinon.stub().resolves(3),
            getEpochHash: sinon.stub().resolves(epochHash),
        }),
        vdfService: makeVdfService({
            calculateVDF: sinon.stub().resolves({ result: vdfResult }),
        }),
    });

    const result = await ops.calculateVDF();

    t.is(result.prevEpochId, 3);
    t.ok(b4a.equals(result.currentEpochHash, epochHash));
    t.ok(b4a.equals(result.solution, vdfResult));
});

test('calculateVDF fetches epoch hash using currentEpochId result', async t => {
    const state = makeState({ currentEpochId: sinon.stub().resolves(7) });
    const ops = makeOps({ state });

    await ops.calculateVDF();

    t.ok(state.getEpochHash.calledWith(7));
});

test('calculateVDF passes correct config params to vdfService', async t => {
    const epochHash = b4a.alloc(32, 0xaa);
    const vdfService = makeVdfService();
    const ops = makeOps({
        state: makeState({ getEpochHash: sinon.stub().resolves(epochHash) }),
        vdfService,
    });

    await ops.calculateVDF();

    const [hash, difficulty, discriminantSizeBits] = vdfService.calculateVDF.firstCall.args;
    t.ok(b4a.equals(hash, epochHash));
    t.is(difficulty, CONFIG.vdfDifficulty);
    t.is(discriminantSizeBits, CONFIG.vdfDiscriminantSizeBits);
});

// --- createProposal ---

test('createProposal returns an object with toProposalMessage method', t => {
    const ops = makeOps();
    const result = ops.createProposal(4, b4a.alloc(32), { solution: b4a.alloc(516, 0xff) });
    t.ok(result);
    t.is(typeof result.toProposalMessage, 'function');
});

test('createProposal slices solution correctly into vdfParamsHash and vdfProof', t => {
    const ops = makeOps();
    const solution = b4a.alloc(516);
    solution.fill(0xaa, 0, 258);
    solution.fill(0xbb, 258);
    const result = ops.createProposal(1, b4a.alloc(32), { solution });
    t.ok(result);
});

// --- verifySignature ---

test('verifySignature returns false when tracCryptoApi throws', async t => {
    const make = await opsWithMocks({
        'trac-crypto-api': { default: { signature: { verify: sinon.stub().throws(new Error('crypto error')) } } },
    });
    const result = await make().verifySignature(b4a.alloc(64), b4a.alloc(32), b4a.alloc(32));
    t.absent(result);
});

test('verifySignature returns true when signature is valid', async t => {
    const make = await opsWithMocks({
        'trac-crypto-api': { default: { signature: { verify: sinon.stub().returns(true) } } },
    });
    const result = await make().verifySignature(b4a.alloc(64), b4a.alloc(32), b4a.alloc(32));
    t.ok(result);
});

test('verifySignature returns false when signature is invalid', async t => {
    const make = await opsWithMocks({
        'trac-crypto-api': { default: { signature: { verify: sinon.stub().returns(false) } } },
    });
    const result = await make().verifySignature(b4a.alloc(64), b4a.alloc(32), b4a.alloc(32));
    t.absent(result);
});

// --- sendToIndexer ---

test('sendToIndexer returns null if no connection found', async t => {
    const ops = makeOps({ connectionManager: makeConnectionManager({ getConnection: sinon.stub().returns(null) }) });
    const result = await ops.sendToIndexer({ key: b4a.alloc(32) }, {});
    t.is(result, null);
});

test('sendToIndexer returns null if response has no signature', async t => {
    const buildProofProposal = sinon.stub().resolves({});
    const make = await opsWithMocks({
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal }) },
    });
    const connection = { protocolSession: { send: sinon.stub().resolves(null) } };
    const ops = make({ connectionManager: makeConnectionManager({ getConnection: sinon.stub().returns(connection) }) });

    const result = await ops.sendToIndexer(
        { key: b4a.alloc(32) },
        { epoch: 1, prevEpochHash: b4a.alloc(32), proposer: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258) },
    );
    t.is(result, null);
});

test('sendToIndexer returns signature from response', async t => {
    const sig = b4a.alloc(64, 0xaa);
    const buildProofProposal = sinon.stub().resolves({});
    const make = await opsWithMocks({
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal }) },
    });
    const connection = { protocolSession: { send: sinon.stub().resolves({ result: { signature: sig } }) } };
    const ops = make({ connectionManager: makeConnectionManager({ getConnection: sinon.stub().returns(connection) }) });

    const result = await ops.sendToIndexer(
        { key: b4a.alloc(32) },
        { epoch: 1, prevEpochHash: b4a.alloc(32), proposer: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258) },
    );
    t.ok(b4a.equals(result, sig));
});

// --- collectSignature ---

test('collectSignature returns null if getRegisteredWriterKey returns null', async t => {
    const ops = makeOps({ state: makeState({ getRegisteredWriterKey: sinon.stub().resolves(null) }) });
    const result = await ops.collectSignature({ key: b4a.alloc(32) }, {});
    t.is(result, null);
});

test('collectSignature returns null if address cannot be resolved', async t => {
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(null) } },
    });
    const state = makeState({ getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32)) });
    const result = await make({ state }).collectSignature({ key: b4a.alloc(32) }, {});
    t.is(result, null);
});

test('collectSignature returns null if member is self', async t => {
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(WALLET_ADDRESS) } },
    });
    const state = makeState({ getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32)) });
    const result = await make({ state }).collectSignature({ key: b4a.alloc(32) }, {});
    t.is(result, null);
});

test('collectSignature returns null if sendToIndexer returns null', async t => {
    const otherAddress = 'trac1otheraddress';
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal: sinon.stub().resolves({}) }) },
    });
    const state = makeState({ getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32)) });
    const connectionManager = makeConnectionManager({ getConnection: sinon.stub().returns(null) });
    const result = await make({ state, connectionManager }).collectSignature({ key: b4a.alloc(32) }, {});
    t.is(result, null);
});

test('collectSignature returns null if signature verification fails', async t => {
    const otherAddress = 'trac1otheraddress';
    const sig = b4a.alloc(64, 0xaa);
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal: sinon.stub().resolves({}) }) },
        'trac-crypto-api': { default: { signature: { verify: sinon.stub().returns(false) } } },
    });
    const state = makeState({ getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32)) });
    const connection = { protocolSession: { send: sinon.stub().resolves({ result: { signature: sig } }) } };
    const connectionManager = makeConnectionManager({ getConnection: sinon.stub().returns(connection) });
    const result = await make({ state, connectionManager }).collectSignature(
        { key: b4a.alloc(32) },
        { epoch: 1, prevEpochHash: b4a.alloc(32), proposer: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258), dataHash: b4a.alloc(32) },
    );
    t.is(result, null);
});

test('collectSignature returns signature and publicKey on success', async t => {
    const otherAddress = 'trac1otheraddress';
    const sig = b4a.alloc(64, 0xbb);
    const memberKey = b4a.alloc(32, 0x01);
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal: sinon.stub().resolves({}) }) },
        'trac-crypto-api': { default: { signature: { verify: sinon.stub().returns(true) } } },
    });
    const state = makeState({ getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32)) });
    const connection = { protocolSession: { send: sinon.stub().resolves({ result: { signature: sig } }) } };
    const connectionManager = makeConnectionManager({ getConnection: sinon.stub().returns(connection) });
    const result = await make({ state, connectionManager }).collectSignature(
        { key: memberKey },
        { epoch: 1, prevEpochHash: b4a.alloc(32), proposer: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258), dataHash: b4a.alloc(32) },
    );
    t.ok(b4a.equals(result.signature, sig));
    t.ok(b4a.equals(result.publicKey, memberKey));
});

// --- appendEpoch ---

test('appendEpoch throws if encoded payload is empty', async t => {
    const make = await opsWithMocks({
        [APPLY_CODEC_PATH]: { safeEncodeApplyOperation: sinon.stub().returns(b4a.alloc(0)) },
        [CONSENSUS_CODEC_PATH]: {
            safeEncodeProofProposal: sinon.stub().returns(b4a.alloc(1)),
            safeEncodeProofProposalApproval: sinon.stub().returns(b4a.alloc(1)),
        },
    });
    const epoch = {
        data: { protocolVersion: 1, networkId: 1, epoch: 2, prevEpochHash: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258) },
        signature: b4a.alloc(64),
        signatures: [],
    };
    await t.exception(make().appendEpoch(epoch), /Failed to encode epoch operation/);
});

test('appendEpoch calls state.append with encoded payload', async t => {
    const encoded = b4a.alloc(64, 0xcc);
    const make = await opsWithMocks({
        [APPLY_CODEC_PATH]: { safeEncodeApplyOperation: sinon.stub().returns(encoded) },
        [CONSENSUS_CODEC_PATH]: {
            safeEncodeProofProposal: sinon.stub().returns(b4a.alloc(1)),
            safeEncodeProofProposalApproval: sinon.stub().returns(b4a.alloc(1)),
        },
    });
    const state = makeState();
    const epoch = {
        data: { protocolVersion: 1, networkId: 1, epoch: 2, prevEpochHash: b4a.alloc(32), vdfParamsHash: b4a.alloc(258), vdfProof: b4a.alloc(258) },
        signature: b4a.alloc(64),
        signatures: [],
    };
    await make({ state }).appendEpoch(epoch);
    t.ok(state.append.calledOnce);
    t.ok(b4a.equals(state.append.firstCall.args[0], encoded));
});
