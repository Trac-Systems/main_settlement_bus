import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';

import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import {
    decodeEpochProofV1,
    encodeConsensusConfig
} from '../../../../src/codecs/apply/applyOperationCodec.js';
import { ConsensusVersion, OperationType } from '../../../../src/utils/constants.js';
import { createMessage } from '../../../../src/utils/buffer.js';
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
    t.alike(Object.keys(payload.seo).sort(), ['data', 'sv']);
    t.is(payload.seo.sv.length, 1);
    t.is(payload.seo.sv.readUInt8(0), ConsensusVersion.VDF_V1);

    const epochProof = decodeEpochProofV1(payload.seo.data);
    t.ok(b4a.equals(epochProof.pd, proofData));
    t.is(epochProof.app.length, approvals.length);
    t.ok(b4a.equals(epochProof.app[0], approvals[0]));
    t.ok(b4a.equals(epochProof.app[1], approvals[1]));
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
    t.ok(b4a.equals(complete.hco.va, addressToBuffer(validatorWallet.address, config.addressPrefix)));
    t.ok(b4a.isBuffer(complete.hco.vn));
    t.ok(b4a.isBuffer(complete.hco.vs));
});

test('applyStateMessageFactory builds partial and complete signed HTLC refunds', async t => {
    const requesterWallet = await createWallet(testKeyPair1.mnemonic);
    const validatorWallet = await createWallet(testKeyPair2.mnemonic);
    const { txv, li } = applyOperationFixtures.validPartialHtlcRefundOperation.hro;

    for (const output of ['buffer', 'json']) {
        const requester = applyStateMessageFactory(requesterWallet, config);
        const partial = output === 'buffer'
            ? await requester.buildPartialHtlcRefundOperationMessage(requesterWallet.address, txv, li)
            : await requester.buildPartialHtlcRefundOperationMessage(requesterWallet.address, txv, li, output);
        const complete = await applyStateMessageFactory(validatorWallet, config)
            .buildCompleteHtlcRefundOperationMessage(
                partial.address,
                partial.hro.tx,
                partial.hro.txv,
                partial.hro.li,
                partial.hro.in,
                partial.hro.is
            );

        t.is(partial.type, OperationType.HTLC_REFUND);
        t.is(complete.type, OperationType.HTLC_REFUND);
        t.ok(b4a.equals(complete.address, addressToBuffer(requesterWallet.address, config.addressPrefix)));
        t.alike(Object.keys(partial.hro).sort(), ['in', 'is', 'li', 'tx', 'txv']);
        t.alike(Object.keys(complete.hro).sort(), ['in', 'is', 'li', 'tx', 'txv', 'va', 'vn', 'vs']);
        for (const field of ['tx', 'txv', 'li', 'in', 'is']) {
            const value = output === 'json' ? b4a.from(partial.hro[field], 'hex') : partial.hro[field];
            t.ok(b4a.equals(complete.hro[field], value), `${output} hro.${field} is preserved`);
        }
        const submitterHash = await tracCryptoApi.hash.blake3(createMessage(
            config.networkId, txv, li, complete.hro.in, OperationType.HTLC_REFUND
        ));
        const validatorHash = await tracCryptoApi.hash.blake3(createMessage(
            config.networkId, complete.hro.tx, complete.hro.vn, OperationType.HTLC_REFUND
        ));
        t.ok(b4a.equals(complete.hro.tx, submitterHash));
        t.ok(requesterWallet.verify(complete.hro.is, submitterHash, requesterWallet.publicKey));
        t.ok(b4a.equals(complete.hro.va, addressToBuffer(validatorWallet.address, config.addressPrefix)));
        t.ok(validatorWallet.verify(complete.hro.vs, validatorHash, validatorWallet.publicKey));
    }
});

test('applyStateMessageFactory rejects malformed HTLC refund submission fields', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const { tx, txv, li, in: nonce, is: signature } = applyOperationFixtures.validPartialHtlcRefundOperation.hro;

    for (const invalidLockId of [undefined, null, b4a.alloc(31), '00'.repeat(33), 'zz'.repeat(32)]) {
        await t.exception(
            () => applyStateMessageFactory(wallet, config)
                .buildPartialHtlcRefundOperationMessage(wallet.address, txv, invalidLockId),
            /HTLC lock ID must be/
        );
        await t.exception(
            () => applyStateMessageFactory(wallet, config)
                .buildCompleteHtlcRefundOperationMessage(wallet.address, tx, txv, invalidLockId, nonce, signature),
            /HTLC lock ID must be/
        );
    }
    const args = [wallet.address, tx, txv, li, nonce, signature];
    for (const [index, label] of [[1, 'Transaction hash'], [2, 'Transaction validity'], [4, 'Incoming nonce'], [5, 'Incoming signature']]) {
        const invalidArgs = args.slice();
        invalidArgs[index] = b4a.alloc(1);
        await t.exception(
            () => applyStateMessageFactory(wallet, config).buildCompleteHtlcRefundOperationMessage(...invalidArgs),
            new RegExp(`${label} must be`)
        );
    }
});
