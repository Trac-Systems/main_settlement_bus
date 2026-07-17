import { test } from 'brittle';
import b4a from 'b4a';

import {
    buildSetLedgerConfigPayload,
    readCurrentRecord,
} from '../setLedgerConfig/setLedgerConfigScenarioHelpers.js';
import {
    appendAndCountEpochEvents,
    appendAndUpdate,
    buildSetEpochPayload,
    setupSetEpochScenario,
} from './setEpochScenarioHelpers.js';

test('State.apply SET_EPOCH rejects an epoch without a ledger config', async t => {
    const context = await setupSetEpochScenario(t);
    const payload = await buildSetEpochPayload(context, b4a.alloc(32, 0xa5));

    t.is(await appendAndCountEpochEvents(context, payload), 0);
});

test('State.apply SET_EPOCH accepts the current ledger config id', async t => {
    const context = await setupSetEpochScenario(t);
    await appendAndUpdate(
        context.adminBootstrap.base,
        await buildSetLedgerConfigPayload(context)
    );
    const current = await readCurrentRecord(context.adminBootstrap.base);
    const payload = await buildSetEpochPayload(context, current.record.descriptor.configId);

    t.is(await appendAndCountEpochEvents(context, payload), 1);
});

test('State.apply SET_EPOCH rejects a mismatched ledger config id', async t => {
    const context = await setupSetEpochScenario(t);
    await appendAndUpdate(
        context.adminBootstrap.base,
        await buildSetLedgerConfigPayload(context)
    );
    const current = await readCurrentRecord(context.adminBootstrap.base);
    const mismatchedConfigId = b4a.from(current.record.descriptor.configId);
    mismatchedConfigId[0] ^= 0xff;
    const payload = await buildSetEpochPayload(context, mismatchedConfigId);

    t.is(await appendAndCountEpochEvents(context, payload), 0);
});
