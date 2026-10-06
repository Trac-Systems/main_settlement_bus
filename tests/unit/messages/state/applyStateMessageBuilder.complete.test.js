import { test } from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import ApplyStateMessageBuilder from '../../../../src/messages/state/ApplyStateMessageBuilder.js';
import {
    decodeEpochProofV1,
    encodeConsensusConfig,
    encodeEpochProofV1,
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../src/codecs/apply/applyOperationCodec.js';
import { OperationType } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../../fixtures/apply.fixtures.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import {
    proofProposalApproval as approval,
    proofProposalData
} from '../../../helpers/proofProposal.js';
import { createMessage } from '../../../../src/utils/buffer.js';

const hex = (value, bytes) => value.repeat(bytes);
const toBuf = value => b4a.from(value, 'hex');

async function createWallet(mnemonic) {
    return await new WalletProvider(config).fromMnemonic({ mnemonic, derivationPath: config.derivationPath })
}

await tracCryptoApi.hash.blake3(b4a.from('warmup'));

function expectBufferField(t, value, bytes, label) {
    t.ok(b4a.isBuffer(value), `${label} type`);
    t.is(value.length, bytes, `${label} length`);
}

function expectAddressBuffer(t, value, label) {
    expectBufferField(t, value, config.addressLength, label);
}

function expectKeys(t, value, keys, label) {
    t.alike(Object.keys(value).sort(), keys.slice().sort(), `${label} keys`);
}

function expectPayloadKeys(t, payload, bodyKey) {
    expectKeys(t, payload, ['type', 'address', bodyKey], 'payload');
}

test('ApplyStateMessageBuilder complete add admin (cao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('11', 32));
    const writingKey = toBuf(hex('22', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.ADD_ADMIN)
        .setAddress(wallet.address)
        .setWriterKey(writingKey)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADD_ADMIN);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'cao');
    expectKeys(t, payload.cao, ['tx', 'txv', 'iw', 'in', 'is'], 'cao');
    expectBufferField(t, payload.cao.tx, 32, 'cao.tx');
    expectBufferField(t, payload.cao.txv, 32, 'cao.txv');
    expectBufferField(t, payload.cao.iw, 32, 'cao.iw');
    t.ok(b4a.equals(payload.cao.txv, txValidity));
    t.ok(b4a.equals(payload.cao.iw, writingKey));
    expectBufferField(t, payload.cao.in, 32, 'cao.in');
    expectBufferField(t, payload.cao.is, 64, 'cao.is');
});

test('ApplyStateMessageBuilder complete disable initialization (cao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('33', 32));
    const writingKey = toBuf(hex('44', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.DISABLE_INITIALIZATION)
        .setAddress(wallet.address)
        .setWriterKey(writingKey)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.DISABLE_INITIALIZATION);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'cao');
    expectKeys(t, payload.cao, ['tx', 'txv', 'iw', 'in', 'is'], 'cao');
    expectBufferField(t, payload.cao.tx, 32, 'cao.tx');
    expectBufferField(t, payload.cao.txv, 32, 'cao.txv');
    expectBufferField(t, payload.cao.iw, 32, 'cao.iw');
    t.ok(b4a.equals(payload.cao.txv, txValidity));
    t.ok(b4a.equals(payload.cao.iw, writingKey));
    expectBufferField(t, payload.cao.in, 32, 'cao.in');
    expectBufferField(t, payload.cao.is, 64, 'cao.is');
});

test('ApplyStateMessageBuilder complete balance initialization (bio)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = toBuf(hex('55', 32));
    const amount = toBuf(hex('66', 16));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.BALANCE_INITIALIZATION)
        .setAddress(wallet.address)
        .setIncomingAddress(otherWallet.address)
        .setAmount(amount)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.BALANCE_INITIALIZATION);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'bio');
    expectKeys(t, payload.bio, ['tx', 'txv', 'ia', 'am', 'in', 'is'], 'bio');
    expectBufferField(t, payload.bio.tx, 32, 'bio.tx');
    expectBufferField(t, payload.bio.txv, 32, 'bio.txv');
    expectAddressBuffer(t, payload.bio.ia, 'bio.ia');
    expectBufferField(t, payload.bio.am, 16, 'bio.am');
    t.ok(b4a.equals(payload.bio.txv, txValidity));
    t.ok(b4a.equals(payload.bio.ia, addressToBuffer(otherWallet.address, config.addressPrefix)));
    t.ok(b4a.equals(payload.bio.am, amount));
    expectBufferField(t, payload.bio.in, 32, 'bio.in');
    expectBufferField(t, payload.bio.is, 64, 'bio.is');
});

test('ApplyStateMessageBuilder complete append whitelist (aco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = toBuf(hex('77', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.APPEND_WHITELIST)
        .setAddress(wallet.address)
        .setIncomingAddress(otherWallet.address)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.APPEND_WHITELIST);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'aco');
    expectKeys(t, payload.aco, ['tx', 'txv', 'ia', 'in', 'is'], 'aco');
    expectBufferField(t, payload.aco.tx, 32, 'aco.tx');
    expectBufferField(t, payload.aco.txv, 32, 'aco.txv');
    expectAddressBuffer(t, payload.aco.ia, 'aco.ia');
    t.ok(b4a.equals(payload.aco.txv, txValidity));
    t.ok(b4a.equals(payload.aco.ia, addressToBuffer(otherWallet.address, config.addressPrefix)));
    expectBufferField(t, payload.aco.in, 32, 'aco.in');
    expectBufferField(t, payload.aco.is, 64, 'aco.is');
});

test('ApplyStateMessageBuilder complete add indexer (aco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = toBuf(hex('88', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.ADD_INDEXER)
        .setAddress(wallet.address)
        .setIncomingAddress(otherWallet.address)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADD_INDEXER);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'aco');
    expectKeys(t, payload.aco, ['tx', 'txv', 'ia', 'in', 'is'], 'aco');
    expectBufferField(t, payload.aco.tx, 32, 'aco.tx');
    expectBufferField(t, payload.aco.txv, 32, 'aco.txv');
    expectAddressBuffer(t, payload.aco.ia, 'aco.ia');
    t.ok(b4a.equals(payload.aco.txv, txValidity));
    t.ok(b4a.equals(payload.aco.ia, addressToBuffer(otherWallet.address, config.addressPrefix)));
    expectBufferField(t, payload.aco.in, 32, 'aco.in');
    expectBufferField(t, payload.aco.is, 64, 'aco.is');
});

test('ApplyStateMessageBuilder complete remove indexer (aco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = toBuf(hex('99', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.REMOVE_INDEXER)
        .setAddress(wallet.address)
        .setIncomingAddress(otherWallet.address)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.REMOVE_INDEXER);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'aco');
    expectKeys(t, payload.aco, ['tx', 'txv', 'ia', 'in', 'is'], 'aco');
    expectBufferField(t, payload.aco.tx, 32, 'aco.tx');
    expectBufferField(t, payload.aco.txv, 32, 'aco.txv');
    expectAddressBuffer(t, payload.aco.ia, 'aco.ia');
    t.ok(b4a.equals(payload.aco.txv, txValidity));
    t.ok(b4a.equals(payload.aco.ia, addressToBuffer(otherWallet.address, config.addressPrefix)));
    expectBufferField(t, payload.aco.in, 32, 'aco.in');
    expectBufferField(t, payload.aco.is, 64, 'aco.is');
});

test('ApplyStateMessageBuilder complete ban validator (aco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txValidity = toBuf(hex('aa', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.BAN_VALIDATOR)
        .setAddress(wallet.address)
        .setIncomingAddress(otherWallet.address)
        .setTxValidity(txValidity)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.BAN_VALIDATOR);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'aco');
    expectKeys(t, payload.aco, ['tx', 'txv', 'ia', 'in', 'is'], 'aco');
    expectBufferField(t, payload.aco.tx, 32, 'aco.tx');
    expectBufferField(t, payload.aco.txv, 32, 'aco.txv');
    expectAddressBuffer(t, payload.aco.ia, 'aco.ia');
    t.ok(b4a.equals(payload.aco.txv, txValidity));
    t.ok(b4a.equals(payload.aco.ia, addressToBuffer(otherWallet.address, config.addressPrefix)));
    expectBufferField(t, payload.aco.in, 32, 'aco.in');
    expectBufferField(t, payload.aco.is, 64, 'aco.is');
});

test('ApplyStateMessageBuilder complete add writer (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txHash = toBuf(hex('bb', 32));
    const txValidity = toBuf(hex('cc', 32));
    const incomingWriterKey = toBuf(hex('dd', 32));
    const incomingNonce = toBuf(hex('ee', 32));
    const incomingSignature = toBuf(hex('ff', 64));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.ADD_WRITER)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setIncomingWriterKey(incomingWriterKey)
        .setIncomingNonce(incomingNonce)
        .setIncomingSignature(incomingSignature)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADD_WRITER);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is', 'va', 'vn', 'vs'], 'rao');
    expectBufferField(t, payload.rao.tx, 32, 'rao.tx');
    expectBufferField(t, payload.rao.txv, 32, 'rao.txv');
    expectBufferField(t, payload.rao.iw, 32, 'rao.iw');
    expectBufferField(t, payload.rao.in, 32, 'rao.in');
    expectBufferField(t, payload.rao.is, 64, 'rao.is');
    expectAddressBuffer(t, payload.rao.va, 'rao.va');
    expectBufferField(t, payload.rao.vn, 32, 'rao.vn');
    expectBufferField(t, payload.rao.vs, 64, 'rao.vs');
    t.ok(b4a.equals(payload.rao.tx, txHash));
    t.ok(b4a.equals(payload.rao.txv, txValidity));
    t.ok(b4a.equals(payload.rao.iw, incomingWriterKey));
    t.ok(b4a.equals(payload.rao.in, incomingNonce));
    t.ok(b4a.equals(payload.rao.is, incomingSignature));
});

test('ApplyStateMessageBuilder complete remove writer (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txHash = toBuf(hex('01', 32));
    const txValidity = toBuf(hex('02', 32));
    const incomingWriterKey = toBuf(hex('03', 32));
    const incomingNonce = toBuf(hex('04', 32));
    const incomingSignature = toBuf(hex('05', 64));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.REMOVE_WRITER)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setIncomingWriterKey(incomingWriterKey)
        .setIncomingNonce(incomingNonce)
        .setIncomingSignature(incomingSignature)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.REMOVE_WRITER);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is', 'va', 'vn', 'vs'], 'rao');
    expectBufferField(t, payload.rao.tx, 32, 'rao.tx');
    expectBufferField(t, payload.rao.txv, 32, 'rao.txv');
    expectBufferField(t, payload.rao.iw, 32, 'rao.iw');
    expectBufferField(t, payload.rao.in, 32, 'rao.in');
    expectBufferField(t, payload.rao.is, 64, 'rao.is');
    expectAddressBuffer(t, payload.rao.va, 'rao.va');
    expectBufferField(t, payload.rao.vn, 32, 'rao.vn');
    expectBufferField(t, payload.rao.vs, 64, 'rao.vs');
    t.ok(b4a.equals(payload.rao.tx, txHash));
    t.ok(b4a.equals(payload.rao.txv, txValidity));
    t.ok(b4a.equals(payload.rao.iw, incomingWriterKey));
    t.ok(b4a.equals(payload.rao.in, incomingNonce));
    t.ok(b4a.equals(payload.rao.is, incomingSignature));
});

test('ApplyStateMessageBuilder complete admin recovery (rao)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txHash = toBuf(hex('10', 32));
    const txValidity = toBuf(hex('20', 32));
    const incomingWriterKey = toBuf(hex('30', 32));
    const incomingNonce = toBuf(hex('40', 32));
    const incomingSignature = toBuf(hex('50', 64));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.ADMIN_RECOVERY)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setIncomingWriterKey(incomingWriterKey)
        .setIncomingNonce(incomingNonce)
        .setIncomingSignature(incomingSignature)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.ADMIN_RECOVERY);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'rao');
    expectKeys(t, payload.rao, ['tx', 'txv', 'iw', 'in', 'is', 'va', 'vn', 'vs'], 'rao');
    expectBufferField(t, payload.rao.tx, 32, 'rao.tx');
    expectBufferField(t, payload.rao.txv, 32, 'rao.txv');
    expectBufferField(t, payload.rao.iw, 32, 'rao.iw');
    expectBufferField(t, payload.rao.in, 32, 'rao.in');
    expectBufferField(t, payload.rao.is, 64, 'rao.is');
    expectAddressBuffer(t, payload.rao.va, 'rao.va');
    expectBufferField(t, payload.rao.vn, 32, 'rao.vn');
    expectBufferField(t, payload.rao.vs, 64, 'rao.vs');
    t.ok(b4a.equals(payload.rao.tx, txHash));
    t.ok(b4a.equals(payload.rao.txv, txValidity));
    t.ok(b4a.equals(payload.rao.iw, incomingWriterKey));
    t.ok(b4a.equals(payload.rao.in, incomingNonce));
    t.ok(b4a.equals(payload.rao.is, incomingSignature));
});

test('ApplyStateMessageBuilder complete bootstrap deployment (bdo)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txHash = toBuf(hex('60', 32));
    const txValidity = toBuf(hex('70', 32));
    const externalBootstrap = toBuf(hex('80', 32));
    const channel = toBuf(hex('90', 32));
    const incomingNonce = toBuf(hex('a0', 32));
    const incomingSignature = toBuf(hex('b0', 64));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setExternalBootstrap(externalBootstrap)
        .setChannel(channel)
        .setIncomingNonce(incomingNonce)
        .setIncomingSignature(incomingSignature)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.BOOTSTRAP_DEPLOYMENT);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'bdo');
    expectKeys(t, payload.bdo, ['tx', 'txv', 'bs', 'ic', 'in', 'is', 'va', 'vn', 'vs'], 'bdo');
    expectBufferField(t, payload.bdo.tx, 32, 'bdo.tx');
    expectBufferField(t, payload.bdo.txv, 32, 'bdo.txv');
    expectBufferField(t, payload.bdo.bs, 32, 'bdo.bs');
    expectBufferField(t, payload.bdo.ic, 32, 'bdo.ic');
    expectBufferField(t, payload.bdo.in, 32, 'bdo.in');
    expectBufferField(t, payload.bdo.is, 64, 'bdo.is');
    expectAddressBuffer(t, payload.bdo.va, 'bdo.va');
    expectBufferField(t, payload.bdo.vn, 32, 'bdo.vn');
    expectBufferField(t, payload.bdo.vs, 64, 'bdo.vs');
    t.ok(b4a.equals(payload.bdo.tx, txHash));
    t.ok(b4a.equals(payload.bdo.txv, txValidity));
    t.ok(b4a.equals(payload.bdo.bs, externalBootstrap));
    t.ok(b4a.equals(payload.bdo.ic, channel));
    t.ok(b4a.equals(payload.bdo.in, incomingNonce));
    t.ok(b4a.equals(payload.bdo.is, incomingSignature));
});

test('ApplyStateMessageBuilder complete transaction operation (txo)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txHash = toBuf(hex('c0', 32));
    const txValidity = toBuf(hex('d0', 32));
    const incomingWriterKey = toBuf(hex('e0', 32));
    const incomingNonce = toBuf(hex('f0', 32));
    const incomingSignature = toBuf(hex('01', 64));
    const contentHash = toBuf(hex('02', 32));
    const externalBootstrap = toBuf(hex('03', 32));
    const msbBootstrap = toBuf(hex('04', 32));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.TX)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setIncomingWriterKey(incomingWriterKey)
        .setIncomingNonce(incomingNonce)
        .setIncomingSignature(incomingSignature)
        .setContentHash(contentHash)
        .setExternalBootstrap(externalBootstrap)
        .setMsbBootstrap(msbBootstrap)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.TX);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'txo');
    expectKeys(t, payload.txo, ['tx', 'txv', 'iw', 'ch', 'bs', 'mbs', 'in', 'is', 'va', 'vn', 'vs'], 'txo');
    expectBufferField(t, payload.txo.tx, 32, 'txo.tx');
    expectBufferField(t, payload.txo.txv, 32, 'txo.txv');
    expectBufferField(t, payload.txo.iw, 32, 'txo.iw');
    expectBufferField(t, payload.txo.in, 32, 'txo.in');
    expectBufferField(t, payload.txo.is, 64, 'txo.is');
    expectBufferField(t, payload.txo.ch, 32, 'txo.ch');
    expectBufferField(t, payload.txo.bs, 32, 'txo.bs');
    expectBufferField(t, payload.txo.mbs, 32, 'txo.mbs');
    expectAddressBuffer(t, payload.txo.va, 'txo.va');
    expectBufferField(t, payload.txo.vn, 32, 'txo.vn');
    expectBufferField(t, payload.txo.vs, 64, 'txo.vs');
    t.ok(b4a.equals(payload.txo.tx, txHash));
    t.ok(b4a.equals(payload.txo.txv, txValidity));
    t.ok(b4a.equals(payload.txo.iw, incomingWriterKey));
    t.ok(b4a.equals(payload.txo.in, incomingNonce));
    t.ok(b4a.equals(payload.txo.is, incomingSignature));
    t.ok(b4a.equals(payload.txo.ch, contentHash));
    t.ok(b4a.equals(payload.txo.bs, externalBootstrap));
    t.ok(b4a.equals(payload.txo.mbs, msbBootstrap));
});

test('ApplyStateMessageBuilder complete transfer operation (tro)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const txHash = toBuf(hex('05', 32));
    const txValidity = toBuf(hex('06', 32));
    const incomingNonce = toBuf(hex('07', 32));
    const incomingSignature = toBuf(hex('08', 64));
    const amount = toBuf(hex('09', 16));

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.TRANSFER)
        .setAddress(wallet.address)
        .setTxHash(txHash)
        .setTxValidity(txValidity)
        .setIncomingNonce(incomingNonce)
        .setIncomingAddress(otherWallet.address)
        .setAmount(amount)
        .setIncomingSignature(incomingSignature)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.TRANSFER);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'tro');
    expectKeys(t, payload.tro, ['tx', 'txv', 'to', 'am', 'in', 'is', 'va', 'vn', 'vs'], 'tro');
    expectBufferField(t, payload.tro.tx, 32, 'tro.tx');
    expectBufferField(t, payload.tro.txv, 32, 'tro.txv');
    expectAddressBuffer(t, payload.tro.to, 'tro.to');
    expectBufferField(t, payload.tro.am, 16, 'tro.am');
    expectBufferField(t, payload.tro.in, 32, 'tro.in');
    expectBufferField(t, payload.tro.is, 64, 'tro.is');
    expectAddressBuffer(t, payload.tro.va, 'tro.va');
    expectBufferField(t, payload.tro.vn, 32, 'tro.vn');
    expectBufferField(t, payload.tro.vs, 64, 'tro.vs');
    t.ok(b4a.equals(payload.tro.tx, txHash));
    t.ok(b4a.equals(payload.tro.txv, txValidity));
    t.ok(b4a.equals(payload.tro.to, addressToBuffer(otherWallet.address, config.addressPrefix)));
    t.ok(b4a.equals(payload.tro.am, amount));
    t.ok(b4a.equals(payload.tro.in, incomingNonce));
    t.ok(b4a.equals(payload.tro.is, incomingSignature));
});

test('ApplyStateMessageBuilder complete set epoch operation (seo)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const schemaVersion = b4a.from([0x01]);
    const proofData = proofProposalData();
    const approvals = [
        approval(0x15, 0x16),
        approval(0x17, 0x18)
    ];
    const epochData = encodeEpochProofV1({ pd: proofData, app: approvals });

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_EPOCH)
        .setAddress(wallet.address)
        .setEpochData(schemaVersion, epochData)
        .build();

    const payload = builder.getPayload();
    t.is(payload.type, OperationType.SET_EPOCH);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'seo');
    expectKeys(t, payload.seo, ['sv', 'data'], 'seo');
    expectBufferField(t, payload.seo.sv, 1, 'seo.sv');
    t.ok(b4a.isBuffer(payload.seo.data), 'seo.data type');
    t.ok(b4a.equals(payload.seo.sv, schemaVersion));
    t.ok(b4a.equals(payload.seo.data, epochData));
});

test('ApplyStateMessageBuilder complete set epoch operation codec roundtrip', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const schemaVersion = b4a.from([0x01]);
    const proofData = proofProposalData();
    const approvals = [
        approval(0x35, 0x36),
        approval(0x37, 0x38)
    ];
    const epochData = encodeEpochProofV1({ pd: proofData, app: approvals });

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_EPOCH)
        .setAddress(wallet.address)
        .setEpochData(schemaVersion, epochData)
        .build();

    const payload = builder.getPayload();
    const encoded = safeEncodeApplyOperation(payload);
    const decoded = safeDecodeApplyOperation(encoded);

    t.ok(b4a.isBuffer(encoded));
    t.ok(encoded.length > 0);
    t.is(decoded.type, OperationType.SET_EPOCH);
    t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(decoded).sort(), ['address', 'seo', 'type']);
    t.alike(Object.keys(decoded.seo).sort(), ['data', 'sv']);
    t.ok(b4a.equals(decoded.seo.sv, schemaVersion));
    t.ok(b4a.equals(decoded.seo.data, epochData));

    const decodedEpochProof = decodeEpochProofV1(decoded.seo.data);
    t.ok(b4a.equals(decodedEpochProof.pd, proofData));
    t.is(decodedEpochProof.app.length, approvals.length);
    t.ok(b4a.equals(decodedEpochProof.app[0], approvals[0]));
    t.ok(b4a.equals(decodedEpochProof.app[1], approvals[1]));
});

test('ApplyStateMessageBuilder complete set genesis epoch operation (cco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('11', 32));
    const consensusConfig = {
        sv: b4a.from([0x01]),
        cd: toBuf(hex('22', 6))
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_GENESIS_EPOCH)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setConsensusConfig(encodedConsensusConfig)
        .build();

    const payload = builder.getPayload();
    const expectedTx = await tracCryptoApi.hash.blake3(createMessage(
        config.networkId,
        txValidity,
        encodedConsensusConfig,
        payload.cco.in,
        OperationType.SET_GENESIS_EPOCH
    ));

    t.is(payload.type, OperationType.SET_GENESIS_EPOCH);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'cco');
    expectKeys(t, payload.cco, ['tx', 'txv', 'cc', 'in', 'is'], 'cco');
    expectKeys(t, payload.cco.cc, ['sv', 'cd'], 'cco.cc');
    expectBufferField(t, payload.cco.tx, 32, 'cco.tx');
    expectBufferField(t, payload.cco.txv, 32, 'cco.txv');
    expectBufferField(t, payload.cco.cc.sv, 1, 'cco.cc.sv');
    expectBufferField(t, payload.cco.in, 32, 'cco.in');
    expectBufferField(t, payload.cco.is, 64, 'cco.is');
    t.ok(b4a.equals(payload.cco.tx, expectedTx));
    t.ok(b4a.equals(payload.cco.txv, txValidity));
    t.ok(b4a.equals(payload.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(payload.cco.cc.cd, consensusConfig.cd));
    t.ok(wallet.verify(payload.cco.is, payload.cco.tx, wallet.publicKey));
});

test('ApplyStateMessageBuilder complete set genesis epoch operation codec roundtrip', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('44', 32));
    const consensusConfig = {
        sv: b4a.from([0x01]),
        cd: toBuf(hex('55', 6))
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_GENESIS_EPOCH)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setConsensusConfig(encodedConsensusConfig)
        .build();

    const payload = builder.getPayload();
    const encoded = safeEncodeApplyOperation(payload);
    const decoded = safeDecodeApplyOperation(encoded);

    t.ok(b4a.isBuffer(encoded));
    t.ok(encoded.length > 0);
    t.is(decoded.type, OperationType.SET_GENESIS_EPOCH);
    t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(decoded).sort(), ['address', 'cco', 'type']);
    t.alike(Object.keys(decoded.cco).sort(), ['cc', 'in', 'is', 'tx', 'txv']);
    t.alike(Object.keys(decoded.cco.cc).sort(), ['cd', 'sv']);
    t.ok(b4a.equals(decoded.cco.tx, payload.cco.tx));
    t.ok(b4a.equals(decoded.cco.txv, txValidity));
    t.ok(b4a.equals(decoded.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(decoded.cco.cc.cd, consensusConfig.cd));
    t.ok(b4a.equals(decoded.cco.in, payload.cco.in));
    t.ok(b4a.equals(decoded.cco.is, payload.cco.is));
});

test('ApplyStateMessageBuilder complete set consensus config operation (cco)', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('77', 32));
    const consensusConfig = {
        sv: b4a.from([0x01]),
        cd: b4a.from([0x02, 0x03, 0x04])
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_CONSENSUS_CONFIG)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setConsensusConfig(encodedConsensusConfig)
        .build();

    const payload = builder.getPayload();
    const expectedTx = await tracCryptoApi.hash.blake3(createMessage(
        config.networkId,
        txValidity,
        encodedConsensusConfig,
        payload.cco.in,
        OperationType.SET_CONSENSUS_CONFIG
    ));

    t.is(payload.type, OperationType.SET_CONSENSUS_CONFIG);
    expectAddressBuffer(t, payload.address, 'address');
    t.ok(b4a.equals(payload.address, addressToBuffer(wallet.address, config.addressPrefix)));
    expectPayloadKeys(t, payload, 'cco');
    expectKeys(t, payload.cco, ['tx', 'txv', 'cc', 'in', 'is'], 'cco');
    expectKeys(t, payload.cco.cc, ['sv', 'cd'], 'cco.cc');
    expectBufferField(t, payload.cco.tx, 32, 'cco.tx');
    expectBufferField(t, payload.cco.txv, 32, 'cco.txv');
    expectBufferField(t, payload.cco.cc.sv, 1, 'cco.cc.sv');
    expectBufferField(t, payload.cco.in, 32, 'cco.in');
    expectBufferField(t, payload.cco.is, 64, 'cco.is');
    t.ok(b4a.equals(payload.cco.tx, expectedTx));
    t.ok(b4a.equals(payload.cco.txv, txValidity));
    t.ok(b4a.equals(payload.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(payload.cco.cc.cd, consensusConfig.cd));
    t.ok(wallet.verify(payload.cco.is, payload.cco.tx, wallet.publicKey));
});

test('ApplyStateMessageBuilder complete set consensus config operation codec roundtrip', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('aa', 32));
    const consensusConfig = {
        sv: b4a.from([0xff]),
        cd: b4a.from([0x00, 0xff, 0x7f, 0x80])
    };
    const encodedConsensusConfig = encodeConsensusConfig(consensusConfig);

    const builder = new ApplyStateMessageBuilder(wallet, config);
    await builder
        .setPhase('complete')
        .setOutput('buffer')
        .setOperationType(OperationType.SET_CONSENSUS_CONFIG)
        .setAddress(wallet.address)
        .setTxValidity(txValidity)
        .setConsensusConfig(encodedConsensusConfig)
        .build();

    const payload = builder.getPayload();
    const encoded = safeEncodeApplyOperation(payload);
    const decoded = safeDecodeApplyOperation(encoded);

    t.ok(b4a.isBuffer(encoded));
    t.ok(encoded.length > 0);
    t.is(decoded.type, OperationType.SET_CONSENSUS_CONFIG);
    t.ok(b4a.equals(decoded.address, addressToBuffer(wallet.address, config.addressPrefix)));
    t.alike(Object.keys(decoded).sort(), ['address', 'cco', 'type']);
    t.alike(Object.keys(decoded.cco).sort(), ['cc', 'in', 'is', 'tx', 'txv']);
    t.alike(Object.keys(decoded.cco.cc).sort(), ['cd', 'sv']);
    t.ok(b4a.equals(decoded.cco.tx, payload.cco.tx));
    t.ok(b4a.equals(decoded.cco.txv, txValidity));
    t.ok(b4a.equals(decoded.cco.cc.sv, consensusConfig.sv));
    t.ok(b4a.equals(decoded.cco.cc.cd, consensusConfig.cd));
    t.ok(b4a.equals(decoded.cco.in, payload.cco.in));
    t.ok(b4a.equals(decoded.cco.is, payload.cco.is));
});

test('ApplyStateMessageBuilder rejects invalid encoded consensus config', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const builder = new ApplyStateMessageBuilder(wallet, config);

    t.exception(
        () => builder.setConsensusConfig(b4a.from([0x1a, 0x00])),
        /Schema version must be a one-byte buffer/
    );
});

test('ApplyStateMessageBuilder requires consensus config before build', async t => {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const txValidity = toBuf(hex('cc', 32));
    const builder = new ApplyStateMessageBuilder(wallet, config);

    await t.exception(
        () => builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.SET_CONSENSUS_CONFIG)
            .setAddress(wallet.address)
            .setTxValidity(txValidity)
            .build(),
        /Consensus config must be set before build/
    );
});
