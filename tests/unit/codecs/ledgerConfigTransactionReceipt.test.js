import { test } from 'brittle';
import b4a from 'b4a';

import {
    decodeLedgerConfigTransactionReceipt,
    encodeLedgerConfigTransactionReceipt,
    ledgerConfigTransactionReceiptToDetails,
    safeDecodeLedgerConfigTransactionReceipt,
    validateLedgerConfigTransactionReceipt,
} from '../../../src/codecs/apply/ledgerConfigCodec.js';
import {
    buildLedgerConfigTree,
    calculateCommitId,
    calculateConfigId,
    calculateContentRef,
} from '../../../src/core/ledger-config/ledgerConfigMerkle.js';
import {
    createZeroCommitId,
    LEDGER_CONFIG_COMMITMENT_SCHEME,
    LEDGER_CONFIG_FORMAT_VERSION,
} from '../../../src/core/ledger-config/ledgerConfigConstants.js';
import { OperationType } from '../../../src/utils/constants.js';

async function buildReceipt(overrides = {}) {
    const snapshot = {
        formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
        commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
        schemaId: 'test/ledger-config-receipt/v1',
        entries: [
            { key: b4a.from('key'), value: b4a.alloc(1_024, 0x5a) },
        ],
    };
    const tree = await buildLedgerConfigTree(snapshot);
    const configId = await calculateConfigId(snapshot, tree.root);
    const previousCommitId = createZeroCommitId();
    const commitId = await calculateCommitId(previousCommitId, configId);
    const descriptor = {
        formatVersion: LEDGER_CONFIG_FORMAT_VERSION,
        commitmentScheme: LEDGER_CONFIG_COMMITMENT_SCHEME,
        schemaId: snapshot.schemaId,
        configVersion: 1,
        configRoot: tree.root,
        configId,
        commitId,
        contentRef: await calculateContentRef(snapshot),
    };

    return {
        operationType: OperationType.SET_LEDGER_CONFIG,
        txHash: b4a.alloc(32, 0x11),
        requesterAddress: b4a.alloc(32, 0x22),
        previousCommitId,
        descriptor,
        ...overrides,
    };
}

test('LedgerConfig transaction receipt round-trips without the snapshot witness', async t => {
    const receipt = await buildReceipt();
    const encoded = encodeLedgerConfigTransactionReceipt(receipt);
    const decoded = decodeLedgerConfigTransactionReceipt(encoded);
    const validated = await validateLedgerConfigTransactionReceipt(decoded, {
        expectedTxHash: receipt.txHash,
        expectedAddressLength: receipt.requesterAddress.length,
    });

    t.ok(encoded.length < 512, 'receipt size is independent of the 1 KiB snapshot value');
    t.is(validated.operationType, OperationType.SET_LEDGER_CONFIG);
    t.ok(b4a.equals(validated.txHash, receipt.txHash));
    t.ok(b4a.equals(validated.requesterAddress, receipt.requesterAddress));
    t.ok(b4a.equals(validated.previousCommitId, receipt.previousCommitId));
    t.ok(b4a.equals(validated.descriptor.commitId, receipt.descriptor.commitId));
    const details = ledgerConfigTransactionReceiptToDetails(validated);
    t.is(details.type, OperationType.SET_LEDGER_CONFIG);
    t.is(details.record_type, 'ledger_config_receipt_v1');
    t.ok(b4a.equals(details.receipt.tx, receipt.txHash));
    t.ok(b4a.equals(details.receipt.descriptor.commit_id, receipt.descriptor.commitId));
});

test('LedgerConfig transaction receipt rejects malformed framing and bodies', async t => {
    const receipt = await buildReceipt();
    const encoded = encodeLedgerConfigTransactionReceipt(receipt);
    const wrongMagic = b4a.from(encoded);
    wrongMagic[1] ^= 0xff;

    t.is(safeDecodeLedgerConfigTransactionReceipt(wrongMagic), null);
    t.is(safeDecodeLedgerConfigTransactionReceipt(encoded.subarray(0, 5)), null);
    t.is(
        safeDecodeLedgerConfigTransactionReceipt(b4a.concat([encoded, b4a.from([0])])),
        null,
        'non-canonical trailing data is rejected'
    );
});

test('LedgerConfig transaction receipt validates transaction and commitment identity', async t => {
    const receipt = await buildReceipt();
    const encoded = encodeLedgerConfigTransactionReceipt(receipt);
    const decoded = decodeLedgerConfigTransactionReceipt(encoded);

    await t.exception(() => validateLedgerConfigTransactionReceipt(decoded, {
        expectedTxHash: b4a.alloc(32, 0x99),
    }));

    const inconsistent = await buildReceipt({
        descriptor: {
            ...receipt.descriptor,
            commitId: b4a.alloc(32, 0x77),
        },
    });
    const inconsistentDecoded = decodeLedgerConfigTransactionReceipt(
        encodeLedgerConfigTransactionReceipt(inconsistent)
    );
    await t.exception(() => validateLedgerConfigTransactionReceipt(inconsistentDecoded));
});
