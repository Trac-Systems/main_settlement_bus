import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import { EpochCoordinatorOperations } from '../../../../../../src/core/consensus/services/EpochCoordinatorOperations.js';
import { ConsensusResultCode } from '../../../../../../src/utils/constants.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';
// esmock depends on node:module - tests that mock module imports (via opsWithMocks) are Node-only.
const nodeOnlyTest = isBareRuntime ? test.skip : test;

// Mock keys are relative to THIS test file (esmock resolves from test file location)
const FACTORY_PATH = '../../../../../../src/messages/consensus/v1/consensusMessageFactory.js';
const APPLY_STATE_FACTORY_PATH = '../../../../../../src/messages/state/applyStateMessageFactory.js';
const ADDRESS_UTILS_PATH = '../../../../../../src/core/state/utils/address.js';
const APPLY_CODEC_PATH = '../../../../../../src/codecs/apply/applyOperationCodec.js';
const CONSENSUS_CODEC_PATH = '../../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';

const CONFIG = Object.freeze({
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 2048,
    networkId: 1,
    addressPrefix: 'trac',
});

const WALLET_ADDRESS = 'trac1walletaddress';

const makeState = (overrides = {}) => ({
    getRegisteredWriterKey: sinon.stub().resolves(b4a.alloc(32, 0xaa)),
    writingKey: b4a.alloc(32, 1),
    append: sinon.stub().resolves(),
    ...overrides,
});

const makeVdfService = (overrides = {}) => ({
    calculateVDF: sinon.stub().resolves({ solution: b4a.alloc(516, 0xff) }),
    ...overrides,
});

const makeConnectionManager = (overrides = {}) => ({
    connected: sinon.stub().returns(true),
    send: sinon.stub().resolves({ resultCode: ConsensusResultCode.OK, approval: { approver: b4a.alloc(21, 0x02), approval_sig: b4a.alloc(64, 0xbb) } }),
    ...overrides,
});

// EpochCoordinatorOperations takes no connectionManager - callers pass it per method call
// (sendToIndexer/collectSignature), it is never stored on the instance.
const makeOps = (overrides = {}) =>
    new EpochCoordinatorOperations(
        overrides.state ?? makeState(),
        overrides.vdfService ?? makeVdfService(),
        overrides.wallet ?? { address: WALLET_ADDRESS },
        overrides.config ?? { ...CONFIG },
    );

const opsWithMocks = async (mocks = {}) => {
    const { default: esmock } = await import('esmock');
    const { EpochCoordinatorOperations: Ops } = await esmock(
        '../../../../../../src/core/consensus/services/EpochCoordinatorOperations.js',
        mocks,
    );
    return (overrides = {}) => new Ops(
        overrides.state ?? makeState(),
        overrides.vdfService ?? makeVdfService(),
        overrides.wallet ?? { address: WALLET_ADDRESS },
        overrides.config ?? { ...CONFIG },
    );
};

// --- calculateVDF ---

test('calculateVDF calls vdfService with hash/difficulty/discriminantSizeBits and returns the solution', async t => {
    const hash = b4a.alloc(32, 0xcc);
    const solution = b4a.alloc(516, 0xdd);
    const vdfService = makeVdfService({ calculateVDF: sinon.stub().resolves({ solution }) });
    const ops = makeOps({ vdfService });

    const result = await ops.calculateVDF(hash, 150, 4096);

    t.ok(vdfService.calculateVDF.calledWith(hash, 150, 4096));
    t.ok(b4a.equals(result.solution, solution));
    t.is(result.difficulty, 150);
    t.is(result.discriminantSizeBits, 4096);
});

// --- createProofProposal ---

nodeOnlyTest('createProofProposal targets epoch = prevEpochId + 1n and forwards the previous epoch hash', async t => {
    const buildProofProposal = sinon.stub().resolves({ proof_proposal: { epoch: b4a.alloc(8) } });
    const make = await opsWithMocks({
        [FACTORY_PATH]: { consensusMessageFactory: () => ({ buildProofProposal }) },
    });
    const prevEpochHash = b4a.alloc(32, 0x01);
    const vdf = { difficulty: 100, discriminantSizeBits: 2048, solution: b4a.alloc(516, 0xff) };

    const result = await make().createProofProposal(4n, prevEpochHash, vdf);

    t.ok(result);
    const [, , epoch, hash, , , solution] = buildProofProposal.firstCall.args;
    t.is(epoch, 5n);
    t.ok(b4a.equals(hash, prevEpochHash));
    t.ok(b4a.equals(solution, vdf.solution));
});

// --- sendToIndexer ---

test('sendToIndexer throws if the indexer is not in the connection manager', async t => {
    const connectionManager = makeConnectionManager({ connected: sinon.stub().returns(false) });
    const ops = makeOps();
    await t.exception(ops.sendToIndexer('abcd', {}, connectionManager), /Indexer not in the manager/);
});

test('sendToIndexer returns resultCode and signature from the response', async t => {
    const sig = b4a.alloc(64, 0xaa);
    const connectionManager = makeConnectionManager({
        send: sinon.stub().resolves({ resultCode: ConsensusResultCode.OK, approval: { approval_sig: sig } }),
    });
    const ops = makeOps();

    const result = await ops.sendToIndexer('abcd', { type: 1 }, connectionManager);

    t.is(result.resultCode, ConsensusResultCode.OK);
    t.ok(b4a.equals(result.signature, sig));
});

test('sendToIndexer surfaces a non-OK resultCode with no signature', async t => {
    const connectionManager = makeConnectionManager({
        send: sinon.stub().resolves({ resultCode: ConsensusResultCode.EPOCH_INVALID }),
    });
    const ops = makeOps();

    const result = await ops.sendToIndexer('abcd', { type: 1 }, connectionManager);

    t.is(result.resultCode, ConsensusResultCode.EPOCH_INVALID);
    t.absent(result.signature);
});

// --- collectSignature ---

test('collectSignature throws if getRegisteredWriterKey returns null', async t => {
    const ops = makeOps({ state: makeState({ getRegisteredWriterKey: sinon.stub().resolves(null) }) });
    await t.exception(ops.collectSignature({ key: b4a.alloc(32) }, {}, makeConnectionManager()), /Registered writer key not found/);
});

nodeOnlyTest('collectSignature throws if address cannot be resolved', async t => {
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(null) } },
    });
    await t.exception(make().collectSignature({ key: b4a.alloc(32) }, {}, makeConnectionManager()), /Writer address could not be decoded/);
});

nodeOnlyTest('collectSignature throws with resultCode attached when the peer rejects with a non-OK code', async t => {
    const otherAddress = 'trac1otheraddress';
    const decodedPublicKey = b4a.alloc(32, 0x09);
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        'trac-crypto-api': { default: { address: { decode: sinon.stub().returns(decodedPublicKey) } } },
    });
    const connectionManager = makeConnectionManager({
        send: sinon.stub().resolves({ resultCode: ConsensusResultCode.EPOCH_INVALID }),
    });

    let caught;
    try {
        await make().collectSignature({ key: b4a.alloc(32) }, {}, connectionManager);
    } catch (err) {
        caught = err;
    }
    t.is(caught?.resultCode, ConsensusResultCode.EPOCH_INVALID);
});

nodeOnlyTest('collectSignature throws if resultCode is OK but no signature was returned', async t => {
    const otherAddress = 'trac1otheraddress';
    const decodedPublicKey = b4a.alloc(32, 0x09);
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        'trac-crypto-api': { default: { address: { decode: sinon.stub().returns(decodedPublicKey) } } },
    });
    const connectionManager = makeConnectionManager({
        send: sinon.stub().resolves({ resultCode: ConsensusResultCode.OK, approval: null }),
    });

    await t.exception(make().collectSignature({ key: b4a.alloc(32) }, {}, connectionManager), /Approval signature not received/);
});

nodeOnlyTest('collectSignature returns signature and approver address buffer on success', async t => {
    const otherAddress = 'trac1otheraddress';
    const decodedPublicKey = b4a.alloc(32, 0x09);
    const sig = b4a.alloc(64, 0xbb);
    const memberKey = b4a.alloc(32, 0x01);
    const make = await opsWithMocks({
        [ADDRESS_UTILS_PATH]: { default: { bufferToAddress: sinon.stub().returns(otherAddress) } },
        'trac-crypto-api': { default: { address: { decode: sinon.stub().returns(decodedPublicKey) } } },
    });
    const connectionManager = makeConnectionManager({
        send: sinon.stub().resolves({ resultCode: ConsensusResultCode.OK, approval: { approval_sig: sig } }),
    });

    const result = await make().collectSignature({ key: memberKey }, {}, connectionManager);

    t.ok(b4a.equals(result.signature, sig));
    t.ok(result.approver);
});

// --- buildSetEpochPayload ---

nodeOnlyTest('buildSetEpochPayload encodes proof + approvals into the applied payload', async t => {
    const encoded = b4a.alloc(64, 0xcc);
    const builtMessage = { some: 'message' };
    const buildCompleteSetEpochMessage = sinon.stub().resolves(builtMessage);
    const make = await opsWithMocks({
        [APPLY_STATE_FACTORY_PATH]: { applyStateMessageFactory: () => ({ buildCompleteSetEpochMessage }) },
        [APPLY_CODEC_PATH]: { safeEncodeApplyOperation: sinon.stub().returns(encoded) },
        [CONSENSUS_CODEC_PATH]: {
            safeEncodeProofProposal: sinon.stub().returns(b4a.alloc(1)),
            safeEncodeProofProposalApproval: sinon.stub().returns(b4a.alloc(1)),
        },
    });
    const proofProposal = { protocol_version: 1, network_id: 1, epoch: 2, previous_epoch_record_hash: b4a.alloc(32), vdf_parameters_hash: b4a.alloc(258), vdf_proof: b4a.alloc(258), signature: b4a.alloc(64) };
    const signatures = [{ signature: b4a.alloc(64), approver: b4a.alloc(21) }];

    const payload = await make().buildSetEpochPayload(proofProposal, signatures);

    t.ok(b4a.equals(payload, encoded));
    t.ok(buildCompleteSetEpochMessage.calledWith(WALLET_ADDRESS));
});

nodeOnlyTest('buildSetEpochPayload does not append to state', async t => {
    const state = makeState();
    const make = await opsWithMocks({
        [APPLY_STATE_FACTORY_PATH]: { applyStateMessageFactory: () => ({ buildCompleteSetEpochMessage: sinon.stub().resolves({}) }) },
        [APPLY_CODEC_PATH]: { safeEncodeApplyOperation: sinon.stub().returns(b4a.alloc(64)) },
        [CONSENSUS_CODEC_PATH]: {
            safeEncodeProofProposal: sinon.stub().returns(b4a.alloc(1)),
            safeEncodeProofProposalApproval: sinon.stub().returns(b4a.alloc(1)),
        },
    });
    const proofProposal = { protocol_version: 1, network_id: 1, epoch: 2, previous_epoch_record_hash: b4a.alloc(32), vdf_parameters_hash: b4a.alloc(258), vdf_proof: b4a.alloc(258), signature: b4a.alloc(64) };

    await make({ state }).buildSetEpochPayload(proofProposal, []);

    t.absent(state.append.called);
});

// --- appendSetEpoch ---

test('appendSetEpoch calls state.append with the given payload', async t => {
    const state = makeState();
    const payload = b4a.alloc(64, 0xcc);

    await makeOps({ state }).appendSetEpoch(payload);

    t.ok(state.append.calledOnceWith(payload));
});

// --- approvers ---

// approvers() only excludes self (writingKey) - it does not call getAdminEntry at all, so an
// admin that is also a registered indexer is treated like any other approver.
test('approvers excludes only self, including when an admin entry also appears as an indexer', async t => {
    const writingKey = b4a.alloc(32, 1);
    const adminKey = b4a.alloc(32, 2);
    const otherKey = b4a.alloc(32, 3);
    const state = makeState({
        writingKey,
        getIndexersEntry: sinon.stub().resolves([
            { key: writingKey },
            { key: adminKey },
            { key: otherKey },
        ]),
    });

    const result = await makeOps({ state }).approvers();

    t.is(result.length, 2);
    t.ok(result.some(({ key }) => b4a.equals(key, adminKey)));
    t.ok(result.some(({ key }) => b4a.equals(key, otherKey)));
});

test('approvers returns everyone but self', async t => {
    const writingKey = b4a.alloc(32, 1);
    const otherKey = b4a.alloc(32, 3);
    const state = makeState({
        writingKey,
        getIndexersEntry: sinon.stub().resolves([{ key: writingKey }, { key: otherKey }]),
    });

    const result = await makeOps({ state }).approvers();

    t.is(result.length, 1);
    t.ok(b4a.equals(result[0].key, otherKey));
});
