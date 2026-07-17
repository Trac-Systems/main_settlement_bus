import b4a from 'b4a';

import {
    MAX_LEDGER_CONFIG_ENTRIES,
    MAX_LEDGER_CONFIG_KEY_BYTES,
    MAX_LEDGER_CONFIG_OPERATION_BYTES,
    MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES,
    MAX_LEDGER_CONFIG_SNAPSHOT_BYTES,
    MAX_LEDGER_CONFIG_VALUE_BYTES,
} from '../../core/ledger-config/ledgerConfigConstants.js';

const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

const SET_LEDGER_CONFIG_OPERATION_TYPE = 16;
const LEDGER_CONFIG_OPERATION_FIELD = 12;
const LEDGER_CONFIG_SNAPSHOT_FIELD = 4;
const LEDGER_CONFIG_ENTRY_FIELD = 4;

// Two length-delimited fields plus their tags and worst-case uint32 lengths.
const MAX_LEDGER_CONFIG_ENTRY_WIRE_BYTES =
    MAX_LEDGER_CONFIG_KEY_BYTES + MAX_LEDGER_CONFIG_VALUE_BYTES + 12;

/**
 * Minimal protobuf wire reader used before invoking protobufjs. It retains
 * only the current offset/value, so repeated config entries are never
 * materialized while their structure and count are checked.
 */
class WireScanner {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
        this.value = 0;
        this.field = 0;
        this.wireType = 0;
        this.delimitedEnd = 0;
    }

    readVarint32(end) {
        let value = 0;
        let multiplier = 1;

        for (let index = 0; index < 5; index++) {
            if (this.offset >= end) return false;

            const byte = this.buffer[this.offset++];
            if (index === 4 && (byte & 0xf0) !== 0) return false;

            value += (byte & 0x7f) * multiplier;
            if ((byte & 0x80) === 0) {
                // Generated protobuf output uses the shortest varint form.
                // Rejecting overlong encodings keeps this privileged large
                // payload path canonical and fail-closed.
                if (index > 0 && byte === 0) return false;
                this.value = value;
                return true;
            }

            multiplier *= 128;
        }

        return false;
    }

    readTag(end) {
        if (!this.readVarint32(end) || this.value === 0) return false;

        this.field = Math.floor(this.value / 8);
        this.wireType = this.value % 8;
        return this.field > 0 && this.field <= 0x1fffffff;
    }

    readDelimitedEnd(end, maxLength = MAX_LEDGER_CONFIG_OPERATION_BYTES) {
        if (!this.readVarint32(end)) return false;
        if (this.value > maxLength || this.value > end - this.offset) return false;

        this.delimitedEnd = this.offset + this.value;
        return true;
    }
}

const wasSeen = (seenFields, field) => (seenFields & (1 << field)) !== 0;

const parseLedgerConfigEntry = (scanner, end) => {
    let seenFields = 0;

    while (scanner.offset < end) {
        if (!scanner.readTag(end)) return false;
        if (scanner.field !== 1 && scanner.field !== 2) return false;
        if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;
        if (wasSeen(seenFields, scanner.field)) return false;

        const maxLength = scanner.field === 1
            ? MAX_LEDGER_CONFIG_KEY_BYTES
            : MAX_LEDGER_CONFIG_VALUE_BYTES;
        seenFields |= 1 << scanner.field;

        if (!scanner.readDelimitedEnd(end, maxLength)) return false;
        scanner.offset = scanner.delimitedEnd;
    }

    return scanner.offset === end;
};

const parseLedgerConfigSnapshot = (scanner, end) => {
    let seenFields = 0;
    let entryCount = 0;

    while (scanner.offset < end) {
        if (!scanner.readTag(end)) return false;

        if (scanner.field === 1) {
            if (scanner.wireType !== WIRE_TYPE_VARINT) return false;
            if (wasSeen(seenFields, scanner.field)) return false;
            seenFields |= 1 << scanner.field;
            if (!scanner.readVarint32(end)) return false;
            continue;
        }

        if (scanner.field === 2 || scanner.field === 3) {
            if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;
            if (wasSeen(seenFields, scanner.field)) return false;
            seenFields |= 1 << scanner.field;
            if (!scanner.readDelimitedEnd(end, MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES)) return false;
            scanner.offset = scanner.delimitedEnd;
            continue;
        }

        if (scanner.field !== LEDGER_CONFIG_ENTRY_FIELD) return false;
        if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;

        entryCount++;
        if (entryCount > MAX_LEDGER_CONFIG_ENTRIES) return false;
        if (!scanner.readDelimitedEnd(end, MAX_LEDGER_CONFIG_ENTRY_WIRE_BYTES)) return false;

        const entryEnd = scanner.delimitedEnd;
        if (!parseLedgerConfigEntry(scanner, entryEnd)) return false;
    }

    return scanner.offset === end;
};

const parseSetLedgerConfigOperation = (scanner, end) => {
    let seenFields = 0;
    let snapshotCount = 0;

    while (scanner.offset < end) {
        if (!scanner.readTag(end)) return false;
        if (scanner.field < 1 || scanner.field > 7) return false;
        if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;
        if (wasSeen(seenFields, scanner.field)) return false;
        seenFields |= 1 << scanner.field;

        const maxLength = scanner.field === LEDGER_CONFIG_SNAPSHOT_FIELD
            ? MAX_LEDGER_CONFIG_SNAPSHOT_BYTES
            : MAX_LEDGER_CONFIG_OPERATION_BYTES;
        if (!scanner.readDelimitedEnd(end, maxLength)) return false;

        const fieldEnd = scanner.delimitedEnd;
        if (scanner.field === LEDGER_CONFIG_SNAPSHOT_FIELD) {
            snapshotCount++;
            if (!parseLedgerConfigSnapshot(scanner, fieldEnd)) return false;
        } else {
            scanner.offset = fieldEnd;
        }
    }

    return scanner.offset === end && snapshotCount === 1;
};

/**
 * Performs a bounded, allocation-safe structural check of a protobuf
 * Operation before a payload larger than the ordinary transaction limit is
 * handed to the generated decoder.
 *
 * The large-payload exception is intentionally narrow: type 16, exactly one
 * lco field, exactly one snapshot, known fields/wire types only, and no more
 * than 1024 structurally valid entries.
 *
 * @param {Buffer} payload Encoded apply Operation.
 * @returns {boolean} True only for a structurally valid ledger-config payload.
 */
export const preflightLedgerConfigOperation = payload => {
    if (!b4a.isBuffer(payload)) return false;
    if (payload.length === 0 || payload.length > MAX_LEDGER_CONFIG_OPERATION_BYTES) return false;

    const scanner = new WireScanner(payload);
    const end = payload.length;
    let seenFields = 0;
    let operationTypeCount = 0;
    let ledgerConfigOperationCount = 0;

    while (scanner.offset < end) {
        if (!scanner.readTag(end)) return false;

        if (scanner.field === 1) {
            if (scanner.wireType !== WIRE_TYPE_VARINT) return false;
            if (wasSeen(seenFields, scanner.field)) return false;
            seenFields |= 1 << scanner.field;
            operationTypeCount++;

            if (!scanner.readVarint32(end)) return false;
            if (scanner.value !== SET_LEDGER_CONFIG_OPERATION_TYPE) return false;
            continue;
        }

        if (scanner.field === 2) {
            if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;
            if (wasSeen(seenFields, scanner.field)) return false;
            seenFields |= 1 << scanner.field;
            if (!scanner.readDelimitedEnd(end)) return false;
            scanner.offset = scanner.delimitedEnd;
            continue;
        }

        if (scanner.field !== LEDGER_CONFIG_OPERATION_FIELD) return false;
        if (scanner.wireType !== WIRE_TYPE_LENGTH_DELIMITED) return false;
        if (wasSeen(seenFields, scanner.field)) return false;
        seenFields |= 1 << scanner.field;
        ledgerConfigOperationCount++;

        if (!scanner.readDelimitedEnd(end)) return false;
        const operationEnd = scanner.delimitedEnd;
        if (!parseSetLedgerConfigOperation(scanner, operationEnd)) return false;
    }

    return scanner.offset === end
        && operationTypeCount === 1
        && ledgerConfigOperationCount === 1;
};
