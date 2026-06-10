import { test } from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';

import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import { OperationType } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1 } from '../../../fixtures/apply.fixtures.js';

async function createWallet(mnemonic) {
    return await new WalletProvider(config).fromMnemonic({ mnemonic, derivationPath: config.derivationPath })
}

test('ApplyStateMessageDirector builds complete set epoch message', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const proofData = b4a.alloc(96, 0x24);
    const approvals = [
        b4a.alloc(64, 0x25),
        b4a.alloc(64, 0x26)
    ];

    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetEpochMessage(wallet.address, proofData, approvals);

    t.is(payload.type, OperationType.SET_EPOCH);
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(payload).sort(), ['address', 'seo', 'type']);
    t.alike(Object.keys(payload.seo).sort(), ['app', 'pd']);
    t.ok(b4a.equals(payload.seo.pd, proofData));
    t.is(payload.seo.app.length, approvals.length);
    t.ok(b4a.equals(payload.seo.app[0], approvals[0]));
    t.ok(b4a.equals(payload.seo.app[1], approvals[1]));
});
