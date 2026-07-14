import { test } from 'brittle';
import b4a from 'b4a';
import esmock from 'esmock';
import sinon from 'sinon';

import { config } from '../../helpers/config.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';

async function createStateWithSignedValue(value) {
    const checkoutSession = {
        get: sinon.stub().resolves(value === undefined ? null : { value }),
        close: sinon.stub().resolves()
    };
    const checkout = sinon.stub().returns(checkoutSession);
    const AutoBaseMock = sinon.stub().returns({
        view: {
            checkout,
            core: { signedLength: 1 }
        }
    });
    const State = await esmock('../../../src/core/state/State.js', {
        autobase: AutoBaseMock
    });

    return new State(null, null, config);
}

test('State#getSignedVDFParams returns null when params are missing', async t => {
    const state = await createStateWithSignedValue(undefined);

    t.is(await state.getSignedVDFParams(), null);
});

test('State#requireSignedVDFParams rejects when params are missing', async t => {
    const state = await createStateWithSignedValue(undefined);

    await t.exception(
        () => state.requireSignedVDFParams(),
        errorMessageIncludes('VDF parameters are not initialized.')
    );
});

test('State#getSignedVDFParams decodes stored VDF params', async t => {
    const vdfParams = b4a.alloc(6);
    vdfParams.writeUInt32BE(55_000_000, 0);
    vdfParams.writeUInt16BE(2048, 4);
    const state = await createStateWithSignedValue(vdfParams);

    t.alike(await state.getSignedVDFParams(), {
        vdfDifficulty: 55_000_000,
        vdfDiscriminantSize: 2048,
    });
});

test('State#requireSignedVDFParams returns decoded stored VDF params', async t => {
    const vdfParams = b4a.alloc(6);
    vdfParams.writeUInt32BE(55_000_000, 0);
    vdfParams.writeUInt16BE(2048, 4);
    const state = await createStateWithSignedValue(vdfParams);

    t.alike(await state.requireSignedVDFParams(), {
        vdfDifficulty: 55_000_000,
        vdfDiscriminantSize: 2048,
    });
});

test('State#getSignedVDFParams rejects non-buffer values', async t => {
    const state = await createStateWithSignedValue('invalid');

    await t.exception(
        () => state.getSignedVDFParams(),
        errorMessageIncludes('Invalid VDF params value: expected a buffer.')
    );
});

test('State#getSignedVDFParams rejects values with invalid length', async t => {
    const state = await createStateWithSignedValue(b4a.alloc(5));

    await t.exception(
        () => state.getSignedVDFParams(),
        errorMessageIncludes('Invalid VDF params length: expected 6, got 5.')
    );
});
