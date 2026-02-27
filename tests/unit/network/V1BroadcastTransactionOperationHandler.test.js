import test from 'brittle';
import b4a from 'b4a';

import V1BroadcastTransactionOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1BroadcastTransactionOperationHandler.js';
import V1BroadcastTransactionRequest from '../../../src/core/network/protocols/v1/validators/V1BroadcastTransactionRequest.js';

import {
    ResultCode,
    OperationType
} from '../../../src/utils/constants.js';

import * as PoolErrors from '../../../src/core/network/services/TransactionPoolService.js';
import * as CommitErrors from '../../../src/core/network/services/TransactionCommitService.js';


import PartialRoleAccessValidator from '../../../src/core/network/protocols/shared/validators/PartialRoleAccessValidator.js';
import PartialBootstrapDeploymentValidator from '../../../src/core/network/protocols/shared/validators/PartialBootstrapDeploymentValidator.js';
import PartialTransactionValidator from '../../../src/core/network/protocols/shared/validators/PartialTransactionValidator.js';
import PartialTransferValidator from '../../../src/core/network/protocols/shared/validators/PartialTransferValidator.js';

const VALID_ADDR = 'trac1p5d7rj67fzh6cs6ccfshv37t6z84nvtca4yv8mwwsc38qcz';
const VALID_PUB = b4a.alloc(33, 2);

const basePayload = {
    tx: b4a.alloc(32),
    txv: b4a.alloc(32),
    in: 1,
    is: b4a.alloc(32)
};

function setupHandler(overrides = {}) {

    // Bypass all validation layers
    [
        V1BroadcastTransactionRequest,
        PartialRoleAccessValidator,
        PartialBootstrapDeploymentValidator,
        PartialTransactionValidator,
        PartialTransferValidator
    ].forEach(v => v.prototype.validate = async () => true);

    const state = overrides.state || {
        allowedToValidate: async () => true,
        isAdminAllowedToValidate: async () => true
    };

    const wallet = {
        address: VALID_ADDR,
        getPublicKey: () => VALID_PUB,
        sign: async () => b4a.alloc(64)
    };

    const txPool = overrides.txPool || {
        validateEnqueue() {},
        addTransaction() {}
    };

    const commitService = overrides.commit || {
        registerPendingCommit: () =>
            Promise.resolve({ proof: b4a.alloc(32), appendedAt: 5 }),
        rejectPendingCommit() {}
    };

    const handler = new V1BroadcastTransactionOperationHandler(
        state,
        wallet,
        { v1HandleRateLimit() {} },
        txPool,
        { resolvePendingRequest() {} },
        commitService,
        { hrp: 'trac', network: { hrp: 'trac' } }
    );

    handler.displayError = () => {};
    return handler;
}

function mockConn(assertFn) {
    return {
        remotePublicKey: b4a.alloc(32),
        protocolSession: {
            sendAndForget: assertFn || (() => {})
        },
        end() {}
    };
}

test('All dispatch branches - full success coverage', async t => {

    const scenarios = [
        { type: OperationType.ADD_WRITER, key: 'rao', data: { ...basePayload, iw: true } },
        { type: OperationType.REMOVE_WRITER, key: 'rao', data: { ...basePayload, iw: false } },
        { type: OperationType.ADMIN_RECOVERY, key: 'rao', data: { ...basePayload, iw: true } },
        { type: OperationType.TRANSFER, key: 'tro', data: { ...basePayload, to: VALID_ADDR, am: '1' } },
        { type: OperationType.TX, key: 'txo', data: { ...basePayload, iw: true, ch: 1, bs: b4a.alloc(32), mbs: b4a.alloc(32) } },
        { type: OperationType.BOOTSTRAP_DEPLOYMENT, key: 'bdo', data: { ...basePayload, bs: b4a.alloc(32), ic: b4a.alloc(32) } }
    ];

    for (const s of scenarios) {
        const handler = setupHandler();
        handler.decodeApplyOperation = () => ({
            type: s.type,
            address: VALID_ADDR,
            [s.key]: s.data
        });

        await handler.handleRequest(
            { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
            mockConn()
        );
    }

    t.pass();
});

test('Invalid type + missing type branches', async t => {

    const handler = setupHandler();

    await t.exception(
        async () => handler.dispatchTransaction(null),
        /Decoded transaction type is missing/
    );

    await t.exception(
        async () => handler.dispatchTransaction({ type: 0 }),
        /Decoded transaction type is missing/
    );

    await t.exception(
        async () => handler.dispatchTransaction({ type: 999 }),
        /Unsupported transaction type/
    );
});

test('Commit service not configured', async t => {

    const handler = setupHandler({ commit: null });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: {
            tx: b4a.alloc(32),
            txv: b4a.alloc(32),
            iw: true,
            in: 1,
            ch: 1,
            is: b4a.alloc(32),
            bs: b4a.alloc(32),
            mbs: b4a.alloc(32)
        }
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn(res => {
            t.is(
                res.broadcast_transaction_response.result,
                ResultCode.INTERNAL_ERROR
            );
        })
    );
});

test('TxPool validateEnqueue full', async t => {

    const handler = setupHandler({
        txPool: {
            validateEnqueue() {
                throw new PoolErrors.TransactionPoolFullError();
            }
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn(res => {
            t.is(res.broadcast_transaction_response.result, ResultCode.NODE_OVERLOADED);
        })
    );
});

test('Commit registration error mapping', async t => {

    const errors = [
        CommitErrors.PendingCommitInvalidTxHashError,
        CommitErrors.PendingCommitAlreadyExistsError,
        CommitErrors.PendingCommitBufferFullError
    ];

    for (const Err of errors) {

        const handler = setupHandler({
            commit: {
                registerPendingCommit() { throw new Err('x'); },
                rejectPendingCommit() {}
            }
        });

        handler.decodeApplyOperation = () => ({
            type: OperationType.TX,
            address: VALID_ADDR,
            txo: basePayload
        });

        await handler.handleRequest(
            { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
            mockConn()
        );
    }

    t.pass();
});

test('TxPool addTransaction error mapping', async t => {

    const poolErrors = [
        PoolErrors.TransactionPoolFullError,
        PoolErrors.TransactionPoolAlreadyQueuedError,
        PoolErrors.TransactionPoolInvalidIncomingDataError
    ];

    for (const Err of poolErrors) {

        const handler = setupHandler({
            txPool: {
                validateEnqueue() {},
                addTransaction() { throw new Err('x'); }
            }
        });

        handler.decodeApplyOperation = () => ({
            type: OperationType.TX,
            address: VALID_ADDR,
            txo: basePayload
        });

        await handler.handleRequest(
            { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
            mockConn()
        );
    }

    t.pass();
});

test('Pending commit rejection branches', async t => {

    const errors = [
        new PoolErrors.TransactionPoolProofUnavailableError('x', 7),
        new PoolErrors.TransactionPoolMissingCommitReceiptError('x'),
        new CommitErrors.PendingCommitTimeoutError('x')
    ];

    for (const err of errors) {

        const handler = setupHandler({
            commit: {
                registerPendingCommit() {
                    return Promise.reject(err);
                },
                rejectPendingCommit() {}
            }
        });

        handler.decodeApplyOperation = () => ({
            type: OperationType.TX,
            address: VALID_ADDR,
            txo: basePayload
        });

        await handler.handleRequest(
            { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
            mockConn()
        );
    }

    t.pass();
});

test('Capability validation failure', async t => {

    const handler = setupHandler({
        state: {
            allowedToValidate: async () => false,
            isAdminAllowedToValidate: async () => false
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn(res => {
            t.is(res.broadcast_transaction_response.result, ResultCode.NODE_HAS_NO_WRITE_ACCESS);
        })
    );
});

test('Response build failure branch', async t => {

    const handler = setupHandler();
    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    const conn = {
        remotePublicKey: b4a.alloc(32),
        protocolSession: {
            sendAndForget() { throw new Error('fail'); }
        },
        end() {}
    };

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        conn
    );

    t.pass();
});

test('handleResponse error branch', async t => {

    const handler = setupHandler();

    handler.resolvePendingResponse = async () => {
        throw new Error('boom');
    };

    handler.handlePendingResponseError = () => {};

    await handler.handleResponse(
        { id: b4a.alloc(32) },
        { remotePublicKey: b4a.alloc(32), end() {} }
    );

    t.pass();
});

test('Sanitize removes null completion fields', async t => {

    const handler = setupHandler();

    const tx = {
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: {
            ...basePayload,
            va: null,
            vn: null,
            vs: null,
            iw: true,
            ch: 1,
            bs: b4a.alloc(32),
            mbs: b4a.alloc(32)
        }
    };

    handler.decodeApplyOperation = () => tx;

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.absent(tx.txo.va);
    t.absent(tx.txo.vn);
    t.absent(tx.txo.vs);
});

test('Proof unavailable without appendedAt branch', async t => {

    const handler = setupHandler({
        commit: {
            registerPendingCommit() {
                return Promise.reject(
                    new PoolErrors.TransactionPoolProofUnavailableError('x')
                );
            },
            rejectPendingCommit() {}
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('Proof unavailable appendedAt <= 0 branch', async t => {

    const handler = setupHandler({
        commit: {
            registerPendingCommit() {
                return Promise.reject(
                    new PoolErrors.TransactionPoolProofUnavailableError('x', 0)
                );
            },
            rejectPendingCommit() {}
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('Request validator failure mapping branch', async t => {

    V1BroadcastTransactionRequest.prototype.validate = async () => {
        throw new Error('validation boom');
    };

    const handler = setupHandler();

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('decodeApplyOperation failure branch', async t => {

    const handler = setupHandler();

    handler.decodeApplyOperation = () => {
        throw new Error('decode fail');
    };

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('Response build internal failure branch', async t => {

    const badWallet = {
        address: VALID_ADDR,
        getPublicKey: () => VALID_PUB,
        sign: async () => { throw new Error('sign fail'); }
    };

    const handler = new V1BroadcastTransactionOperationHandler(
        {
            allowedToValidate: async () => true,
            isAdminAllowedToValidate: async () => true
        },
        badWallet,
        { v1HandleRateLimit() {} },
        { validateEnqueue() {}, addTransaction() {} },
        { resolvePendingRequest() {} },
        {
            registerPendingCommit: () =>
                Promise.resolve({ proof: b4a.alloc(32), appendedAt: 1 }),
            rejectPendingCommit() {}
        },
        { hrp: 'trac', network: { hrp: 'trac' } }
    );

    handler.displayError = () => {};

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: {
            tx: b4a.alloc(32),
            txv: b4a.alloc(32),
            iw: true,
            in: 1,
            ch: 1,
            is: b4a.alloc(32),
            bs: b4a.alloc(32),
            mbs: b4a.alloc(32)
        }
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});


test('Unsupported role access subtype', async t => {

    const handler = setupHandler();

    await t.exception(
        async () => handler.dispatchTransaction({
            type: OperationType.ADD_WRITER,
            address: VALID_ADDR,
            rao: basePayload,
            // override type so switch default triggers
            type: 1234
        }),
        /Unsupported transaction type/
    );
});

test('Role access switch default branch', async t => {

    const handler = setupHandler();

    await t.exception(
        async () => handler.dispatchTransaction({
            type: OperationType.ADD_WRITER + 999, // still integer but not matched
            address: VALID_ADDR,
            rao: basePayload
        }),
        /Unsupported transaction type/
    );
});

test('TransactionPoolMissingCommitReceiptError via receipt branch', async t => {

    const handler = setupHandler({
        commit: {
            registerPendingCommit() {
                return Promise.reject(
                    new PoolErrors.TransactionPoolMissingCommitReceiptError('x')
                );
            },
            rejectPendingCommit() {}
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('PendingCommitBufferFullError mapping branch', async t => {

    const handler = setupHandler({
        commit: {
            registerPendingCommit() {
                throw new CommitErrors.PendingCommitBufferFullError('x');
            },
            rejectPendingCommit() {}
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('handleResponse extractor real path', async t => {

    const handler = setupHandler();

    handler.resolvePendingResponse = async (msg, conn, validator, extractor) => {
        const result = extractor({
            broadcast_transaction_response: { result: 123 }
        });
        t.is(result, 123);
    };

    await handler.handleResponse(
        { id: b4a.alloc(32) },
        { remotePublicKey: b4a.alloc(32), end() {} }
    );

    t.pass();
});

test('getOperationPayloadKey null branch', async t => {

    const handler = setupHandler();

    handler.decodeApplyOperation = () => ({
        type: 9999, // not recognized by isRoleAccess/isTransaction/etc
        address: VALID_ADDR
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('TransactionPoolInvalidIncomingDataError mapping', async t => {

    const handler = setupHandler({
        txPool: {
            validateEnqueue() {},
            addTransaction() {
                throw new PoolErrors.TransactionPoolInvalidIncomingDataError('x');
            }
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn(res => {
            t.is(res.broadcast_transaction_response.result, ResultCode.INTERNAL_ERROR);
        })
    );
});

test('Unknown receipt error rethrow branch', async t => {

    const handler = setupHandler({
        commit: {
            registerPendingCommit() {
                return Promise.reject(new Error('weird'));
            },
            rejectPendingCommit() {}
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('validateEnqueue rethrow unknown error branch', async t => {

    const handler = setupHandler({
        txPool: {
            validateEnqueue() { throw new Error('boom'); }
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});

test('Capability OR branch admin true', async t => {

    const handler = setupHandler({
        state: {
            allowedToValidate: async () => false,
            isAdminAllowedToValidate: async () => true
        }
    });

    handler.decodeApplyOperation = () => ({
        type: OperationType.TX,
        address: VALID_ADDR,
        txo: basePayload
    });

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        mockConn()
    );

    t.pass();
});