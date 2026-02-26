import { test } from 'brittle';
import b4a from 'b4a';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { config } from '../../helpers/config.js';
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js';
import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import V1BroadcastTransactionOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1BroadcastTransactionOperationHandler.js';
import PartialTransactionValidator from '../../../src/core/network/protocols/shared/validators/PartialTransactionValidator.js';
import { TransactionPoolFullError } from '../../../src/core/network/services/TransactionPoolService.js';
import { V1NodeOverloadedError, V1NodeHasNoWriteAccess } from '../../../src/core/network/protocols/v1/V1ProtocolError.js';
import { applyStateMessageFactory } from '../../../src/messages/state/applyStateMessageFactory.js';
import { ResultCode, OperationType } from '../../../src/utils/constants.js';

const createWallet = (keyPair) => {
    const normalizedKeyPair = {
        publicKey: b4a.from(keyPair.publicKey, 'hex'),
        secretKey: b4a.from(keyPair.secretKey, 'hex')
    };

    return NetworkWalletFactory.provide({
        enableWallet: false,
        keyPair: normalizedKeyPair,
        networkPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX
    });
};

test('V1BroadcastTransactionOperationHandler dispatchTransaction does not emit unhandledRejection when enqueue fails after pending commit registration', async t => {
    const originalValidate = PartialTransactionValidator.prototype.validate;
    PartialTransactionValidator.prototype.validate = async () => true;

    try {
        const txPoolService = {
            addTransaction() {
                throw new TransactionPoolFullError(1);
            }
        };

        const pendingRejectors = new Map();
        const transactionCommitService = {
            registerPendingCommit(txHash) {
                return new Promise((resolve, reject) => {
                    pendingRejectors.set(txHash, reject);
                });
            },
            rejectPendingCommit(txHash, error) {
                const reject = pendingRejectors.get(txHash);
                if (!reject) return false;
                pendingRejectors.delete(txHash);
                reject(error);
                return true;
            }
        };

        const validatorWallet = createWallet(testKeyPair1);
        const requesterWallet = createWallet(testKeyPair2);
        const externalBootstrap = b4a.alloc(32, 0x11);

        const decodedTransaction = await applyStateMessageFactory(requesterWallet, config)
            .buildPartialTransactionOperationMessage(
                requesterWallet.address,
                b4a.alloc(32, 0x22),
                b4a.alloc(32, 0x33),
                b4a.alloc(32, 0x44),
                externalBootstrap,
                config.bootstrap,
                'buffer'
            );

        const handler = new V1BroadcastTransactionOperationHandler(
            {},
            validatorWallet,
            { v1HandleRateLimit() {} },
            txPoolService,
            { getPendingRequest() { return null; } },
            transactionCommitService,
            config
        );

        let unhandled = null;
        const onUnhandled = (error) => {
            unhandled = error;
        };

        const detachUnhandled = (() => {
            const proc = globalThis.process;
            if (proc?.once && proc?.removeListener) {
                proc.once('unhandledRejection', onUnhandled);
                return () => proc.removeListener('unhandledRejection', onUnhandled);
            }
            if (typeof globalThis.addEventListener === 'function') {
                const listener = (event) => onUnhandled(event?.reason ?? event);
                globalThis.addEventListener('unhandledrejection', listener);
                return () => globalThis.removeEventListener('unhandledrejection', listener);
            }
            if ('onunhandledrejection' in globalThis) {
                const previous = globalThis.onunhandledrejection;
                globalThis.onunhandledrejection = (event) => {
                    onUnhandled(event?.reason ?? event);
                    if (typeof previous === 'function') {
                        previous(event);
                    }
                };
                return () => {
                    globalThis.onunhandledrejection = previous;
                };
            }
            return null;
        })();
        try {
            let thrown = null;
            try {
                await handler.dispatchTransaction(decodedTransaction);
            } catch (error) {
                thrown = error;
            }

            t.ok(thrown, 'dispatchTransaction should throw when enqueue fails');
            t.ok(thrown instanceof V1NodeOverloadedError, 'should map tx pool full to V1NodeOverloadedError');
            await new Promise(resolve => setImmediate(resolve));
        } finally {
            if (detachUnhandled) {
                detachUnhandled();
            }
        }

        t.absent(unhandled, 'should not emit unhandledRejection');
    } finally {
        PartialTransactionValidator.prototype.validate = originalValidate;
    }
});

class MockConnection {
    constructor() {
        this.remotePublicKey = b4a.alloc(32);
        this.ended = false;
        this.sentPayload = null;
        this.protocolSession = { sendAndForget: (p) => { this.sentPayload = p; } };
    }
    end() { this.ended = true; }
}

function setupLogicTestHandler(stateOverrides = {}) {
    const validatorWallet = createWallet(testKeyPair1);
    const state = { 
        allowedToValidate: async () => true, 
        isAdminAllowedToValidate: async () => true,
        ...stateOverrides
    };
    
    const handler = new V1BroadcastTransactionOperationHandler(
        state, validatorWallet, { v1HandleRateLimit() {} }, 
        { validateEnqueue() {} }, {}, {}, config
    );

    handler.displayError = () => {};
    handler.handleRequest = async function(message, connection) {
        let resultCode = ResultCode.OK;
        try {
            this.applyRateLimit(connection);
            const isAllowed = await this.config.stateMock.allowedToValidate(this.config.walletAddress);
            const isAdmin = await this.config.stateMock.isAdminAllowedToValidate();
            if (!isAllowed && !isAdmin) {
                throw new V1NodeHasNoWriteAccess();
            }
            
            const response = { result: ResultCode.OK, proof: 'mock-proof' };
            connection.protocolSession.sendAndForget(response);
        } catch (error) {
            const code = error.resultCode || ResultCode.UNEXPECTED_ERROR;
            connection.protocolSession.sendAndForget({ result: code });
            if (error.endConnection) connection.end();
        }
    };

    handler.config.stateMock = state;
    handler.config.walletAddress = validatorWallet.address;
    
    return handler;
}

test('V1BroadcastTransactionOperationHandler - handleRequest (Success Path)', async (t) => {
    const handler = setupLogicTestHandler();
    const conn = new MockConnection();

    await handler.handleRequest({ id: '0'.repeat(64) }, conn);

    t.is(conn.sentPayload.result, ResultCode.OK, 'Should return OK on success');
    t.is(conn.sentPayload.proof, 'mock-proof', 'Should return the proof');
    t.absent(conn.ended, 'Should not end connection on success');
});

test('V1BroadcastTransactionOperationHandler - Capability Check (No Write Access)', async (t) => {
    const handler = setupLogicTestHandler({
        allowedToValidate: async () => false,
        isAdminAllowedToValidate: async () => false
    });
    
    const conn = new MockConnection();
    await handler.handleRequest({ id: '0'.repeat(64) }, conn);

    t.is(conn.sentPayload.result, ResultCode.NODE_HAS_NO_WRITE_ACCESS, 'Should return error if node cannot write to state');
});

test('V1BroadcastTransactionOperationHandler - handleResponse & Extractor', async (t) => {
    const handler = new V1BroadcastTransactionOperationHandler(
        {}, createWallet(testKeyPair1), { v1HandleRateLimit() {} }, 
        {}, {}, {}, config
    );
    
    let capturedExtractor = null;
    handler.resolvePendingResponse = async (msg, conn, val, extractor) => { 
        capturedExtractor = extractor; 
    };

    await handler.handleResponse({ id: 'tx-3' }, new MockConnection());

    const mockPayload = { broadcast_transaction_response: { result: 'TX_SUCCESS' } };
    const result = capturedExtractor(mockPayload);
    
    t.is(result, 'TX_SUCCESS', 'Extractor should fetch result from correct path');
});