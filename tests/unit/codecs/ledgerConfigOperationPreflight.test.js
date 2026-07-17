import test from 'brittle';
import b4a from 'b4a';

import applyOperationsGenerated from '../../../src/codecs/apply/applyOperations.generated.cjs';
import { preflightLedgerConfigOperation } from '../../../src/codecs/apply/ledgerConfigOperationPreflight.js';
import {
    MAX_LEDGER_CONFIG_ENTRIES,
    MAX_LEDGER_CONFIG_OPERATION_BYTES,
} from '../../../src/core/ledger-config/ledgerConfigConstants.js';

const { Operation } = applyOperationsGenerated.apply.operations;

const encodeOperation = ({ entryCount, txBytes = 0 }) => b4a.from(Operation.encode({
    type: 16,
    address: b4a.alloc(32, 0x11),
    lco: {
        tx: b4a.alloc(txBytes, 0x22),
        snapshot: {
            format_version: 1,
            commitment_scheme: 'binary-merkle-v1',
            schema_id: 'test/schema/v1',
            entries: Array.from({ length: entryCount }, () => ({})),
        },
    },
}).finish());

test('ledger config preflight accepts the 1024-entry boundary without materializing entries', t => {
    const payload = encodeOperation({
        entryCount: MAX_LEDGER_CONFIG_ENTRIES,
        txBytes: 4_096,
    });

    t.ok(payload.length > 4_096, 'payload exercises the large-operation path');
    t.ok(preflightLedgerConfigOperation(payload));
});

test('ledger config preflight rejects a megabyte payload with more than 1024 empty entries', t => {
    const payload = encodeOperation({
        entryCount: MAX_LEDGER_CONFIG_ENTRIES + 1,
        txBytes: 1_024 * 1_024,
    });

    t.ok(payload.length > 1_024 * 1_024, 'malicious payload is approximately one megabyte');
    t.is(preflightLedgerConfigOperation(payload), false);
});

test('ledger config preflight fails closed on malformed lengths, overflow, and wrong wire types', t => {
    const validPayload = encodeOperation({ entryCount: 1, txBytes: 4_096 });

    t.is(preflightLedgerConfigOperation(validPayload.subarray(0, -1)), false, 'truncated payload');
    t.is(
        preflightLedgerConfigOperation(b4a.from([0x08, 0x10, 0x62, 0xff, 0xff, 0xff, 0xff, 0x10])),
        false,
        'overflowing uint32 length'
    );
    t.is(
        preflightLedgerConfigOperation(b4a.from([0x0a, 0x01, 0x10, 0x62, 0x02, 0x22, 0x00])),
        false,
        'operation type with length-delimited wire type'
    );
    t.is(
        preflightLedgerConfigOperation(b4a.alloc(MAX_LEDGER_CONFIG_OPERATION_BYTES + 1)),
        false,
        'absolute operation bound'
    );
});

test('ledger config preflight requires exactly one lco and one snapshot field', t => {
    t.is(preflightLedgerConfigOperation(b4a.from([0x08, 0x10])), false, 'missing lco');
    t.is(
        preflightLedgerConfigOperation(b4a.from([0x08, 0x10, 0x62, 0x00])),
        false,
        'missing snapshot'
    );
    t.is(
        preflightLedgerConfigOperation(b4a.from([
            0x08, 0x10,
            0x62, 0x04, 0x22, 0x00, 0x22, 0x00,
        ])),
        false,
        'duplicate snapshot'
    );
    t.is(
        preflightLedgerConfigOperation(b4a.from([
            0x08, 0x10,
            0x62, 0x02, 0x22, 0x00,
            0x62, 0x02, 0x22, 0x00,
        ])),
        false,
        'duplicate lco'
    );
});
