import { test } from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';

import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import { encodeConsensusConfig } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { OperationType } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';
import applyOperationFixtures from '../../../fixtures/applyOperation.fixtures.js';
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
    const consensusConfig = {
        sv: b4a.from([0x01]),
        cd: b4a.from('22'.repeat(6), 'hex')
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            wallet.address,
            txValidity,
            encodedConsensusConfig
        );

    t.is(payload.type, OperationType.SET_GENESIS_EPOCH);
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(payload).sort(), ['address', 'cco', 'type']);
    t.alike(Object.keys(payload.cco).sort(), ['cc', 'in', 'is', 'tx', 'txv']);
    t.alike(Object.keys(payload.cco.cc).sort(), ['cd', 'sv']);
    t.ok(b4a.equals(payload.cco.txv, txValidity));
    t.ok(b4a.equals(payload.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(payload.cco.cc.cd, consensusConfig.cd));
    t.is(payload.cco.tx.length, 32);
    t.is(payload.cco.in.length, 32);
    t.is(payload.cco.is.length, 64);
});

test('ApplyStateMessageDirector builds complete set consensus config message', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = b4a.from('44'.repeat(32), 'hex');
    const consensusConfig = {
        sv: b4a.from([0x01]),
        cd: b4a.from([0x55, 0x66, 0x77])
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetConsensusConfigMessage(
            wallet.address,
            txValidity,
            encodedConsensusConfig
        );

    t.is(payload.type, OperationType.SET_CONSENSUS_CONFIG);
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(payload).sort(), ['address', 'cco', 'type']);
    t.alike(Object.keys(payload.cco).sort(), ['cc', 'in', 'is', 'tx', 'txv']);
    t.alike(Object.keys(payload.cco.cc).sort(), ['cd', 'sv']);
    t.ok(b4a.equals(payload.cco.txv, txValidity));
    t.ok(b4a.equals(payload.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(payload.cco.cc.cd, consensusConfig.cd));
    t.is(payload.cco.tx.length, 32);
    t.is(payload.cco.in.length, 32);
    t.is(payload.cco.is.length, 64);
});

test('ApplyStateMessageDirector builds and preserves a signed HTLC claim', async t => {
    const requesterWallet = await createWallet(testKeyPair1.mnemonic);
    const validatorWallet = await createWallet(testKeyPair2.mnemonic);
    const { txv, li: lockId, pi: preimage } = applyOperationFixtures.validHtlcClaimOperation.hco;

    const partial = await applyStateMessageFactory(requesterWallet, config)
        .buildPartialHtlcClaimOperationMessage(
            requesterWallet.address,
            txv,
            lockId,
            preimage
        );
    const complete = await applyStateMessageFactory(validatorWallet, config)
        .buildCompleteHtlcClaimOperationMessage(
            requesterWallet.address,
            partial.hco.tx,
            partial.hco.txv,
            partial.hco.li,
            partial.hco.pi,
            partial.hco.in,
            partial.hco.is
        );

    t.is(partial.type, OperationType.HTLC_CLAIM);
    t.ok(b4a.equals(partial.address, addressToBuffer(requesterWallet.address, config.addressPrefix)));
    t.alike(Object.keys(partial.hco).sort(), ['in', 'is', 'li', 'pi', 'tx', 'txv']);
    for (const field of ['tx', 'txv', 'li', 'pi', 'in', 'is']) {
        t.ok(b4a.equals(complete.hco[field], partial.hco[field]), `hco.${field} is preserved`);
    }
});
