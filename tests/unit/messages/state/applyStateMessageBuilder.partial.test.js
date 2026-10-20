import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import ApplyStateMessageBuilder from '../../../../src/messages/state/ApplyStateMessageBuilder.js';
import { OperationType } from '../../../../src/utils/constants.js';
import { isHexString } from '../../../../src/utils/helpers.js';
import { createMessage } from '../../../../src/utils/buffer.js';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';
import applyOperationFixtures from '../../../fixtures/applyOperation.fixtures.js';
import { addressToBuffer, isAddressValid } from '../../../../src/core/state/utils/address.js';

const hex = (value, bytes) => value.repeat(bytes);
const invalidChecksumAddress = 'trac1wyu9uw02wmefzt63c36wa0fgc2xn99x5hw46w4frl7jd6mqw2f5q57tt90';

async function createWallet(mnemonic) {
    return await new WalletProvider(config).fromMnemonic({ mnemonic, derivationPath: config.derivationPath })
}

function expectHexField(t, value, bytes, label) {
    t.is(typeof value, 'string', `${label} type`);
    t.is(value.length, bytes * 2, `${label} length`);
    t.ok(isHexString(value), `${label} hex`);
}

function expectBufferField(t, value, bytes, label) {
    t.ok(b4a.isBuffer(value), `${label} type`);
    t.is(value.length, bytes, `${label} length`);
}

function expectAddressField(t, value, label) {
    t.is(typeof value, 'string', `${label} type`);
    t.is(value.length, config.addressLength, `${label} length`);
    t.ok(isAddressValid(value, config.addressPrefix), `${label} valid`);
}

function expectKeys(t, value, keys, label) {
    t.alike(Object.keys(value).sort(), keys.slice().sort(), `${label} keys`);
}

function expectPayloadKeys(t, payload, bodyKey) {
    expectKeys(t, payload, ['type', 'address', bodyKey], 'payload');
}

test('ApplyStateMessageBuilder rejects checksum-invalid addresses across operation fields', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const builder = new ApplyStateMessageBuilder(wallet, config);

    for (const setter of [
        'setAddress',
        'setIncomingAddress',
        'setHtlcClaimAddress',
        'setHtlcRefundAddress',
        'setHtlcFeeRecipient'
    ]) {
        t.exception(() => builder[setter](invalidChecksumAddress), `${setter} rejects invalid checksum`);
    }
    t.exception(
        () => new ApplyStateMessageBuilder({ address: invalidChecksumAddress }, config),
        'invalid wallet address is rejected'
    );
});

test('ApplyStateMessageBuilder partial add writer (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = hex('11', 32);
    const writingKey = hex('22', 32);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.ADD_WRITER)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setWriterKey(writingKey)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADD_WRITER);
    t.is(payload.address, wallet.address);
    expectAddressField(t, payload.address, 'address');
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is'], 'rao');
    expectHexField(t, payload.rao.tx, 32, 'rao.tx');
    expectHexField(t, payload.rao.txv, 32, 'rao.txv');
    expectHexField(t, payload.rao.iw, 32, 'rao.iw');
    expectHexField(t, payload.rao.in, 32, 'rao.in');
    expectHexField(t, payload.rao.is, 64, 'rao.is');
    t.is(payload.rao.txv, txValidity);
    t.is(payload.rao.iw, writingKey);
});

test('ApplyStateMessageBuilder partial remove writer (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = hex('33', 32);
    const writingKey = hex('44', 32);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.REMOVE_WRITER)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setWriterKey(writingKey)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.REMOVE_WRITER);
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is'], 'rao');
    expectHexField(t, payload.rao.tx, 32, 'rao.tx');
    expectHexField(t, payload.rao.txv, 32, 'rao.txv');
    expectHexField(t, payload.rao.iw, 32, 'rao.iw');
    expectHexField(t, payload.rao.in, 32, 'rao.in');
    expectHexField(t, payload.rao.is, 64, 'rao.is');
    t.is(payload.rao.txv, txValidity);
    t.is(payload.rao.iw, writingKey);
});

test('ApplyStateMessageBuilder partial admin recovery (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = hex('55', 32);
    const writingKey = hex('66', 32);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.ADMIN_RECOVERY)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setWriterKey(writingKey)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADMIN_RECOVERY);
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is'], 'rao');
    expectHexField(t, payload.rao.tx, 32, 'rao.tx');
    expectHexField(t, payload.rao.txv, 32, 'rao.txv');
    expectHexField(t, payload.rao.iw, 32, 'rao.iw');
    expectHexField(t, payload.rao.in, 32, 'rao.in');
    expectHexField(t, payload.rao.is, 64, 'rao.is');
    t.is(payload.rao.txv, txValidity);
    t.is(payload.rao.iw, writingKey);
});

test('ApplyStateMessageBuilder partial bootstrap deployment (bdo)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = hex('77', 32);
    const externalBootstrap = hex('88', 32);
    const channel = hex('99', 32);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setExternalBootstrap(externalBootstrap)
        .setChannel(channel)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.BOOTSTRAP_DEPLOYMENT);
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'bdo');
    expectKeys(t, payload.bdo, ['tx', 'txv', 'bs', 'ic', 'in', 'is'], 'bdo');
    expectHexField(t, payload.bdo.tx, 32, 'bdo.tx');
    expectHexField(t, payload.bdo.txv, 32, 'bdo.txv');
    expectHexField(t, payload.bdo.bs, 32, 'bdo.bs');
    expectHexField(t, payload.bdo.ic, 32, 'bdo.ic');
    expectHexField(t, payload.bdo.in, 32, 'bdo.in');
    expectHexField(t, payload.bdo.is, 64, 'bdo.is');
    t.is(payload.bdo.txv, txValidity);
    t.is(payload.bdo.bs, externalBootstrap);
    t.is(payload.bdo.ic, channel);
});

test('ApplyStateMessageBuilder partial transaction operation (txo)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = hex('aa', 32);
    const writingKey = hex('bb', 32);
    const contentHash = hex('cc', 32);
    const externalBootstrap = hex('dd', 32);
    const msbBootstrap = hex('ee', 32);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.TX)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setWriterKey(writingKey)
        .setContentHash(contentHash)
        .setExternalBootstrap(externalBootstrap)
        .setMsbBootstrap(msbBootstrap)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.TX);
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'txo');
    expectKeys(t, payload.txo, ['tx', 'txv', 'iw', 'ch', 'bs', 'mbs', 'in', 'is'], 'txo');
    expectHexField(t, payload.txo.tx, 32, 'txo.tx');
    expectHexField(t, payload.txo.txv, 32, 'txo.txv');
    expectHexField(t, payload.txo.iw, 32, 'txo.iw');
    expectHexField(t, payload.txo.ch, 32, 'txo.ch');
    expectHexField(t, payload.txo.bs, 32, 'txo.bs');
    expectHexField(t, payload.txo.mbs, 32, 'txo.mbs');
    expectHexField(t, payload.txo.in, 32, 'txo.in');
    expectHexField(t, payload.txo.is, 64, 'txo.is');
    t.is(payload.txo.txv, txValidity);
    t.is(payload.txo.iw, writingKey);
    t.is(payload.txo.ch, contentHash);
    t.is(payload.txo.bs, externalBootstrap);
    t.is(payload.txo.mbs, msbBootstrap);
});

test('ApplyStateMessageBuilder partial transfer operation (tro)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = hex('ab', 32);
    const amount = hex('cd', 16);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.TRANSFER)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setIncomingAddress(otherWallet.address)
        .setAmount(amount)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.TRANSFER);
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'tro');
    expectKeys(t, payload.tro, ['tx', 'txv', 'to', 'am', 'in', 'is'], 'tro');
    expectHexField(t, payload.tro.tx, 32, 'tro.tx');
    expectHexField(t, payload.tro.txv, 32, 'tro.txv');
    expectAddressField(t, payload.tro.to, 'tro.to');
    expectHexField(t, payload.tro.am, 16, 'tro.am');
    expectHexField(t, payload.tro.in, 32, 'tro.in');
    expectHexField(t, payload.tro.is, 64, 'tro.is');
    t.is(payload.tro.txv, txValidity);
    t.is(payload.tro.to, otherWallet.address);
    t.is(payload.tro.am, amount);
});

test('ApplyStateMessageBuilder partial HTLC claim operation (hco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const { txv, li: lockId, pi: preimage } = applyOperationFixtures.validHtlcClaimOperation.hco;

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('buffer')
        .setOperationType(OperationType.HTLC_CLAIM)
        .setAddress(wallet.address)
        .setTxValidity(txv)
        .setHtlcLockId(lockId)
        .setHtlcPreimage(preimage)
        .build();

    const payload = builder.getPayload();
    const expectedTx = await tracCryptoApi.hash.blake3(createMessage(
        config.networkId,
        txv,
        lockId,
        preimage,
        payload.hco.in,
        OperationType.HTLC_CLAIM
    ));

    t.is(payload.type, OperationType.HTLC_CLAIM);
    expectPayloadKeys(t, payload, 'hco');
    expectKeys(t, payload.hco, ['tx', 'txv', 'li', 'pi', 'in', 'is'], 'hco');
    t.ok(b4a.equals(payload.hco.tx, expectedTx), 'hco.tx binds the canonical claim fields');
    t.ok(b4a.equals(payload.hco.txv, txv), 'hco.txv matches');
    t.ok(b4a.equals(payload.hco.li, lockId), 'hco.li matches the lock ID');
    t.ok(b4a.equals(payload.hco.pi, preimage), 'hco.pi matches');
    expectBufferField(t, payload.hco.in, 32, 'hco.in');
    expectBufferField(t, payload.hco.is, 64, 'hco.is');
    t.ok(wallet.verify(payload.hco.is, payload.hco.tx, wallet.publicKey), 'hco.is signs hco.tx');
});

test('ApplyStateMessageBuilder partial HTLC refund signs the canonical fields and survives encoding', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const { txv, li: lockId } = applyOperationFixtures.validPartialHtlcRefundOperation.hro;
    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('buffer')
        .setOperationType(OperationType.HTLC_REFUND)
        .setAddress(wallet.address)
        .setTxValidity(txv)
        .setHtlcLockId(lockId)
        .build();

    const payload = builder.getPayload();
    const expectedTx = await tracCryptoApi.hash.blake3(createMessage(
        config.networkId, txv, lockId, payload.hro.in, OperationType.HTLC_REFUND
    ));
    const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(payload));

    t.is(payload.type, OperationType.HTLC_REFUND);
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'hro');
    expectKeys(t, payload.hro, ['tx', 'txv', 'li', 'in', 'is'], 'hro');
    t.ok(b4a.equals(payload.hro.tx, expectedTx), 'refund hash binds the canonical fields');
    t.ok(b4a.equals(payload.hro.txv, txv));
    t.ok(b4a.equals(payload.hro.li, lockId));
    expectBufferField(t, payload.hro.in, 32, 'hro.in');
    expectBufferField(t, payload.hro.is, 64, 'hro.is');
    t.ok(wallet.verify(payload.hro.is, expectedTx, wallet.publicKey), 'submitter signs the refund hash');
    for (const field of ['tx', 'txv', 'li', 'in', 'is']) {
        t.ok(b4a.equals(decoded.hro[field], payload.hro[field]), `encoded hro.${field} is preserved`);
    }
    for (const field of ['va', 'vn', 'vs']) {
        t.absent(Object.hasOwn(decoded.hro, field), `partial refund has no ${field}`);
    }
});

test('ApplyStateMessageBuilder partial HTLC refund accepts hex inputs and produces JSON', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txv = hex('11', 32);
    const lockId = hex('22', 32);
    const nonce = hex('33', 32);
    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('partial')
        .setOutput('json')
        .setOperationType(OperationType.HTLC_REFUND)
        .setAddress(wallet.address)
        .setTxValidity(txv)
        .setHtlcLockId(lockId)
        .setNonce(nonce)
        .build();

    const payload = builder.getPayload();
    const expectedTx = await tracCryptoApi.hash.blake3(createMessage(
        config.networkId,
        b4a.from(txv, 'hex'),
        b4a.from(lockId, 'hex'),
        b4a.from(nonce, 'hex'),
        OperationType.HTLC_REFUND
    ));
    t.is(payload.address, wallet.address);
    expectPayloadKeys(t, payload, 'hro');
    expectKeys(t, payload.hro, ['tx', 'txv', 'li', 'in', 'is'], 'hro');
    for (const field of ['tx', 'txv', 'li', 'in']) {
        expectHexField(t, payload.hro[field], 32, `hro.${field}`);
    }
    expectHexField(t, payload.hro.is, 64, 'hro.is');
    t.is(payload.hro.tx, b4a.toString(expectedTx, 'hex'));
    t.is(payload.hro.txv, txv);
    t.is(payload.hro.li, lockId);
    t.is(payload.hro.in, nonce);
    t.ok(wallet.verify(b4a.from(payload.hro.is, 'hex'), expectedTx, wallet.publicKey));
});

test('ApplyStateMessageBuilder partial HTLC refund requires transaction validity and lock ID', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const fields = [
        ['setTxValidity', b4a.alloc(32, 1), 'Transaction validity'],
        ['setHtlcLockId', b4a.alloc(32, 2), 'HTLC lock ID']
    ];
    for (const [missingSetter, , label] of fields) {
        const builder = new ApplyStateMessageBuilder(wallet, config)
            .setPhase('partial')
            .setOutput('buffer')
            .setOperationType(OperationType.HTLC_REFUND)
            .setAddress(wallet.address);
        for (const [setter, value] of fields) {
            if (setter !== missingSetter) builder[setter](value);
        }
        await t.exception(() => builder.build(), new RegExp(`${label} must be set before build`));
    }
});
