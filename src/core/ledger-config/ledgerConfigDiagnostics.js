import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { safeDecodeEpochProof } from '../../codecs/apply/applyOperationCodec.js';
import {
    safeDecodeProofProposal,
    safeDecodeProofProposalApproval,
} from '../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { bufferToAddress } from '../state/utils/address.js';
import { createZeroCommitId } from './ledgerConfigConstants.js';

const MAX_CONFIG_HISTORY_RECORDS = 10_000;

const toHex = value => b4a.isBuffer(value) ? b4a.toString(value, 'hex') : null;

const printableUtf8 = value => {
    if (!b4a.isBuffer(value) || value.length === 0) return null;
    const decoded = b4a.toString(value, 'utf8');
    return /^[\x20-\x7e]+$/.test(decoded) && b4a.equals(b4a.from(decoded, 'utf8'), value)
        ? decoded
        : null;
};

const readUnsigned = (value, bytes) => {
    if (!b4a.isBuffer(value) || value.length !== bytes) return null;
    if (bytes === 1) return value.readUInt8(0);
    if (bytes === 2) return value.readUInt16BE(0);
    if (bytes === 4) return value.readUInt32BE(0);
    if (bytes === 8) return value.readBigUInt64BE(0).toString();
    return null;
};

const errorDetails = error => ({
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    ...(error?.code !== undefined && { code: error.code }),
});

const jsonValue = (value, seen = new WeakSet()) => {
    if (b4a.isBuffer(value)) return toHex(value);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[cycle]';

    seen.add(value);
    if (Array.isArray(value)) return value.map(item => jsonValue(item, seen));

    const normalized = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'function') normalized[key] = jsonValue(item, seen);
    }
    return normalized;
};

const formatDescriptor = descriptor => descriptor ? {
    formatVersion: descriptor.formatVersion,
    commitmentScheme: descriptor.commitmentScheme,
    schemaId: descriptor.schemaId,
    configVersion: descriptor.configVersion,
    configRoot: toHex(descriptor.configRoot),
    configId: toHex(descriptor.configId),
    commitId: toHex(descriptor.commitId),
    contentRef: toHex(descriptor.contentRef),
} : null;

const formatRootRecord = record => record ? {
    ...(record.sourceSignedLength !== undefined && {
        sourceSignedLength: record.sourceSignedLength,
    }),
    previousCommitId: toHex(record.previousCommitId),
    descriptor: formatDescriptor(record.descriptor),
} : null;

const formatEntry = entry => ({
    ...(entry.index !== undefined && { index: entry.index }),
    keyUtf8: printableUtf8(entry.key),
    keyHex: toHex(entry.key),
    valueHex: toHex(entry.value),
    valueBytes: b4a.isBuffer(entry.value) ? entry.value.length : null,
    ...(entry.leafHash !== undefined && { leafHash: toHex(entry.leafHash) }),
});

const formatSnapshot = snapshot => snapshot ? {
    formatVersion: snapshot.formatVersion,
    commitmentScheme: snapshot.commitmentScheme,
    schemaId: snapshot.schemaId,
    entryCount: Array.isArray(snapshot.entries) ? snapshot.entries.length : null,
    entries: Array.isArray(snapshot.entries) ? snapshot.entries.map(formatEntry) : [],
} : null;

const formatTreeNode = node => ({
    type: node.type,
    size: node.size,
    hash: toHex(node.hash),
    ...(node.key !== undefined && {
        keyUtf8: printableUtf8(node.key),
        keyHex: toHex(node.key),
    }),
    ...(node.value !== undefined && {
        valueHex: toHex(node.value),
        valueBytes: b4a.isBuffer(node.value) ? node.value.length : null,
    }),
    ...(node.leftHash !== undefined && { leftHash: toHex(node.leftHash) }),
    ...(node.rightHash !== undefined && { rightHash: toHex(node.rightHash) }),
});

const formatTree = tree => tree ? {
    root: toHex(tree.root),
    leafCount: Array.isArray(tree.entries) ? tree.entries.length : null,
    nodeCount: Array.isArray(tree.nodes) ? tree.nodes.length : null,
    entries: Array.isArray(tree.entries) ? tree.entries.map(formatEntry) : [],
    nodes: Array.isArray(tree.nodes) ? tree.nodes.map(formatTreeNode) : [],
} : null;

const sameCommit = (left, right) => Boolean(
    left?.descriptor?.commitId &&
    right?.descriptor?.commitId &&
    b4a.equals(left.descriptor.commitId, right.descriptor.commitId)
);

const formatProposal = (proposal, addressPrefix) => proposal ? {
    protocolVersion: readUnsigned(proposal.protocol_version, 1),
    protocolVersionHex: toHex(proposal.protocol_version),
    networkId: readUnsigned(proposal.network_id, 2),
    networkIdHex: toHex(proposal.network_id),
    epoch: readUnsigned(proposal.epoch, 8),
    epochHex: toHex(proposal.epoch),
    previousEpochRecordHash: toHex(proposal.previous_epoch_record_hash),
    proposerAddress: b4a.isBuffer(proposal.proposer)
        ? bufferToAddress(proposal.proposer, addressPrefix)
        : null,
    proposerHex: toHex(proposal.proposer),
    configId: toHex(proposal.config_id),
    vdfProofHex: toHex(proposal.vdf_proof),
    vdfProofBytes: b4a.isBuffer(proposal.vdf_proof) ? proposal.vdf_proof.length : null,
    signature: toHex(proposal.signature),
} : null;

const formatApproval = (approval, addressPrefix) => approval ? {
    approverAddress: b4a.isBuffer(approval.approver)
        ? bufferToAddress(approval.approver, addressPrefix)
        : null,
    approverHex: toHex(approval.approver),
    approvalSignature: toHex(approval.approval_sig),
} : null;

const inspectEpochRecord = async ({ state, epoch, addressPrefix }) => {
    const epochHash = await state.getEpoch(epoch);
    if (!epochHash) return null;

    const encodedProof = await state.getEpochProof(epochHash);
    if (!encodedProof) {
        return {
            epoch: epoch.toString(),
            epochHash: toHex(epochHash),
            encodedProof: null,
            error: 'Epoch proof payload is missing.',
        };
    }

    const calculatedHash = await tracCryptoApi.hash.blake3Safe(encodedProof);
    const proof = safeDecodeEpochProof(encodedProof);
    if (!proof) {
        return {
            epoch: epoch.toString(),
            epochHash: toHex(epochHash),
            calculatedEpochHash: toHex(calculatedHash),
            hashMatchesStoredProof: b4a.equals(epochHash, calculatedHash),
            encodedProof: toHex(encodedProof),
            encodedProofBytes: encodedProof.length,
            error: 'Epoch proof payload cannot be decoded.',
        };
    }

    const proposal = safeDecodeProofProposal(proof.pd);
    const approvals = proof.app.map(encoded => ({
        encoded: toHex(encoded),
        decoded: formatApproval(safeDecodeProofProposalApproval(encoded), addressPrefix),
    }));

    return {
        epoch: epoch.toString(),
        epochHash: toHex(epochHash),
        calculatedEpochHash: toHex(calculatedHash),
        hashMatchesStoredProof: b4a.equals(epochHash, calculatedHash),
        encodedProof: toHex(encodedProof),
        encodedProofBytes: encodedProof.length,
        proposalEncoded: toHex(proof.pd),
        proposal: formatProposal(proposal, addressPrefix),
        approvalCount: approvals.length,
        approvals,
    };
};

const loadConfigHistory = async (state, current) => {
    if (!current) return [];

    const history = [];
    const seen = new Set();
    let record = current;

    while (record) {
        const commitId = toHex(record.descriptor?.commitId);
        if (!commitId) throw new Error('LedgerConfig history contains an invalid commit id.');
        if (seen.has(commitId)) throw new Error(`LedgerConfig history cycle detected at ${commitId}.`);
        if (history.length >= MAX_CONFIG_HISTORY_RECORDS) {
            throw new Error(`LedgerConfig history exceeds ${MAX_CONFIG_HISTORY_RECORDS} records.`);
        }

        seen.add(commitId);
        history.push(formatRootRecord(record));

        if (b4a.equals(record.previousCommitId, createZeroCommitId())) break;
        const previousCommitId = record.previousCommitId;
        record = await state.getSignedLedgerConfigRoot(previousCommitId);
        if (!record) throw new Error(`LedgerConfig predecessor ${toHex(previousCommitId)} is missing.`);
    }

    return history;
};

/**
 * Builds a read-only, JSON-safe view of signed LedgerConfig/epoch state and
 * derived local Model B data. Local cache data is intentionally kept in its
 * own section because it is not consensus authority.
 */
export async function buildLedgerConfigDiagnostics({
    state,
    synchronizer = null,
    contentStore = null,
    addressPrefix,
} = {}) {
    if (!state || typeof state.getSignedLedgerConfig !== 'function') {
        throw new TypeError('LedgerConfig diagnostics require a State instance.');
    }

    const diagnostics = {
        state: {
            signedLength: state.getSignedLength?.() ?? null,
            unsignedLength: state.getUnsignedLength?.() ?? null,
        },
        synchronizer: {
            status: synchronizer?.status ?? null,
            consensusReady: synchronizer?.isConsensusReady ?? false,
            lastError: synchronizer?.lastError ? errorDetails(synchronizer.lastError) : null,
        },
        signedLedgerConfig: null,
        configHistoryOrder: 'current-to-genesis',
        configHistory: [],
        localCache: {
            ready: null,
            matchesCurrentSignedConfig: false,
            manifest: null,
        },
        activeLedgerConfig: null,
        epochs: {
            currentEpoch: null,
            genesis: null,
            current: null,
        },
        errors: [],
    };

    let signed = null;
    try {
        signed = await state.getSignedLedgerConfig();
        diagnostics.signedLedgerConfig = formatRootRecord(signed);
        diagnostics.configHistory = await loadConfigHistory(state, signed);
    } catch (error) {
        diagnostics.errors.push({ section: 'signedLedgerConfig', ...errorDetails(error) });
    }

    const active = synchronizer?.activeConfig ?? null;
    if (active) {
        diagnostics.activeLedgerConfig = {
            sourceSignedLength: active.sourceSignedLength,
            previousCommitId: toHex(active.previousCommitId),
            matchesCurrentSignedConfig: sameCommit(active, signed),
            descriptor: formatDescriptor(active.descriptor),
            adapterConfig: jsonValue(active.adapterConfig ?? active.decoded ?? active.adapterValue),
            snapshot: formatSnapshot(active.snapshot),
            tree: formatTree(active.tree),
        };
    }

    if (contentStore?.getReady) {
        try {
            const ready = await contentStore.getReady();
            diagnostics.localCache.ready = ready ? formatRootRecord(ready) : null;
            diagnostics.localCache.matchesCurrentSignedConfig = sameCommit(ready, signed);
            if (ready && contentStore.getManifest) {
                diagnostics.localCache.manifest = formatRootRecord(
                    await contentStore.getManifest(ready.descriptor.commitId)
                );
            }
        } catch (error) {
            diagnostics.errors.push({ section: 'localCache', ...errorDetails(error) });
        }
    }

    let currentEpoch = null;
    try {
        currentEpoch = await state.getCurrentEpoch();
        diagnostics.epochs.currentEpoch = currentEpoch === null ? null : currentEpoch.toString();
        diagnostics.epochs.genesis = await inspectEpochRecord({
            state,
            epoch: 0n,
            addressPrefix,
        });

        diagnostics.epochs.current = currentEpoch === null
            ? null
            : currentEpoch === 0n
                ? { sameAsGenesis: true, ...diagnostics.epochs.genesis }
                : await inspectEpochRecord({ state, epoch: currentEpoch, addressPrefix });
    } catch (error) {
        diagnostics.errors.push({ section: 'epochs', ...errorDetails(error) });
    }

    const genesisConfigId = diagnostics.epochs.genesis?.proposal?.configId ?? null;
    if (genesisConfigId) {
        const boundConfig = diagnostics.configHistory.find(record => (
            record.descriptor?.configId === genesisConfigId
        ));
        diagnostics.epochs.genesis.configBinding = {
            configId: genesisConfigId,
            foundInSignedHistory: Boolean(boundConfig),
            configVersion: boundConfig?.descriptor?.configVersion ?? null,
            commitId: boundConfig?.descriptor?.commitId ?? null,
            isCurrentConfig: diagnostics.signedLedgerConfig?.descriptor?.configId === genesisConfigId,
        };
        if (diagnostics.epochs.current?.sameAsGenesis) {
            diagnostics.epochs.current.configBinding = diagnostics.epochs.genesis.configBinding;
        }
    }

    return diagnostics;
}

export default buildLedgerConfigDiagnostics;
