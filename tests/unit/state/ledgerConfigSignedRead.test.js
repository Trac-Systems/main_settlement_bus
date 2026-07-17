import { test } from 'brittle';
import b4a from 'b4a';
import esmock from 'esmock';
import sinon from 'sinon';

import { encodeLedgerConfigRootRecord } from '../../../src/codecs/apply/ledgerConfigCodec.js';
import {
    calculateCommitId,
    calculateConfigId,
} from '../../../src/core/ledger-config/ledgerConfigMerkle.js';
import { EntryType } from '../../../src/utils/constants.js';
import { config } from '../../helpers/config.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';

async function recordFor({
    previousCommitId = b4a.alloc(32),
    configVersion = 1,
    configRoot = b4a.alloc(32, configVersion),
    descriptorOverrides = {},
} = {}) {
    const snapshot = {
        formatVersion: 1,
        commitmentScheme: 'binary-merkle-v1',
        schemaId: 'trac/autobase-proof-of-time/v1',
        entries: [],
    };
    const configId = await calculateConfigId(snapshot, configRoot);
    const commitId = await calculateCommitId(previousCommitId, configId);
    return {
        previousCommitId,
        descriptor: {
            formatVersion: snapshot.formatVersion,
            commitmentScheme: snapshot.commitmentScheme,
            schemaId: snapshot.schemaId,
            configVersion,
            configRoot,
            configId,
            commitId,
            contentRef: b4a.alloc(32, 3),
            ...descriptorOverrides,
        },
    };
}

async function createState(entries, signedLength = 17) {
    const checkoutSession = {
        get: sinon.stub().callsFake(async key => {
            const value = entries.get(key);
            return value === undefined ? null : {value};
        }),
        close: sinon.stub().resolves(),
    };
    const checkout = sinon.stub().returns(checkoutSession);
    const AutoBaseMock = sinon.stub().returns({
        view: {checkout, core: {signedLength}},
    });
    const State = await esmock('../../../src/core/state/State.js', {
        autobase: AutoBaseMock,
    });
    return {
        state: new State(null, null, config),
        checkout,
        checkoutSession,
    };
}

test('State#getSignedLedgerConfig reads pointer and root from one bounded checkout', async t => {
    const record = await recordFor();
    const commitId = record.descriptor.commitId;
    const rootKey = EntryType.LEDGER_CONFIG_ROOT + b4a.toString(commitId, 'hex');
    const entries = new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, commitId],
        [rootKey, encodeLedgerConfigRootRecord(record)],
    ]);
    const {state, checkout, checkoutSession} = await createState(entries);

    const result = await state.getSignedLedgerConfig();

    t.is(result.sourceSignedLength, 17);
    t.ok(b4a.equals(result.descriptor.commitId, commitId));
    t.is(result.descriptor.configVersion, 1);
    t.is(checkout.callCount, 1);
    t.is(checkout.firstCall.args[0], 17);
    t.alike(checkoutSession.get.args.map(args => args[0]), [
        EntryType.LEDGER_CONFIG_CURRENT,
        rootKey,
    ]);
    t.is(checkoutSession.close.callCount, 1);
});

test('State#getSignedLedgerConfig returns null without a signed pointer and closes checkout', async t => {
    const {state, checkoutSession} = await createState(new Map());
    t.is(await state.getSignedLedgerConfig(), null);
    t.is(checkoutSession.close.callCount, 1);
});

test('State#getSignedLedgerConfig fails closed for a missing or mismatched immutable record', async t => {
    const commitId = b4a.alloc(32, 0x55);
    const rootKey = EntryType.LEDGER_CONFIG_ROOT + b4a.toString(commitId, 'hex');
    const missing = await createState(new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, commitId],
    ]));
    await t.exception(
        () => missing.state.getSignedLedgerConfig(),
        errorMessageIncludes('root record is missing')
    );
    t.is(missing.checkoutSession.close.callCount, 1);

    const differentCommitId = b4a.alloc(32, 0x56);
    const validRecord = await recordFor();
    const mismatched = await createState(new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, commitId],
        [rootKey, encodeLedgerConfigRootRecord({
            ...validRecord,
            descriptor: {...validRecord.descriptor, commitId: differentCommitId},
        })],
    ]));
    await t.exception(
        () => mismatched.state.getSignedLedgerConfig(),
        errorMessageIncludes('pointer does not match')
    );
    t.is(mismatched.checkoutSession.close.callCount, 1);
});

test('State#getSignedLedgerConfigRoot resolves historical records without consulting current', async t => {
    const record = await recordFor();
    const historicalCommitId = record.descriptor.commitId;
    const rootKey = EntryType.LEDGER_CONFIG_ROOT + b4a.toString(historicalCommitId, 'hex');
    const {state, checkoutSession} = await createState(new Map([
        [rootKey, encodeLedgerConfigRootRecord(record)],
    ]));

    const result = await state.getSignedLedgerConfigRoot(b4a.toString(historicalCommitId, 'hex'));
    t.is(result.descriptor.configVersion, 1);
    t.alike(checkoutSession.get.args.map(args => args[0]), [rootKey]);
    t.is(checkoutSession.close.callCount, 1);
});

test('State#getSignedLedgerConfig rejects inconsistent ids and version chains', async t => {
    const valid = await recordFor();
    const corruptId = {
        ...valid,
        descriptor: {...valid.descriptor, configId: b4a.alloc(32, 0x99)},
    };
    const corruptIdKey = EntryType.LEDGER_CONFIG_ROOT +
        b4a.toString(valid.descriptor.commitId, 'hex');
    const corrupt = await createState(new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, valid.descriptor.commitId],
        [corruptIdKey, encodeLedgerConfigRootRecord(corruptId)],
    ]));
    await t.exception(
        () => corrupt.state.getSignedLedgerConfig(),
        errorMessageIncludes('configId is inconsistent')
    );

    const previous = await recordFor();
    const next = await recordFor({
        previousCommitId: previous.descriptor.commitId,
        configVersion: 3,
    });
    const nextKey = EntryType.LEDGER_CONFIG_ROOT + b4a.toString(next.descriptor.commitId, 'hex');
    const previousKey = EntryType.LEDGER_CONFIG_ROOT +
        b4a.toString(previous.descriptor.commitId, 'hex');
    const badChain = await createState(new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, next.descriptor.commitId],
        [nextKey, encodeLedgerConfigRootRecord(next)],
        [previousKey, encodeLedgerConfigRootRecord(previous)],
    ]));
    await t.exception(
        () => badChain.state.getSignedLedgerConfig(),
        errorMessageIncludes('version chain is inconsistent')
    );
});

test('State#requireLedgerConfigConsensusReady refuses an unsynchronized signed descriptor', async t => {
    const record = await recordFor();
    const rootKey = EntryType.LEDGER_CONFIG_ROOT +
        b4a.toString(record.descriptor.commitId, 'hex');
    const {state} = await createState(new Map([
        [EntryType.LEDGER_CONFIG_CURRENT, record.descriptor.commitId],
        [rootKey, encodeLedgerConfigRootRecord(record)],
    ]));

    await t.exception(
        () => state.requireLedgerConfigConsensusReady(),
        errorMessageIncludes('local config is not synchronized')
    );
});

test('State#requireLedgerConfigConsensusReady refuses a missing signed descriptor', async t => {
    const {state} = await createState(new Map());

    await t.exception(
        () => state.requireLedgerConfigConsensusReady(),
        errorMessageIncludes('signed ledger config is required')
    );
});
