import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';

import PeerWallet from 'trac-wallet';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

import IdentityProvider from '../../../src/core/network/identity/IdentityProvider.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';

test('IdentityProvider.fromWallet proxies wallet behavior', async t => {
    const publicKey = b4a.from(testKeyPair2.publicKey, 'hex');
    const address = PeerWallet.encodeBech32m(TRAC_NETWORK_MSB_MAINNET_PREFIX, publicKey);
    const signResult = b4a.from('abcd', 'hex');
    const wallet = {
        publicKey,
        address,
        sign: sinon.stub().returns(signResult),
        verify: sinon.stub().returns(true)
    };

    const provider = IdentityProvider.fromWallet(wallet);
    const message = b4a.from('00112233', 'hex');
    const signature = provider.sign(message);

    t.alike(provider.publicKey, publicKey);
    t.is(provider.address, address);
    t.alike(signature, signResult);
    t.ok(wallet.sign.calledOnceWithExactly(message));

    const verifyResult = provider.verify(signature, message);
    t.ok(verifyResult);
    t.ok(wallet.verify.calledOnceWithExactly(signature, message, undefined));

    sinon.restore();
});

test('IdentityProvider.fromNetworkKeyPair requires both public and secret keys', async t => {
    const publicKey = b4a.from(testKeyPair1.publicKey, 'hex');
    await t.exception(() => IdentityProvider.fromNetworkKeyPair({ publicKey }), errorMessageIncludes('keyPair with publicKey and secretKey is required'));
});

test('IdentityProvider.fromNetworkKeyPair rejects non-buffer inputs', async t => {
    const secretKey = b4a.from(testKeyPair1.secretKey, 'hex');
    await t.exception(() => IdentityProvider.fromNetworkKeyPair({ publicKey: 'not-a-buffer', secretKey }), errorMessageIncludes('value must be a Buffer')
    );
});

test('IdentityProvider.fromNetworkKeyPair derives address and signs payloads', async t => {
    const keyPair = {
        publicKey: b4a.from(testKeyPair1.publicKey, 'hex'),
        secretKey: b4a.from(testKeyPair1.secretKey, 'hex')
    };
    const provider = IdentityProvider.fromNetworkKeyPair(keyPair, TRAC_NETWORK_MSB_MAINNET_PREFIX);
    const message = b4a.from('123455555', 'hex');
    const signature = provider.sign(message);

    t.is(
        provider.address,
        PeerWallet.encodeBech32m(TRAC_NETWORK_MSB_MAINNET_PREFIX, provider.publicKey)
    );
    t.ok(PeerWallet.verify(signature, message, provider.publicKey));
    t.ok(provider.verify(signature, message));
});

test('IdentityProvider surfaces address derivation failures', async t => {
    const keyPair = {
        publicKey: b4a.from(testKeyPair1.publicKey, 'hex'),
        secretKey: b4a.from(testKeyPair1.secretKey, 'hex')
    };

    const stub = sinon.stub(PeerWallet, 'encodeBech32mSafe').returns(null);
    await t.exception(() => IdentityProvider.fromNetworkKeyPair(keyPair, TRAC_NETWORK_MSB_MAINNET_PREFIX), errorMessageIncludes('failed to derive address'));
    stub.restore();
    sinon.restore();
});
