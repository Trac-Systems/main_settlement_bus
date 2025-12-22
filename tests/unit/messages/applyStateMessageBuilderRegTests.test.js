import { test } from 'brittle';
import b4a from 'b4a';
import PeerWallet from 'trac-wallet';

import ApplyStateMessageBuilder from '../../../src/messages/state/ApplyStateMessageBuilder.js';
import ApplyStateMessageDirector from '../../../src/messages/state/ApplyStateMessageDirector.js';
import PartialStateMessageBuilder from '../../../src/messages/partialStateMessages/PartialStateMessageBuilder.js';
import PartialStateMessageDirector from '../../../src/messages/partialStateMessages/PartialStateMessageDirector.js';
import CompleteStateMessageBuilder from '../../../src/messages/completeStateMessages/CompleteStateMessageBuilder.js';
import CompleteStateMessageDirector from '../../../src/messages/completeStateMessages/CompleteStateMessageDirector.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';

const hex = (value, bytes) => value.repeat(bytes);
const toBuf = value => b4a.from(value, 'hex');

const txValidityHex = hex('11', 32);
const writingKeyHex = hex('22', 32);
const contentHashHex = hex('33', 32);
const externalBootstrapHex = hex('44', 32);
const msbBootstrapHex = hex('55', 32);
const channelHex = hex('66', 32);
const amountHex = hex('77', 16);

const txValidityBuf = toBuf(txValidityHex);
const writingKeyBuf = toBuf(writingKeyHex);
const contentHashBuf = toBuf(contentHashHex);
const externalBootstrapBuf = toBuf(externalBootstrapHex);
const msbBootstrapBuf = toBuf(msbBootstrapHex);
const channelBuf = toBuf(channelHex);
const amountBuf = toBuf(amountHex);
const txHashBuf = toBuf(hex('88', 32));
const incomingWriterKeyBuf = toBuf(hex('99', 32));
const incomingNonceBuf = toBuf(hex('aa', 32));
const incomingSignatureBuf = toBuf(hex('bb', 64));
const FIXED_NONCE = b4a.alloc(32, 7);

async function createWallet(mnemonic) {
    const wallet = new PeerWallet({ mnemonic, networkPrefix: config.addressPrefix });
    await wallet.ready;
    return wallet;
}

async function setupWallets(t) {
    const wallet = await createWallet(testKeyPair1.mnemonic);
    const otherWallet = await createWallet(testKeyPair2.mnemonic);
    const originalGenerateNonce = PeerWallet.generateNonce;
    PeerWallet.generateNonce = () => b4a.from(FIXED_NONCE);
    t.teardown(() => {
        PeerWallet.generateNonce = originalGenerateNonce;
    });
    return { wallet, otherWallet };
}

async function buildLegacyPartial(wallet, buildFn) {
    const builder = new PartialStateMessageBuilder(wallet, config);
    const director = new PartialStateMessageDirector(builder);
    return buildFn(director);
}

async function buildLegacyComplete(wallet, buildFn) {
    const builder = new CompleteStateMessageBuilder(wallet, config);
    const director = new CompleteStateMessageDirector(builder);
    return buildFn(director);
}

async function buildNew(wallet, buildFn) {
    const builder = new ApplyStateMessageBuilder(wallet, config);
    const director = new ApplyStateMessageDirector(builder);
    return buildFn(director);
}

async function comparePayloads(t, name, legacyBuild, unifiedBuild) {
    const legacyPayload = await legacyBuild();
    const unifiedPayload = await unifiedBuild();
    t.alike(unifiedPayload, legacyPayload, name);
}

test('add writer matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'add writer partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildAddWriterMessage(wallet.address, writingKeyHex, txValidityHex)
        ),
        () => buildNew(wallet, director =>
            director.buildPartialAddWriterMessage(wallet.address, writingKeyHex, txValidityHex, 'json')
        )
    );
    await comparePayloads(
        t,
        'add writer complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildAddWriterMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildAddWriterMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        )
    );
});

test('remove writer matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'remove writer partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildRemoveWriterMessage(wallet.address, writingKeyHex, txValidityHex)
        ),
        () => buildNew(wallet, director =>
            director.buildPartialRemoveWriterMessage(wallet.address, writingKeyHex, txValidityHex, 'json')
        )
    );
    await comparePayloads(
        t,
        'remove writer complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildRemoveWriterMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildRemoveWriterMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        )
    );
});

test('admin recovery matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'admin recovery partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildAdminRecoveryMessage(wallet.address, writingKeyHex, txValidityHex)
        ),
        () => buildNew(wallet, director =>
            director.buildPartialAdminRecoveryMessage(wallet.address, writingKeyHex, txValidityHex, 'json')
        )
    );
    await comparePayloads(
        t,
        'admin recovery complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildAdminRecoveryMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildAdminRecoveryMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        )
    );
});

test('bootstrap deployment matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'bootstrap deployment partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildPartialBootstrapDeploymentMessage(wallet.address, externalBootstrapHex, channelHex, txValidityHex)
        ),
        () => buildNew(wallet, director =>
            director.buildPartialBootstrapDeploymentMessage(wallet.address, externalBootstrapHex, channelHex, txValidityHex, 'json')
        )
    );
    await comparePayloads(
        t,
        'bootstrap deployment complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildBootstrapDeploymentMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                externalBootstrapBuf,
                channelBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildBootstrapDeploymentMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                externalBootstrapBuf,
                channelBuf,
                incomingNonceBuf,
                incomingSignatureBuf
            )
        )
    );
});

test('transaction operation matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'transaction operation partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildTransactionOperationMessage(
                wallet.address,
                writingKeyHex,
                txValidityHex,
                contentHashHex,
                externalBootstrapHex,
                msbBootstrapHex
            )
        ),
        () => buildNew(wallet, director =>
            director.buildPartialTransactionOperationMessage(
                wallet.address,
                writingKeyHex,
                txValidityHex,
                contentHashHex,
                externalBootstrapHex,
                msbBootstrapHex,
                'json'
            )
        )
    );
    await comparePayloads(
        t,
        'transaction operation complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildTransactionOperationMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                contentHashBuf,
                incomingSignatureBuf,
                externalBootstrapBuf,
                msbBootstrapBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildTransactionOperationMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingWriterKeyBuf,
                incomingNonceBuf,
                contentHashBuf,
                incomingSignatureBuf,
                externalBootstrapBuf,
                msbBootstrapBuf
            )
        )
    );
});

test('transfer operation matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'transfer operation partial',
        () => buildLegacyPartial(wallet, director =>
            director.buildTransferOperationMessage(
                wallet.address,
                otherWallet.address,
                amountHex,
                txValidityHex
            )
        ),
        () => buildNew(wallet, director =>
            director.buildPartialTransferOperationMessage(
                wallet.address,
                otherWallet.address,
                amountHex,
                txValidityHex,
                'json'
            )
        )
    );
    await comparePayloads(
        t,
        'transfer operation complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildTransferOperationMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingNonceBuf,
                otherWallet.address,
                amountBuf,
                incomingSignatureBuf
            )
        ),
        () => buildNew(wallet, director =>
            director.buildTransferOperationMessage(
                wallet.address,
                txHashBuf,
                txValidityBuf,
                incomingNonceBuf,
                otherWallet.address,
                amountBuf,
                incomingSignatureBuf
            )
        )
    );
});

test('add admin matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'add admin complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildAddAdminMessage(wallet.address, writingKeyBuf, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildAddAdminMessage(wallet.address, writingKeyBuf, txValidityBuf)
        )
    );
});

test('disable initialization matches legacy directors', async t => {
    const { wallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'disable initialization complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildDisableInitializationMessage(wallet.address, writingKeyBuf, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildDisableInitializationMessage(wallet.address, writingKeyBuf, txValidityBuf)
        )
    );
});

test('balance initialization matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'balance initialization complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildBalanceInitializationMessage(wallet.address, otherWallet.address, amountBuf, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildBalanceInitializationMessage(wallet.address, otherWallet.address, amountBuf, txValidityBuf)
        )
    );
});

test('append whitelist matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'append whitelist complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildAppendWhitelistMessage(wallet.address, otherWallet.address, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildAppendWhitelistMessage(wallet.address, otherWallet.address, txValidityBuf)
        )
    );
});

test('add indexer matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'add indexer complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildAddIndexerMessage(wallet.address, otherWallet.address, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildAddIndexerMessage(wallet.address, otherWallet.address, txValidityBuf)
        )
    );
});

test('remove indexer matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'remove indexer complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildRemoveIndexerMessage(wallet.address, otherWallet.address, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildRemoveIndexerMessage(wallet.address, otherWallet.address, txValidityBuf)
        )
    );
});

test('ban validator matches legacy directors', async t => {
    const { wallet, otherWallet } = await setupWallets(t);
    await comparePayloads(
        t,
        'ban validator complete',
        () => buildLegacyComplete(wallet, director =>
            director.buildBanWriterMessage(wallet.address, otherWallet.address, txValidityBuf)
        ),
        () => buildNew(wallet, director =>
            director.buildBanWriterMessage(wallet.address, otherWallet.address, txValidityBuf)
        )
    );
});
