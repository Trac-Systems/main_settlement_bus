import b4a from 'b4a';

import applyOperationsGenerated from './applyOperations.generated.cjs';
import {
    LEDGER_CONFIG_COMMITMENT_SCHEME,
    LEDGER_CONFIG_FORMAT_VERSION,
    LEDGER_CONFIG_HASH_BYTES,
    MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES,
} from '../../core/ledger-config/ledgerConfigConstants.js';
import {
    calculateCommitId,
    calculateConfigId,
} from '../../core/ledger-config/ledgerConfigMerkle.js';

const {
    LedgerConfigSnapshot,
    LedgerConfigDescriptor,
    LedgerConfigRootRecord,
    LedgerConfigTransactionReceipt,
    OperationType,
} = applyOperationsGenerated.apply.operations;

const TO_OBJECT_OPTIONS = Object.freeze({
    enums: Number,
    longs: Number,
    bytes: Buffer,
    defaults: false,
    arrays: true,
});

const RECEIPT_PREFIX = b4a.from([0x00, 0x4c, 0x43, 0x54, 0x52, 0x01]); // NUL + LCTR + v1
const MAX_RECEIPT_BYTES = 2_048;
const MAX_REQUESTER_ADDRESS_BYTES = 256;

export const LEDGER_CONFIG_TRANSACTION_RECEIPT_RECORD_TYPE = 'ledger_config_receipt_v1';

const cloneBuffer = value => b4a.isBuffer(value) ? b4a.from(value) : value;

const encodeMessage = (Type, payload, name) => {
    const error = Type.verify(payload);
    if (error) throw new Error(`Invalid ${name}: ${error}`);
    return b4a.from(Type.encode(payload).finish());
};

const decodeMessage = (Type, payload, name) => {
    if (!b4a.isBuffer(payload)) {
        throw new Error(`${name} payload must be a buffer.`);
    }

    return Type.toObject(Type.decode(payload), TO_OBJECT_OPTIONS);
};

export const ledgerConfigSnapshotToWire = snapshot => ({
    format_version: snapshot.formatVersion,
    commitment_scheme: snapshot.commitmentScheme,
    schema_id: snapshot.schemaId,
    entries: snapshot.entries.map(entry => ({
        key: cloneBuffer(entry.key),
        value: cloneBuffer(entry.value),
    })),
});

export const ledgerConfigSnapshotFromWire = snapshot => ({
    formatVersion: snapshot?.format_version,
    commitmentScheme: snapshot?.commitment_scheme,
    schemaId: snapshot?.schema_id,
    entries: Array.isArray(snapshot?.entries)
        ? snapshot.entries.map(entry => ({
            key: cloneBuffer(entry.key),
            value: cloneBuffer(entry.value),
        }))
        : [],
});

export const ledgerConfigDescriptorToWire = descriptor => ({
    format_version: descriptor.formatVersion,
    commitment_scheme: descriptor.commitmentScheme,
    schema_id: descriptor.schemaId,
    config_version: descriptor.configVersion,
    config_root: cloneBuffer(descriptor.configRoot),
    config_id: cloneBuffer(descriptor.configId),
    commit_id: cloneBuffer(descriptor.commitId),
    content_ref: cloneBuffer(descriptor.contentRef),
});

export const ledgerConfigDescriptorFromWire = descriptor => ({
    formatVersion: descriptor?.format_version,
    commitmentScheme: descriptor?.commitment_scheme,
    schemaId: descriptor?.schema_id,
    configVersion: descriptor?.config_version,
    configRoot: cloneBuffer(descriptor?.config_root),
    configId: cloneBuffer(descriptor?.config_id),
    commitId: cloneBuffer(descriptor?.commit_id),
    contentRef: cloneBuffer(descriptor?.content_ref),
});

export const ledgerConfigRootRecordToWire = record => ({
    previous_commit_id: cloneBuffer(record.previousCommitId),
    descriptor: ledgerConfigDescriptorToWire(record.descriptor),
});

export const ledgerConfigRootRecordFromWire = record => ({
    previousCommitId: cloneBuffer(record?.previous_commit_id),
    descriptor: ledgerConfigDescriptorFromWire(record?.descriptor),
});

export const ledgerConfigTransactionReceiptToWire = receipt => ({
    operation_type: receipt.operationType,
    tx_hash: cloneBuffer(receipt.txHash),
    requester_address: cloneBuffer(receipt.requesterAddress),
    root_record: ledgerConfigRootRecordToWire({
        previousCommitId: receipt.previousCommitId,
        descriptor: receipt.descriptor,
    }),
});

export const ledgerConfigTransactionReceiptFromWire = receipt => ({
    operationType: receipt?.operation_type,
    txHash: cloneBuffer(receipt?.tx_hash),
    requesterAddress: cloneBuffer(receipt?.requester_address),
    ...ledgerConfigRootRecordFromWire(receipt?.root_record),
});

const assertReceiptHash = (value, name) => {
    if (!b4a.isBuffer(value) || value.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new Error(`${name} must be a ${LEDGER_CONFIG_HASH_BYTES}-byte Buffer.`);
    }
};

const validateLedgerConfigTransactionReceiptShape = receipt => {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
        throw new Error('Ledger config transaction receipt must be an object.');
    }
    if (receipt.operationType !== OperationType.SET_LEDGER_CONFIG) {
        throw new Error('Ledger config transaction receipt has an invalid operation type.');
    }

    assertReceiptHash(receipt.txHash, 'receipt.txHash');
    if (!b4a.isBuffer(receipt.requesterAddress) || receipt.requesterAddress.length === 0 ||
        receipt.requesterAddress.length > MAX_REQUESTER_ADDRESS_BYTES) {
        throw new Error('receipt.requesterAddress has an invalid length.');
    }
    assertReceiptHash(receipt.previousCommitId, 'receipt.previousCommitId');

    const descriptor = receipt.descriptor;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
        throw new Error('receipt.descriptor must be an object.');
    }
    if (descriptor.formatVersion !== LEDGER_CONFIG_FORMAT_VERSION) {
        throw new Error('Ledger config transaction receipt has an invalid format version.');
    }
    if (descriptor.commitmentScheme !== LEDGER_CONFIG_COMMITMENT_SCHEME) {
        throw new Error('Ledger config transaction receipt has an invalid commitment scheme.');
    }
    if (typeof descriptor.schemaId !== 'string' || descriptor.schemaId.length === 0 ||
        b4a.byteLength(descriptor.schemaId, 'utf8') > MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES) {
        throw new Error('Ledger config transaction receipt has an invalid schema id.');
    }
    if (!Number.isSafeInteger(descriptor.configVersion) || descriptor.configVersion <= 0) {
        throw new Error('Ledger config transaction receipt has an invalid config version.');
    }

    assertReceiptHash(descriptor.configRoot, 'receipt.descriptor.configRoot');
    assertReceiptHash(descriptor.configId, 'receipt.descriptor.configId');
    assertReceiptHash(descriptor.commitId, 'receipt.descriptor.commitId');
    assertReceiptHash(descriptor.contentRef, 'receipt.descriptor.contentRef');

    return {
        operationType: receipt.operationType,
        txHash: b4a.from(receipt.txHash),
        requesterAddress: b4a.from(receipt.requesterAddress),
        previousCommitId: b4a.from(receipt.previousCommitId),
        descriptor: {
            ...descriptor,
            configRoot: b4a.from(descriptor.configRoot),
            configId: b4a.from(descriptor.configId),
            commitId: b4a.from(descriptor.commitId),
            contentRef: b4a.from(descriptor.contentRef),
        },
    };
};

export const encodeLedgerConfigSnapshot = snapshot => {
    return encodeMessage(
        LedgerConfigSnapshot,
        ledgerConfigSnapshotToWire(snapshot),
        'LedgerConfigSnapshot'
    );
};

export const decodeLedgerConfigSnapshot = payload => {
    return ledgerConfigSnapshotFromWire(
        decodeMessage(LedgerConfigSnapshot, payload, 'LedgerConfigSnapshot')
    );
};

export const encodeLedgerConfigDescriptor = descriptor => {
    return encodeMessage(
        LedgerConfigDescriptor,
        ledgerConfigDescriptorToWire(descriptor),
        'LedgerConfigDescriptor'
    );
};

export const decodeLedgerConfigDescriptor = payload => {
    return ledgerConfigDescriptorFromWire(
        decodeMessage(LedgerConfigDescriptor, payload, 'LedgerConfigDescriptor')
    );
};

export const encodeLedgerConfigRootRecord = record => {
    return encodeMessage(
        LedgerConfigRootRecord,
        ledgerConfigRootRecordToWire(record),
        'LedgerConfigRootRecord'
    );
};

export const decodeLedgerConfigRootRecord = payload => {
    return ledgerConfigRootRecordFromWire(
        decodeMessage(LedgerConfigRootRecord, payload, 'LedgerConfigRootRecord')
    );
};

export const encodeLedgerConfigTransactionReceipt = receipt => {
    const validated = validateLedgerConfigTransactionReceiptShape(receipt);
    const body = encodeMessage(
        LedgerConfigTransactionReceipt,
        ledgerConfigTransactionReceiptToWire(validated),
        'LedgerConfigTransactionReceipt'
    );
    const encoded = b4a.concat([RECEIPT_PREFIX, body]);
    if (encoded.length > MAX_RECEIPT_BYTES) {
        throw new Error(`Ledger config transaction receipt exceeds ${MAX_RECEIPT_BYTES} bytes.`);
    }
    return encoded;
};

export const decodeLedgerConfigTransactionReceipt = payload => {
    if (!b4a.isBuffer(payload)) {
        throw new Error('LedgerConfigTransactionReceipt payload must be a buffer.');
    }
    if (payload.length <= RECEIPT_PREFIX.length || payload.length > MAX_RECEIPT_BYTES ||
        !b4a.equals(payload.subarray(0, RECEIPT_PREFIX.length), RECEIPT_PREFIX)) {
        throw new Error('LedgerConfigTransactionReceipt framing is invalid.');
    }

    const body = payload.subarray(RECEIPT_PREFIX.length);
    const decoded = ledgerConfigTransactionReceiptFromWire(
        decodeMessage(
            LedgerConfigTransactionReceipt,
            body,
            'LedgerConfigTransactionReceipt'
        )
    );
    const validated = validateLedgerConfigTransactionReceiptShape(decoded);
    const canonicalBody = encodeMessage(
        LedgerConfigTransactionReceipt,
        ledgerConfigTransactionReceiptToWire(validated),
        'LedgerConfigTransactionReceipt'
    );
    if (!b4a.equals(body, canonicalBody)) {
        throw new Error('LedgerConfigTransactionReceipt body is not canonical.');
    }
    return validated;
};

export const validateLedgerConfigTransactionReceipt = async (receipt, {
    expectedTxHash = undefined,
    expectedAddressLength = undefined,
} = {}) => {
    const validated = validateLedgerConfigTransactionReceiptShape(receipt);

    if (expectedTxHash !== undefined) {
        assertReceiptHash(expectedTxHash, 'expectedTxHash');
        if (!b4a.equals(validated.txHash, expectedTxHash)) {
            throw new Error('Ledger config transaction receipt does not match its transaction key.');
        }
    }
    if (expectedAddressLength !== undefined &&
        validated.requesterAddress.length !== expectedAddressLength) {
        throw new Error('Ledger config transaction receipt requester address length is invalid.');
    }

    const expectedConfigId = await calculateConfigId({
        formatVersion: validated.descriptor.formatVersion,
        commitmentScheme: validated.descriptor.commitmentScheme,
        schemaId: validated.descriptor.schemaId,
        entries: [],
    }, validated.descriptor.configRoot);
    if (!b4a.equals(validated.descriptor.configId, expectedConfigId)) {
        throw new Error('Ledger config transaction receipt config id is inconsistent.');
    }

    const expectedCommitId = await calculateCommitId(
        validated.previousCommitId,
        validated.descriptor.configId
    );
    if (!b4a.equals(validated.descriptor.commitId, expectedCommitId)) {
        throw new Error('Ledger config transaction receipt commit id is inconsistent.');
    }
    if (validated.descriptor.configVersion === 1 &&
        !b4a.equals(validated.previousCommitId, b4a.alloc(LEDGER_CONFIG_HASH_BYTES))) {
        throw new Error('The first ledger config transaction receipt must reference ZERO_COMMIT_ID.');
    }
    if (validated.descriptor.configVersion > 1 &&
        b4a.equals(validated.previousCommitId, b4a.alloc(LEDGER_CONFIG_HASH_BYTES))) {
        throw new Error('A non-genesis ledger config transaction receipt cannot reference ZERO_COMMIT_ID.');
    }

    return validated;
};

export const ledgerConfigTransactionReceiptToDetails = receipt => {
    const validated = validateLedgerConfigTransactionReceiptShape(receipt);
    return {
        type: validated.operationType,
        record_type: LEDGER_CONFIG_TRANSACTION_RECEIPT_RECORD_TYPE,
        address: b4a.from(validated.requesterAddress),
        receipt: {
            tx: b4a.from(validated.txHash),
            previous_commit_id: b4a.from(validated.previousCommitId),
            descriptor: ledgerConfigDescriptorToWire(validated.descriptor),
        },
    };
};

const safely = decoder => payload => {
    try {
        return decoder(payload);
    } catch {
        return null;
    }
};

export const safeDecodeLedgerConfigSnapshot = safely(decodeLedgerConfigSnapshot);
export const safeDecodeLedgerConfigDescriptor = safely(decodeLedgerConfigDescriptor);
export const safeDecodeLedgerConfigRootRecord = safely(decodeLedgerConfigRootRecord);
export const safeDecodeLedgerConfigTransactionReceipt = safely(
    decodeLedgerConfigTransactionReceipt
);
