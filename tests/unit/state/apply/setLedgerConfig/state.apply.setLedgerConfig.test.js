import { test } from 'brittle';
import b4a from 'b4a';

import {
    safeDecodeLedgerConfigTransactionReceipt,
    validateLedgerConfigTransactionReceipt,
} from '../../../../../src/codecs/apply/ledgerConfigCodec.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { buildLedgerConfigTree } from '../../../../../src/core/ledger-config/ledgerConfigMerkle.js';
import { createZeroCommitId } from '../../../../../src/core/ledger-config/ledgerConfigConstants.js';
import { EntryType } from '../../../../../src/utils/constants.js';
import {
    appendAndUpdate,
    assertNotRecorded,
    buildSetLedgerConfigPayload,
    proofOfTimeSnapshot,
    readCurrentRecord,
    setupSetLedgerConfigScenario,
} from './setLedgerConfigScenarioHelpers.js';

test('State.apply SET_LEDGER_CONFIG stores only Model B root history and converges replicas', async t => {
    const context = await setupSetLedgerConfigScenario(t);
    const admin = context.adminBootstrap;
    const reader = context.peers[1];
    const snapshot = proofOfTimeSnapshot();
    const payload = await buildSetLedgerConfigPayload(context, snapshot);

    await appendAndUpdate(admin.base, payload);
    const applied = await readCurrentRecord(admin.base);
    const expectedTree = await buildLedgerConfigTree(snapshot);

    t.ok(applied);
    t.ok(applied.record);
    t.ok(b4a.equals(applied.current, applied.record.descriptor.commitId));
    t.ok(b4a.equals(applied.record.descriptor.configRoot, expectedTree.root));
    t.ok(b4a.equals(applied.record.previousCommitId, createZeroCommitId()));
    t.is(applied.record.descriptor.configVersion, 1);

    const operation = safeDecodeApplyOperation(payload);
    const txHashHex = b4a.toString(operation.lco.tx, 'hex');
    const transactionEntry = await admin.base.view.get(txHashHex);
    t.ok(transactionEntry, 'compact receipt is stored in the standard transaction index');
    t.ok(transactionEntry.value.length < payload.length, 'receipt omits the complete snapshot witness');
    const receipt = safeDecodeLedgerConfigTransactionReceipt(transactionEntry.value);
    t.ok(receipt, 'standard transaction value decodes as a ledger config receipt');
    await validateLedgerConfigTransactionReceipt(receipt, {
        expectedTxHash: operation.lco.tx,
        expectedAddressLength: operation.address.length,
    });
    t.ok(b4a.equals(receipt.descriptor.commitId, applied.current));
    t.ok(b4a.equals(receipt.descriptor.configRoot, expectedTree.root));

    const ledgerConfigKeys = [];
    for await (const entry of admin.base.view.createReadStream({
        gte: '/ledger-config/',
        lt: '/ledger-config0',
    })) {
        ledgerConfigKeys.push(entry.key);
    }
    t.alike(
        ledgerConfigKeys.sort(),
        [
            EntryType.LEDGER_CONFIG_CURRENT,
            applied.rootKey,
        ].sort(),
        'ledger config namespace has only the pointer and immutable root record'
    );

    await context.sync();
    const replicated = await readCurrentRecord(reader.base);
    t.ok(replicated);
    t.ok(b4a.equals(replicated.current, applied.current));
    t.ok(b4a.equals(replicated.record.descriptor.configRoot, expectedTree.root));
    const replicatedTransaction = await reader.base.view.get(txHashHex);
    t.ok(replicatedTransaction, 'standard transaction receipt converges on the replica');
    t.ok(b4a.equals(replicatedTransaction.value, transactionEntry.value));

    let transactionHistoryEntry = null;
    for await (const entry of admin.base.view.createHistoryStream()) {
        if (entry.type === 'put' && entry.key === txHashHex) {
            transactionHistoryEntry = entry;
            break;
        }
    }
    t.ok(transactionHistoryEntry, 'the receipt participates in the standard 64-hex transaction history');
});

test('State.apply SET_LEDGER_CONFIG keeps immutable history and rejects a stale fork', async t => {
    const context = await setupSetLedgerConfigScenario(t);
    const admin = context.adminBootstrap;

    const firstPayload = await buildSetLedgerConfigPayload(context, proofOfTimeSnapshot(10));
    await appendAndUpdate(admin.base, firstPayload);
    const first = await readCurrentRecord(admin.base);

    const secondPayload = await buildSetLedgerConfigPayload(
        context,
        proofOfTimeSnapshot(20),
        first.current
    );
    await appendAndUpdate(admin.base, secondPayload);
    const second = await readCurrentRecord(admin.base);

    t.not(b4a.toString(second.current, 'hex'), b4a.toString(first.current, 'hex'));
    t.ok(b4a.equals(second.record.previousCommitId, first.current));
    t.is(second.record.descriptor.configVersion, 2);
    t.ok(await admin.base.view.get(first.rootKey), 'first immutable root remains present');

    const stalePayload = await buildSetLedgerConfigPayload(
        context,
        proofOfTimeSnapshot(30),
        first.current
    );
    await appendAndUpdate(admin.base, stalePayload);
    const afterStale = await readCurrentRecord(admin.base);
    t.ok(b4a.equals(afterStale.current, second.current));
    await assertNotRecorded(t, admin.base, stalePayload);
});

test('State.apply SET_LEDGER_CONFIG rejects tampering and non-canonical transport', async t => {
    const context = await setupSetLedgerConfigScenario(t);
    const admin = context.adminBootstrap;
    const validPayload = await buildSetLedgerConfigPayload(context);

    const tampered = safeDecodeApplyOperation(validPayload);
    tampered.lco.snapshot.entries[0].value = b4a.alloc(4, 0x7f);
    const tamperedPayload = safeEncodeApplyOperation(tampered);
    await appendAndUpdate(admin.base, tamperedPayload);
    t.is(await readCurrentRecord(admin.base), null);
    await assertNotRecorded(t, admin.base, tamperedPayload);

    const reordered = safeDecodeApplyOperation(validPayload);
    reordered.lco.snapshot.entries.reverse();
    const reorderedPayload = safeEncodeApplyOperation(reordered);
    await appendAndUpdate(admin.base, reorderedPayload);
    t.is(await readCurrentRecord(admin.base), null);
    await assertNotRecorded(t, admin.base, reorderedPayload);

});

test('State.apply remains schema-neutral while replicas converge on an unknown descriptor', async t => {
    const context = await setupSetLedgerConfigScenario(t);
    const admin = context.adminBootstrap;
    const reader = context.peers[1];
    const snapshot = {
        ...proofOfTimeSnapshot(),
        schemaId: 'trac/unknown-consensus/v1',
    };
    const payload = await buildSetLedgerConfigPayload(
        context,
        snapshot,
        createZeroCommitId()
    );

    await appendAndUpdate(admin.base, payload);
    const applied = await readCurrentRecord(admin.base);
    t.is(applied.record.descriptor.schemaId, snapshot.schemaId);

    await context.sync();
    const replicated = await readCurrentRecord(reader.base);
    t.ok(b4a.equals(replicated.current, applied.current));
    t.is(replicated.record.descriptor.schemaId, snapshot.schemaId);
});

test('State.apply SET_LEDGER_CONFIG rejects a non-admin author', async t => {
    const context = await setupSetLedgerConfigScenario(t);
    const admin = context.adminBootstrap;
    const nonAdmin = context.peers[1].wallet;
    const payload = await buildSetLedgerConfigPayload(
        context,
        proofOfTimeSnapshot(),
        createZeroCommitId(),
        nonAdmin
    );

    await appendAndUpdate(admin.base, payload);
    t.is(await readCurrentRecord(admin.base), null);
    await assertNotRecorded(t, admin.base, payload);
});
