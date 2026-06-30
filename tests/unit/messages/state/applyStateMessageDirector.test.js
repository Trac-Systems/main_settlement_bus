import { test } from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';

import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import { OperationType } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1 } from '../../../fixtures/apply.fixtures.js';
import {
    proofProposalApproval as approval,
    proofProposalData
} from '../../../helpers/proofProposal.js';

async function createWallet(mnemonic) {
    return await new WalletProvider(config).fromMnemonic({ mnemonic, derivationPath: config.derivationPath })
}

test('ApplyStateMessageDirector builds complete set epoch message', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const proofData = proofProposalData();
    const approvals = [
        approval(0x25, 0x26),
        approval(0x27, 0x28)
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

test('ApplyStateMessageDirector builds complete set genesis epoch message', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = b4a.from('11'.repeat(32), 'hex');
    const vdfDifficulty = b4a.from('22'.repeat(32), 'hex');
    const vdfDiscriminantSize = b4a.from('33'.repeat(32), 'hex');

    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            wallet.address,
            txValidity,
            vdfDifficulty,
            vdfDiscriminantSize
        );

    t.is(payload.type, OperationType.SET_GENESIS_EPOCH);
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(payload).sort(), ['address', 'sgo', 'type']);
    t.alike(Object.keys(payload.sgo).sort(), ['db', 'df', 'in', 'is', 'tx', 'txv']);
    t.ok(b4a.equals(payload.sgo.txv, txValidity));
    t.ok(b4a.equals(payload.sgo.df, vdfDifficulty));
    t.ok(b4a.equals(payload.sgo.db, vdfDiscriminantSize));
    t.is(payload.sgo.tx.length, 32);
    t.is(payload.sgo.in.length, 32);
    t.is(payload.sgo.is.length, 64);
});
