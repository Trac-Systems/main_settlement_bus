import test from 'brittle';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import tracCryptoApi from 'trac-crypto-api';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants';
import { TRAC_NETWORK_TESTNET_ID } from 'trac-crypto-api/constants.js';

import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import deploymentEntryUtils from '../../../../src/core/state/utils/deploymentEntry.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import { safeEncodeApplyOperation } from '../../../../src/utils/protobuf/operationHelpers.js';
import { operationToPayload } from '../../../../src/utils/applyOperations.js';
import { bigIntToBuffer, NULL_BUFFER } from '../../../../src/utils/buffer.js';
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import { OperationType } from '../../../../src/utils/constants.js';
import {
    testKeyPair1,
    testKeyPair2,
    testKeyPair3,
    testKeyPair4
} from '../../../fixtures/apply.fixtures.js';

const walletCache = new Map();

export const DEFAULT_TX_VALIDITY = b4a.alloc(32, 0x11);
export const DEFAULT_WRITER_KEY = b4a.alloc(32, 0x22);
export const DEFAULT_CONTENT_HASH = b4a.alloc(32, 0x33);
export const DEFAULT_EXTERNAL_BOOTSTRAP = b4a.alloc(32, 0x44);
export const DEFAULT_CHANNEL = b4a.alloc(32, 0x55);
export const config = {
    addressLength: 63,
    addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
    bootstrap: b4a.from('e90cca53847a12a82f3bf0f67401e45e2ccc1698ee163e61414c2894eb3c6b12', 'hex'),
    networkId: TRAC_NETWORK_TESTNET_ID
};

export async function getWallet(fixture = testKeyPair1) {
    if (!walletCache.has(fixture.mnemonic)) {
        const wallet = await new WalletProvider(config).fromMnemonic({ mnemonic: fixture.mnemonic });
        walletCache.set(fixture.mnemonic, wallet);
    }

    return walletCache.get(fixture.mnemonic);
}

export async function getWalletSet() {
    const requester = await getWallet(testKeyPair1);
    const validator = await getWallet(testKeyPair2);
    const recipient = await getWallet(testKeyPair3);
    const alternate = await getWallet(testKeyPair4);

    return { requester, validator, recipient, alternate };
}

export function createNodeEntry({
    wk = DEFAULT_WRITER_KEY,
    balance = $TNK(100n),
    stakedBalance = b4a.alloc(16),
    license = b4a.alloc(4),
    isWhitelisted = true,
    isWriter = false,
    isIndexer = false
} = {}) {
    return {
        wk,
        balance,
        stakedBalance,
        license,
        isWhitelisted,
        isWriter,
        isIndexer
    };
}

export function createState(overrides = {}) {
    const txEntries = overrides.txEntries ?? new Map();
    const signedEntries = overrides.signedEntries ?? new Map();
    const unsignedEntries = overrides.unsignedEntries ?? new Map();
    const registeredWriterKeys = overrides.registeredWriterKeys ?? new Map();
    const registeredBootstrapEntries = overrides.registeredBootstrapEntries ?? new Map();
    const registeredBootstrapEntriesUnsigned = overrides.registeredBootstrapEntriesUnsigned ?? new Map();

    return {
        getIndexerSequenceState: overrides.getIndexerSequenceState ?? (async () => overrides.txValidity ?? DEFAULT_TX_VALIDITY),
        get: overrides.get ?? (async key => txEntries.get(key) ?? null),
        getNodeEntry: overrides.getNodeEntry ?? (async address => signedEntries.get(address) ?? null),
        getNodeEntryUnsigned: overrides.getNodeEntryUnsigned ?? (async address => unsignedEntries.get(address) ?? null),
        getRegisteredWriterKey: overrides.getRegisteredWriterKey ?? (async key => registeredWriterKeys.get(key) ?? null),
        getAdminEntry: overrides.getAdminEntry ?? (async () => overrides.adminEntry ?? null),
        getRegisteredBootstrapEntry: overrides.getRegisteredBootstrapEntry ?? (async key => registeredBootstrapEntries.get(key) ?? null),
        getRegisteredBootstrapEntryUnsigned: overrides.getRegisteredBootstrapEntryUnsigned ?? (async key => registeredBootstrapEntriesUnsigned.get(key) ?? null)
    };
}

export async function buildRoleAccessPayload(type, wallet, txValidity = DEFAULT_TX_VALIDITY, writingKey = DEFAULT_WRITER_KEY) {
    const director = applyStateMessageFactory(wallet, config);

    if (type === OperationType.ADD_WRITER) {
        return director.buildPartialAddWriterMessage(wallet.address, writingKey, txValidity, 'buffer');
    }

    if (type === OperationType.REMOVE_WRITER) {
        return director.buildPartialRemoveWriterMessage(wallet.address, writingKey, txValidity, 'buffer');
    }

    return director.buildPartialAdminRecoveryMessage(wallet.address, writingKey, txValidity, 'buffer');
}

export async function buildBootstrapDeploymentPayload(wallet, txValidity = DEFAULT_TX_VALIDITY, bootstrap = DEFAULT_EXTERNAL_BOOTSTRAP, channel = DEFAULT_CHANNEL) {
    return applyStateMessageFactory(wallet, config)
        .buildPartialBootstrapDeploymentMessage(wallet.address, bootstrap, channel, txValidity, 'buffer');
}

export async function buildTransactionPayload(
    wallet,
    txValidity = DEFAULT_TX_VALIDITY,
    {
        writingKey = DEFAULT_WRITER_KEY,
        contentHash = DEFAULT_CONTENT_HASH,
        externalBootstrap = DEFAULT_EXTERNAL_BOOTSTRAP,
        msbBootstrap = config.bootstrap
    } = {}
) {
    return applyStateMessageFactory(wallet, config)
        .buildPartialTransactionOperationMessage(
            wallet.address,
            writingKey,
            txValidity,
            contentHash,
            externalBootstrap,
            msbBootstrap,
            'buffer'
        );
}

export async function buildTransferPayload(wallet, recipientAddress, amount, txValidity = DEFAULT_TX_VALIDITY) {
    return applyStateMessageFactory(wallet, config)
        .buildPartialTransferOperationMessage(wallet.address, recipientAddress, amount, txValidity, 'buffer');
}

export function getOperationBody(payload) {
    return payload[operationToPayload(payload.type)];
}

export function getPayloadTxHex(payload) {
    return getOperationBody(payload).tx.toString('hex');
}

export function createDeploymentRegistrationEntry(payload, requesterAddress) {
    return deploymentEntryUtils.encode(
        getOperationBody(payload).tx,
        addressToBuffer(requesterAddress, config.addressPrefix),
        config.addressPrefix
    );
}

export function createBootstrapTransactionRecord(payload) {
    return safeEncodeApplyOperation(payload);
}

export function createZeroPublicKeyAddress() {
    return tracCryptoApi.address.encode(config.addressPrefix, b4a.alloc(32));
}

export async function expectSharedValidatorError(t, fn, expectedCode, expectedMessage) {
    try {
        await fn();
        t.fail(`Expected SharedValidatorRejectionError with resultCode ${expectedCode}`);
    } catch (error) {
        t.is(error.resultCode, expectedCode);
        if (expectedMessage) {
            t.ok(error.message.includes(expectedMessage));
        }
        return error;
    }
}

export { test, b4a, bigIntToBuffer };
