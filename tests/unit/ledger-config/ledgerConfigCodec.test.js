import { test } from 'brittle';
import b4a from 'b4a';

import {
    decodeLedgerConfigRootRecord,
    decodeLedgerConfigSnapshot,
    encodeLedgerConfigRootRecord,
    encodeLedgerConfigSnapshot,
    safeDecodeLedgerConfigRootRecord,
} from '../../../src/codecs/apply/ledgerConfigCodec.js';

test('LedgerConfig snapshot codec preserves opaque bytes exactly', t => {
    const snapshot = {
        formatVersion: 1,
        commitmentScheme: 'binary-merkle-v1',
        schemaId: 'test/binary/v1',
        entries: [
            {key: b4a.from([0x00, 0xff]), value: b4a.from([0x00, 0x00, 0xfe])},
            {key: b4a.from([0x01]), value: b4a.alloc(0)},
        ],
    };

    const decoded = decodeLedgerConfigSnapshot(encodeLedgerConfigSnapshot(snapshot));
    t.is(decoded.formatVersion, snapshot.formatVersion);
    t.is(decoded.commitmentScheme, snapshot.commitmentScheme);
    t.is(decoded.schemaId, snapshot.schemaId);
    t.is(decoded.entries.length, 2);
    t.ok(b4a.equals(decoded.entries[0].key, snapshot.entries[0].key));
    t.ok(b4a.equals(decoded.entries[0].value, snapshot.entries[0].value));
    t.ok(b4a.equals(decoded.entries[1].value, snapshot.entries[1].value));
});

test('LedgerConfig root record codec roundtrips the signed Model B descriptor', t => {
    const record = {
        previousCommitId: b4a.alloc(32),
        descriptor: {
            formatVersion: 1,
            commitmentScheme: 'binary-merkle-v1',
            schemaId: 'test/schema/v1',
            configVersion: 9,
            configRoot: b4a.alloc(32, 1),
            configId: b4a.alloc(32, 2),
            commitId: b4a.alloc(32, 3),
            contentRef: b4a.alloc(32, 4),
        },
    };

    const decoded = decodeLedgerConfigRootRecord(encodeLedgerConfigRootRecord(record));
    t.ok(b4a.equals(decoded.previousCommitId, record.previousCommitId));
    t.alike(
        {
            formatVersion: decoded.descriptor.formatVersion,
            commitmentScheme: decoded.descriptor.commitmentScheme,
            schemaId: decoded.descriptor.schemaId,
            configVersion: decoded.descriptor.configVersion,
        },
        {
            formatVersion: 1,
            commitmentScheme: 'binary-merkle-v1',
            schemaId: 'test/schema/v1',
            configVersion: 9,
        }
    );
    t.ok(b4a.equals(decoded.descriptor.configRoot, record.descriptor.configRoot));
    t.ok(b4a.equals(decoded.descriptor.configId, record.descriptor.configId));
    t.ok(b4a.equals(decoded.descriptor.commitId, record.descriptor.commitId));
    t.ok(b4a.equals(decoded.descriptor.contentRef, record.descriptor.contentRef));
    t.is(safeDecodeLedgerConfigRootRecord(b4a.from([0xff])), null);
});

