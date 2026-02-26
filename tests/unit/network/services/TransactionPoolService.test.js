import { test } from 'brittle';
import b4a from 'b4a';
import remote from 'hypercore/lib/fully-remote-proof.js';
import sinon from 'sinon';

import TransactionPoolService, {
    TransactionPoolAlreadyQueuedError,
    TransactionPoolFullError,
    TransactionPoolInvalidIncomingDataError,
    TransactionPoolMissingCommitReceiptError,
    TransactionPoolProofUnavailableError
} from '../../../../src/core/network/services/TransactionPoolService.js';
import TransactionCommitService from '../../../../src/core/network/services/TransactionCommitService.js';
import nodeEntryUtils from '../../../../src/core/state/utils/nodeEntry.js';
import { safeDecodeApplyOperation } from '../../../../src/utils/protobuf/operationHelpers.js';
import { bigIntTo16ByteBuffer, decimalStringToBigInt } from '../../../../src/utils/amountSerialization.js';
import { BATCH_SIZE } from '../../../../src/utils/constants.js';
import { config } from '../../../helpers/config.js';
import {
    buildTransferPayload,
    setupTransferScenario
} from '../../state/apply/transfer/transferScenarioHelpers.js';


// TODO: base in the State.js is private, so I had to create an adapter fixture to expose the necessary methods for TransactionPoolService testing. Refactor State.js to allow better testability without needing this kind of workaround.
function createStateFixture(validatorPeer) {
    const base = validatorPeer.base;

    return {
        async isAdminAllowedToValidate() {
            return false;
        },
        async allowedToValidate(address) {
            if (!base.writable || base.isIndexer) return false;
            const entry = await base.view.get(address);
            const decoded = entry?.value ? nodeEntryUtils.decode(entry.value) : null;
            return !!(decoded?.isWriter && !decoded?.isIndexer);
        },
        async appendWithProofOfPublication(batch, batchTxHashes) {
            const end = await base.append(batch);
            await base.update();
            const start = end - batch.length;
            const appendedAt = Date.now();
            const snapshot = base.local.snapshot();
            await snapshot.ready();

            try {
                const receipts = [];
                for (let i = 0; i < batch.length; i++) {
                    const blockNumber = start + i;
                    const txHash = batchTxHashes[i];
                    const completeTx = batch[i];
                    const rawBlock = await snapshot.get(blockNumber, { raw: true, wait: false });

                    let proof = null;
                    let proofError = null;

                    if (!rawBlock) {
                        proofError = `Missing raw block after append (block=${blockNumber})`;
                    } else {
                        try {
                            proof = await remote.proof(snapshot, { index: blockNumber, block: rawBlock });
                        } catch (error) {
                            proofError = error?.message ?? 'Proof generation failed';
                        }
                    }

                    receipts.push({
                        txHash,
                        completeTx,
                        proof,
                        proofError,
                        appendedAt,
                        blockNumber
                    });
                }

                return receipts;
            } finally {
                await snapshot.close();
            }
        }
    };
}

test('TransactionPoolService processes queued transaction and resolves commit with proof', async t => {
    const context = await setupTransferScenario(t, { nodes: 4 });
    const validatorPeer = context.transferScenario.validatorPeer;
    const encodedTx = await buildTransferPayload(context);
    const decoded = safeDecodeApplyOperation(encodedTx);
    const txHash = decoded?.tro?.tx?.toString('hex');

    t.ok(txHash, 'tx hash extracted from transfer payload');
    if (!txHash) return;

    const txCommitService = new TransactionCommitService(config);
    const stateAddapter = createStateFixture(validatorPeer);
    const poolService = new TransactionPoolService(
        stateAddapter,
        validatorPeer.wallet.address,
        txCommitService,
        config
    );

    try {
        await poolService.start();

        const pendingCommit = txCommitService.registerPendingCommit(txHash);
        pendingCommit.catch(() => {});
        poolService.addTransaction(txHash, encodedTx);

        const receipt = await pendingCommit;
        t.ok(receipt, 'pending commit resolves');
        t.is(receipt.txHash, txHash, 'receipt txHash matches queued tx');
        t.ok(b4a.isBuffer(receipt.proof), 'receipt contains proof buffer');
        t.ok(receipt.proof.length > 0, 'proof is non-empty');
        t.ok(Number.isSafeInteger(receipt.blockNumber), 'blockNumber is safe integer');
        t.ok(receipt.blockNumber >= 0, 'blockNumber is non-negative');
    } finally {
        await poolService.stopPool();
        txCommitService.close();
    }
});

test('TransactionPoolService processes batch of 10 queued transactions and resolves 10 receipts', async t => {
    const context = await setupTransferScenario(t, {
        nodes: 4,
        senderInitialBalance: bigIntTo16ByteBuffer(decimalStringToBigInt('100'))
    });
    const validatorPeer = context.transferScenario.validatorPeer;
    const txCommitService = new TransactionCommitService(config);
    const stateAddapter = createStateFixture(validatorPeer);
    const poolService = new TransactionPoolService(
        stateAddapter,
        validatorPeer.wallet.address,
        txCommitService,
        config
    );

    try {
        await poolService.start();

        const txHashes = [];
        const pendingCommits = [];
        const txCount = 10;

        for (let i = 0; i < txCount; i++) {
            const encodedTx = await buildTransferPayload(context);
            const decoded = safeDecodeApplyOperation(encodedTx);
            const txHash = decoded?.tro?.tx?.toString('hex');

            t.ok(txHash, `tx hash extracted for tx ${i + 1}`);
            if (!txHash) continue;

            txHashes.push(txHash);
            const pendingCommit = txCommitService.registerPendingCommit(txHash);
            pendingCommit.catch(() => {});
            pendingCommits.push(pendingCommit);
            poolService.addTransaction(txHash, encodedTx);
        }

        const receipts = await Promise.all(pendingCommits);
        t.is(receipts.length, txCount, '10 pending commits resolved');

        const receiptsByHash = new Map(receipts.map(receipt => [receipt.txHash, receipt]));
        for (const txHash of txHashes) {
            const receipt = receiptsByHash.get(txHash);
            t.ok(receipt, `receipt exists for tx ${txHash}`);
            t.ok(b4a.isBuffer(receipt.proof), `proof is buffer for tx ${txHash}`);
            t.ok(receipt.proof.length > 0, `proof is non-empty for tx ${txHash}`);
        }
    } finally {
        await poolService.stopPool();
        txCommitService.close();
    }
});

test('TransactionPoolService.addTransaction enforces pool size limit via validateEnqueue', t => {
    const service = new TransactionPoolService({}, 'test', {}, { txPoolSize: 1 });

    service.addTransaction('tx-1', b4a.from('aa', 'hex'));
    t.exception(
        () => service.addTransaction('tx-2', b4a.from('bb', 'hex')),
        TransactionPoolFullError
    );
    t.is(service.tx_pool.size(), 1);
});

test('TransactionPoolService.addTransaction rejects invalid incoming payload', t => {
    const service = new TransactionPoolService({}, 'test', {}, { txPoolSize: 10 });

    t.exception(
        () => service.addTransaction('', b4a.from('aa', 'hex')),
        TransactionPoolInvalidIncomingDataError
    );
    t.exception(
        () => service.addTransaction('tx-1', 'not-a-buffer'),
        TransactionPoolInvalidIncomingDataError
    );
});

test('TransactionPoolService.addTransaction rejects duplicate txHash', t => {
    const service = new TransactionPoolService({}, 'validator-address', {}, { txPoolSize: 10 });
    service.addTransaction('tx-dup', b4a.from('aa', 'hex'));

    t.exception(
        () => service.addTransaction('tx-dup', b4a.from('bb', 'hex')),
        TransactionPoolAlreadyQueuedError
    );
    t.is(service.tx_pool.size(), 1);
});

test('TransactionPoolService rejects pending commit when proof is unavailable', async t => {
    const txHash = 'a'.repeat(64);
    const txCommitService = new TransactionCommitService({ txCommitTimeout: 1_000 });
    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return false; },
            async allowedToValidate() { return true; },
            async appendWithProofOfPublication(_batch, hashes) {
                return [{
                    txHash: hashes[0],
                    proof: null,
                    blockNumber: 123,
                    proofError: 'proof-missing',
                    appendedAt: new Date(1234)
                }];
            }
        },
        'validator-address',
        txCommitService,
        { enableWallet: true, txPoolSize: 10 }
    );

    try {
        await service.start();
        const pendingCommit = txCommitService.registerPendingCommit(txHash);
        pendingCommit.catch(() => {});
        service.addTransaction(txHash, b4a.from('aa', 'hex'));

        try {
            await pendingCommit;
            t.fail('expected pending commit to reject');
        } catch (error) {
            t.ok(error instanceof TransactionPoolProofUnavailableError);
            t.is(error.txHash, txHash);
            t.is(error.blockNumber, 123);
            t.is(error.appendedAt, 1234);
            t.is(error.reason, 'proof-missing');
        }
    } finally {
        await service.stopPool();
        txCommitService.close();
    }
});

test('TransactionPoolService rejects pending commit when commit receipt is missing', async t => {
    const txHash = 'b'.repeat(64);
    const txCommitService = new TransactionCommitService({ txCommitTimeout: 1_000 });
    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return true; },
            async allowedToValidate() { return false; },
            async appendWithProofOfPublication() {
                return [{ txHash: 'c'.repeat(64), proof: b4a.from('aa', 'hex') }];
            }
        },
        'validator-address',
        txCommitService,
        { enableWallet: true, txPoolSize: 10 }
    );

    try {
        await service.start();
        const pendingCommit = txCommitService.registerPendingCommit(txHash);
        pendingCommit.catch(() => {});
        service.addTransaction(txHash, b4a.from('aa', 'hex'));

        try {
            await pendingCommit;
            t.fail('expected pending commit to reject');
        } catch (error) {
            t.ok(error instanceof TransactionPoolMissingCommitReceiptError);
            t.is(error.txHash, txHash);
        }
    } finally {
        await service.stopPool();
        txCommitService.close();
    }
});

test('TransactionPoolService rejects all pending commits when appendWithProofOfPublication throws', async t => {
    const txHashA = 'd'.repeat(64);
    const txHashB = 'e'.repeat(64);
    const appendError = new Error('append failed');
    const txCommitService = new TransactionCommitService({ txCommitTimeout: 1_000 });
    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return false; },
            async allowedToValidate() { return true; },
            async appendWithProofOfPublication() {
                throw appendError;
            }
        },
        'validator-address',
        txCommitService,
        { enableWallet: true, txPoolSize: 10 }
    );

    try {
        await service.start();
        const pendingA = txCommitService.registerPendingCommit(txHashA);
        const pendingB = txCommitService.registerPendingCommit(txHashB);
        pendingA.catch(() => {});
        pendingB.catch(() => {});

        service.addTransaction(txHashA, b4a.from('aa', 'hex'));
        service.addTransaction(txHashB, b4a.from('bb', 'hex'));

        const results = await Promise.allSettled([pendingA, pendingB]);
        t.is(results[0].status, 'rejected');
        t.is(results[1].status, 'rejected');
        t.is(results[0].reason, appendError);
        t.is(results[1].reason, appendError);
    } finally {
        await service.stopPool();
        txCommitService.close();
    }
});

test('TransactionPoolProofUnavailableError normalizes appendedAt values', t => {
    const txHash = 'f'.repeat(64);
    const fromDate = new TransactionPoolProofUnavailableError(txHash, 1, 'no-proof', new Date(5000));
    const fromInvalid = new TransactionPoolProofUnavailableError(txHash, 2, 'no-proof', 'invalid');

    t.is(fromDate.appendedAt, 5000);
    t.is(fromInvalid.appendedAt, 0);
});

test('TransactionPoolService.start is idempotent when scheduler is already running', async t => {
    const logs = [];
    const originalInfo = console.info;
    console.info = (...args) => logs.push(args.join(' '));

    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return false; },
            async allowedToValidate() { return false; },
            async appendWithProofOfPublication() { return []; }
        },
        'validator-address',
        {
            resolvePendingCommit() { return false; },
            rejectPendingCommit() { return false; }
        },
        { enableWallet: true, txPoolSize: 10 }
    );

    try {
        await service.start();
        await service.start();

        t.ok(
            logs.some(message => message.includes('TransactionPoolService is already started')),
            'second start logs already started'
        );
    } finally {
        console.info = originalInfo;
        await service.stopPool();
    }
});

test('TransactionPoolService schedules immediate follow-up run when queue remains after batch', async t => {
    const clock = sinon.useFakeTimers({ now: 0 });
    const txCount = BATCH_SIZE + 1;
    let appendCalls = 0;

    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return true; },
            async allowedToValidate() { return true; },
            async appendWithProofOfPublication(_encodedBatch, txHashes) {
                appendCalls++;
                return txHashes.map((txHash, index) => ({
                    txHash,
                    proof: b4a.from('aa', 'hex'),
                    blockNumber: index,
                    appendedAt: Date.now()
                }));
            }
        },
        'validator-address',
        {
            resolvePendingCommit() { return true; },
            rejectPendingCommit() { return true; }
        },
        { enableWallet: true, txPoolSize: 100 }
    );

    try {
        for (let i = 0; i < txCount; i++) {
            service.addTransaction(`tx-${i}`, b4a.from('aa', 'hex'));
        }

        await service.start();
        for (let i = 0; i < 5 && appendCalls < 2; i++) {
            await clock.tickAsync(1);
        }

        t.ok(appendCalls >= 2, 'queue processed in at least two batches before 50ms interval');
    } finally {
        await service.stopPool();
        clock.restore();
        sinon.restore();
    }
});

test('TransactionPoolService wraps worker errors from validation permission checks', async t => {
    const clock = sinon.useFakeTimers({ now: 0 });
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);

    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() {
                throw new Error('permission boom');
            },
            async allowedToValidate() { return false; },
            async appendWithProofOfPublication() { return []; }
        },
        'validator-address',
        {
            resolvePendingCommit() { return false; },
            rejectPendingCommit() { return false; }
        },
        { enableWallet: true, txPoolSize: 10 }
    );

    try {
        await service.start();
        await clock.tickAsync(0);

        const workerError = errors
            .map((entry) => entry[1])
            .find((value) => value instanceof Error && value.message.includes('TransactionPoolService worker error: permission boom'));

        t.ok(workerError, 'worker error is wrapped with TransactionPoolService context');
    } finally {
        console.error = originalError;
        await service.stopPool();
        clock.restore();
        sinon.restore();
    }
});

test('TransactionPoolService.start does nothing when wallet is disabled', async t => {
    const logs = [];
    const originalInfo = console.info;
    console.info = (...args) => logs.push(args.join(' '));

    const service = new TransactionPoolService(
        {
            async isAdminAllowedToValidate() { return true; },
            async allowedToValidate() { return true; },
            async appendWithProofOfPublication() { return []; }
        },
        'validator-address',
        {
            resolvePendingCommit() { return false; },
            rejectPendingCommit() { return false; }
        },
        { enableWallet: false, txPoolSize: 10 }
    );

    try {
        await service.start();
        t.ok(
            logs.some(message => message.includes('Wallet is not enabled')),
            'start logs wallet disabled'
        );
    } finally {
        console.info = originalInfo;
        await service.stopPool();
    }
});
