import { test } from 'brittle';
import b4a from 'b4a';

import {
    buildSetLedgerConfigPayload,
    readCurrentRecord,
} from '../setLedgerConfig/setLedgerConfigScenarioHelpers.js';
import {
    appendAndUpdate,
    assertGenesisEpochApplied,
    assertGenesisEpochMissing,
    buildSetGenesisEpochPayload,
    setupSetGenesisEpochScenario,
} from './setGenesisEpochScenarioHelpers.js';

test('State.apply SET_GENESIS_EPOCH rejects genesis without a ledger config', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const admin = context.adminBootstrap;
    const payload = await buildSetGenesisEpochPayload(context, b4a.alloc(32, 0xa5));

    await appendAndUpdate(admin.base, payload);

    await assertGenesisEpochMissing(t, admin.base, payload);
});

test('State.apply SET_GENESIS_EPOCH anchors genesis to the current config id', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const admin = context.adminBootstrap;
    await appendAndUpdate(admin.base, await buildSetLedgerConfigPayload(context));
    const current = await readCurrentRecord(admin.base);
    const configId = current.record.descriptor.configId;
    const payload = await buildSetGenesisEpochPayload(context, configId);

    await appendAndUpdate(admin.base, payload);

    await assertGenesisEpochApplied(t, admin.base, payload, configId);
});

test('State.apply SET_GENESIS_EPOCH rejects a config id mismatch', async t => {
    const context = await setupSetGenesisEpochScenario(t);
    const admin = context.adminBootstrap;
    await appendAndUpdate(admin.base, await buildSetLedgerConfigPayload(context));
    const current = await readCurrentRecord(admin.base);
    const mismatchedConfigId = b4a.from(current.record.descriptor.configId);
    mismatchedConfigId[0] ^= 0xff;
    const payload = await buildSetGenesisEpochPayload(context, mismatchedConfigId);

    await appendAndUpdate(admin.base, payload);

    await assertGenesisEpochMissing(t, admin.base, payload);
});
