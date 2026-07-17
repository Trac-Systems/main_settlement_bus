import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { safeEncodeEpochProof } from '../../../src/codecs/apply/applyOperationCodec.js';
import {
    safeEncodeProofProposal,
    safeEncodeProofProposalApproval,
} from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    buildLedgerConfigDiagnostics,
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
    createZeroCommitId,
} from '../../../src/core/ledger-config/index.js';

const snapshotFor = value => ({
    formatVersion: 1,
    commitmentScheme: 'binary-merkle-v1',
    schemaId: 'trac/autobase-proof-of-time/v1',
    entries: [
        { key: b4a.from('vdf/difficulty'), value: b4a.from([0, 0, 0, value]) },
        { key: b4a.from('vdf/discriminant-size-bits'), value: b4a.from([8, 0]) },
    ],
});

async function configRecord(snapshot, previousCommitId, configVersion) {
    const tree = await buildLedgerConfigTree(snapshot);
    const configId = await calculateConfigId(snapshot, tree.root);
    const commitId = await calculateCommitId(previousCommitId, configId);
    const descriptor = {
        formatVersion: snapshot.formatVersion,
        commitmentScheme: snapshot.commitmentScheme,
        schemaId: snapshot.schemaId,
        configVersion,
        configRoot: tree.root,
        configId,
        commitId,
        contentRef: await calculateContentRef(snapshot),
    };
    return { sourceSignedLength: 20, previousCommitId, descriptor, snapshot, tree };
}

async function genesisProof(configId) {
    const proposal = safeEncodeProofProposal({
        protocol_version: b4a.from([1]),
        network_id: b4a.from([0, 2]),
        epoch: b4a.alloc(8),
        previous_epoch_record_hash: b4a.alloc(32),
        proposer: b4a.from('not-a-valid-address'),
        config_id: configId,
        vdf_proof: b4a.alloc(8),
        signature: b4a.alloc(64),
    });
    const approval = safeEncodeProofProposalApproval({
        approver: b4a.from('not-a-valid-address'),
        approval_sig: b4a.alloc(64),
    });
    const encoded = safeEncodeEpochProof({ pd: proposal, app: [approval] });
    return { encoded, hash: await tracCryptoApi.hash.blake3Safe(encoded) };
}

test('LedgerConfig diagnostics visualize signed history, genesis binding, cache and tree', async t => {
    const first = await configRecord(snapshotFor(7), createZeroCommitId(), 1);
    const current = await configRecord(snapshotFor(9), first.descriptor.commitId, 2);
    const genesis = await genesisProof(first.descriptor.configId);

    const state = {
        getSignedLength: () => 20,
        getUnsignedLength: () => 21,
        getSignedLedgerConfig: async () => current,
        getSignedLedgerConfigRoot: async commitId => (
            b4a.equals(commitId, first.descriptor.commitId) ? first : null
        ),
        getCurrentEpoch: async () => 0n,
        getEpoch: async epoch => epoch === 0n ? genesis.hash : null,
        getEpochProof: async epochHash => b4a.equals(epochHash, genesis.hash)
            ? genesis.encoded
            : null,
    };
    const synchronizer = {
        status: 'CONSENSUS_READY',
        isConsensusReady: true,
        lastError: null,
        activeConfig: {
            ...current,
            adapterConfig: { vdfDifficulty: 9, vdfDiscriminantSize: 2048 },
        },
    };
    const contentStore = {
        getReady: async () => current,
        getManifest: async () => current,
    };

    const diagnostics = await buildLedgerConfigDiagnostics({
        state,
        synchronizer,
        contentStore,
        addressPrefix: 'trac',
    });

    t.is(diagnostics.synchronizer.status, 'CONSENSUS_READY');
    t.ok(diagnostics.synchronizer.consensusReady);
    t.is(diagnostics.configHistory.length, 2);
    t.is(diagnostics.configHistory[0].descriptor.configVersion, 2);
    t.is(diagnostics.configHistory[1].descriptor.configVersion, 1);
    t.ok(diagnostics.localCache.matchesCurrentSignedConfig);
    t.ok(diagnostics.activeLedgerConfig.matchesCurrentSignedConfig);
    t.is(diagnostics.activeLedgerConfig.snapshot.entries[0].keyUtf8, 'vdf/difficulty');
    t.is(diagnostics.activeLedgerConfig.tree.root, toHex(current.tree.root));
    t.ok(diagnostics.epochs.genesis.hashMatchesStoredProof);
    t.is(diagnostics.epochs.genesis.proposal.configId, toHex(first.descriptor.configId));
    t.ok(diagnostics.epochs.genesis.configBinding.foundInSignedHistory);
    t.is(diagnostics.epochs.genesis.configBinding.configVersion, 1);
    t.is(diagnostics.epochs.genesis.configBinding.isCurrentConfig, false);
    t.ok(diagnostics.epochs.current.sameAsGenesis);
    t.is(diagnostics.errors.length, 0);
    t.ok(JSON.stringify(diagnostics).includes('configHistory'));
});

test('LedgerConfig diagnostics remain useful before config and genesis initialization', async t => {
    const state = {
        getSignedLength: () => 0,
        getUnsignedLength: () => 0,
        getSignedLedgerConfig: async () => null,
        getSignedLedgerConfigRoot: async () => null,
        getCurrentEpoch: async () => null,
        getEpoch: async () => null,
        getEpochProof: async () => null,
    };

    const diagnostics = await buildLedgerConfigDiagnostics({ state, addressPrefix: 'trac' });

    t.is(diagnostics.signedLedgerConfig, null);
    t.alike(diagnostics.configHistory, []);
    t.is(diagnostics.epochs.currentEpoch, null);
    t.is(diagnostics.epochs.genesis, null);
    t.is(diagnostics.synchronizer.consensusReady, false);
    t.is(diagnostics.errors.length, 0);
});

function toHex(value) {
    return b4a.toString(value, 'hex');
}
