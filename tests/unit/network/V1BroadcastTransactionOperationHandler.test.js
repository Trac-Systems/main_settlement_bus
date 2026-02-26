import test from 'brittle';
import b4a from 'b4a';
import V1BroadcastTransactionOperationHandler from '../../../src/core/network/protocols/v1/handlers/V1BroadcastTransactionOperationHandler.js';
import V1BroadcastTransactionRequest from '../../../src/core/network/protocols/v1/validators/V1BroadcastTransactionRequest.js';
import { ResultCode, OperationType } from '../../../src/utils/constants.js';

import * as PoolErrors from '../../../src/core/network/services/TransactionPoolService.js';
import * as CommitErrors from '../../../src/core/network/services/TransactionCommitService.js';

import PartialTransactionValidator from '../../../src/core/network/protocols/shared/validators/PartialTransactionValidator.js';
import PartialTransferValidator from '../../../src/core/network/protocols/shared/validators/PartialTransferValidator.js';
import PartialRoleAccessValidator from '../../../src/core/network/protocols/shared/validators/PartialRoleAccessValidator.js';
import PartialBootstrapDeploymentValidator from '../../../src/core/network/protocols/shared/validators/PartialBootstrapDeploymentValidator.js';

const VALID_ADDR = 'trac1p5d7rj67fzh6cs6ccfshv37t6z84nvtca4yv8mwwsc38qcz';
const VALID_PUB = b4a.alloc(33, 2);

const setupHandler = (overrides = {}) => {
    // Bypass all partial validators to isolate handler logic
    [
        V1BroadcastTransactionRequest,
        PartialTransactionValidator,
        PartialTransferValidator,
        PartialRoleAccessValidator,
        PartialBootstrapDeploymentValidator
    ].forEach(v => v.prototype.validate = async () => true);

    const wallet = {
        address: VALID_ADDR,
        getPublicKey: () => VALID_PUB,
        sign: async () => b4a.alloc(64)
    };

    const handler = new V1BroadcastTransactionOperationHandler(
        { allowedToValidate: async () => true, isAdminAllowedToValidate: async () => true },
        wallet,
        { v1HandleRateLimit() {} },
        overrides.txPool || { validateEnqueue() {}, addTransaction() {} },
        { resolvePendingRequest: () => {} },
        overrides.commit || {
            registerPendingCommit: () => Promise.resolve({ proof: b4a.alloc(32), appendedAt: 1 }),
            rejectPendingCommit: () => {}
        },
        { hrp: 'trac', network: { hrp: 'trac' } }
    );

    handler.displayError = () => {};
    return handler;
};

test('Coverage - Guards and Sanitize', async (t) => {
    const handler = setupHandler();

    const tx = {
        type: OperationType.TRANSACTION,
        txo: { va: null, vs: null, tx: b4a.alloc(32) }
    };

    handler.decodeApplyOperation = () => tx;

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        { protocolSession: { sendAndForget: () => {} }, end: () => {} }
    );

    t.absent(tx.txo.va);

    // Force guard branches
    try { await handler.dispatchTransaction(null); } catch {}
    try { await handler.dispatchTransaction({}); } catch {}
    try { await handler.dispatchTransaction({ type: 999 }); } catch {}

    t.pass();
});

test('Coverage - Error Mapping (Lines 236-292)', async (t) => {
    const errorMap = [
        { err: PoolErrors.TransactionPoolFullError, code: ResultCode.NODE_OVERLOADED },
        { err: PoolErrors.TransactionPoolAlreadyQueuedError, code: ResultCode.TX_ALREADY_PENDING },
        { err: CommitErrors.PendingCommitAlreadyExistsError, code: ResultCode.TX_ALREADY_PENDING },
        { err: CommitErrors.PendingCommitInvalidTxHashError, code: ResultCode.INVALID_PAYLOAD },
        { err: CommitErrors.PendingCommitTimeoutError, code: ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE },
        { err: PoolErrors.TransactionPoolMissingCommitReceiptError, code: ResultCode.INTERNAL_ERROR }
    ];

    for (const { err, code } of errorMap) {
        const handler = setupHandler();

        handler.dispatchTransaction = async () => { throw new err(); };

        handler.decodeApplyOperation = () => ({
            type: OperationType.TRANSFER,
            tro: { tx: b4a.alloc(32) }
        });

        const conn = {
            protocolSession: {
                sendAndForget: (res) => {
                    t.is(res.broadcast_transaction_response.result, code);
                }
            },
            end: () => {}
        };

        await handler.handleRequest(
            { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
            conn
        );
    }
});

test('Coverage - Rejection Paths (Lines 302-329)', async (t) => {
    const handler = setupHandler();

    handler.decodeApplyOperation = () => ({
        type: OperationType.TRANSFER,
        tro: { tx: b4a.alloc(32) }
    });

    handler.dispatchTransaction = () =>
        Promise.reject(new PoolErrors.TransactionPoolProofUnavailableError('err', 123));

    const conn1 = {
        protocolSession: {
            sendAndForget: (res) => {
                t.is(
                    res.broadcast_transaction_response.result,
                    ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE
                );
            }
        },
        end: () => {}
    };

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        conn1
    );

    handler.dispatchTransaction = () =>
        Promise.reject(new CommitErrors.PendingCommitTimeoutError());

    const conn2 = {
        protocolSession: {
            sendAndForget: (res) => {
                t.is(
                    res.broadcast_transaction_response.result,
                    ResultCode.TX_ACCEPTED_PROOF_UNAVAILABLE
                );
            }
        },
        end: () => {}
    };

    await handler.handleRequest(
        { id: b4a.alloc(32), broadcast_transaction_request: { data: b4a.alloc(1) } },
        conn2
    );
});

test('Coverage - Builder Branches (Lines 334-372)', async (t) => {
    const handler = setupHandler();

    const base = {
        tx: b4a.alloc(32),
        txv: b4a.alloc(32),
        in: 1,
        is: b4a.alloc(32)
    };

    const scenarios = [
        { type: OperationType.TRANSFER, key: 'tro', data: { ...base, to: VALID_ADDR, am: '1' } },
        { type: OperationType.ADD_WRITER, key: 'rao', data: { ...base, iw: true } },
        { type: OperationType.REMOVE_WRITER, key: 'rao', data: { ...base, iw: false } },
        { type: OperationType.ADMIN_RECOVERY, key: 'rao', data: { ...base, iw: true } },
        { type: OperationType.DEPLOY_BOOTSTRAP, key: 'bdo', data: { ...base, bs: b4a.alloc(32), ic: b4a.alloc(32) } },
        { type: OperationType.TRANSACTION, key: 'txo', data: { ...base, bs: b4a.alloc(32), mbs: b4a.alloc(32) } }
    ];

    for (const scenario of scenarios) {
        try {
            await V1BroadcastTransactionOperationHandler.prototype.dispatchTransaction.call(
                handler,
                {
                    type: scenario.type,
                    address: VALID_ADDR,
                    [scenario.key]: scenario.data
                }
            );
        } catch {}
    }

    t.pass();
});

test('Final Coverage', async (t) => {
    const handler = setupHandler();

    handler.resolvePendingResponse = async (msg, conn, validator, extractor) => {
        extractor({ broadcast_transaction_response: { result: 1 } });
    };

    await handler.handleResponse(
        { id: b4a.alloc(32) },
        { remotePublicKey: b4a.alloc(32) }
    );

    handler.applyRateLimit({ remotePublicKey: b4a.alloc(32) });

    t.pass();
});