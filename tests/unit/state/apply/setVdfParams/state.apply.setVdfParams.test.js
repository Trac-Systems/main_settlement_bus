import { test } from 'brittle';
import {
    INITIAL_VDF_DIFFICULTY,
    INITIAL_VDF_DISCRIMINANT_SIZE,
    UPDATED_VDF_DIFFICULTY,
    appendAndUpdate,
    assertOperationRecorded,
    assertVdfParams,
    assertVdfParamsMissing,
    buildSetVdfParamsPayload,
    mutateVdfDifficulty,
    setupSetVdfParamsScenario
} from './setVdfParamsScenarioHelpers.js';

test('State.apply SET_VDF_PARAMS updates difficulty and preserves discriminant size', async t => {
    const context = await setupSetVdfParamsScenario(t);
    const adminNode = context.adminBootstrap;
    const readerNode = context.peers[1];
    const payload = await buildSetVdfParamsPayload(context);

    await appendAndUpdate(adminNode.base, payload);

    await assertVdfParams(
        t,
        adminNode.base,
        UPDATED_VDF_DIFFICULTY,
        INITIAL_VDF_DISCRIMINANT_SIZE
    );
    await assertOperationRecorded(t, adminNode.base, payload, true);

    await context.sync();
    await assertVdfParams(
        t,
        readerNode.base,
        UPDATED_VDF_DIFFICULTY,
        INITIAL_VDF_DISCRIMINANT_SIZE
    );
    await assertOperationRecorded(t, readerNode.base, payload, true);
});

test('State.apply SET_VDF_PARAMS rejects updates before genesis initialization', async t => {
    const context = await setupSetVdfParamsScenario(t, { initializeGenesis: false });
    const adminNode = context.adminBootstrap;
    const payload = await buildSetVdfParamsPayload(context);

    await appendAndUpdate(adminNode.base, payload);

    await assertVdfParamsMissing(t, adminNode.base);
    await assertOperationRecorded(t, adminNode.base, payload, false);
});

test('State.apply SET_VDF_PARAMS rejects a non-admin requester', async t => {
    const context = await setupSetVdfParamsScenario(t);
    const adminNode = context.adminBootstrap;
    const nonAdminWallet = context.peers[1].wallet;
    const payload = await buildSetVdfParamsPayload(
        context,
        UPDATED_VDF_DIFFICULTY,
        nonAdminWallet
    );

    await appendAndUpdate(adminNode.base, payload);

    await assertVdfParams(
        t,
        adminNode.base,
        INITIAL_VDF_DIFFICULTY,
        INITIAL_VDF_DISCRIMINANT_SIZE
    );
    await assertOperationRecorded(t, adminNode.base, payload, false);
});

test('State.apply SET_VDF_PARAMS rejects zero difficulty', async t => {
    const context = await setupSetVdfParamsScenario(t);
    const adminNode = context.adminBootstrap;
    const payload = await buildSetVdfParamsPayload(context, 0);

    await appendAndUpdate(adminNode.base, payload);

    await assertVdfParams(
        t,
        adminNode.base,
        INITIAL_VDF_DIFFICULTY,
        INITIAL_VDF_DISCRIMINANT_SIZE
    );
    await assertOperationRecorded(t, adminNode.base, payload, false);
});

test('State.apply SET_VDF_PARAMS rejects difficulty not covered by the signed hash', async t => {
    const context = await setupSetVdfParamsScenario(t);
    const adminNode = context.adminBootstrap;
    const validPayload = await buildSetVdfParamsPayload(context);
    const mutatedPayload = mutateVdfDifficulty(validPayload, UPDATED_VDF_DIFFICULTY + 1);

    await appendAndUpdate(adminNode.base, mutatedPayload);

    await assertVdfParams(
        t,
        adminNode.base,
        INITIAL_VDF_DIFFICULTY,
        INITIAL_VDF_DISCRIMINANT_SIZE
    );
    await assertOperationRecorded(t, adminNode.base, validPayload, false);
});
