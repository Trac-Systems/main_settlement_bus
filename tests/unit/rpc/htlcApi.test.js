import test from 'brittle';
import b4a from 'b4a';
import sinon from 'sinon';
import tracCryptoApi from 'trac-crypto-api';
import { addressToBuffer } from '../../../src/core/state/utils/address.js';
import * as escrowEntryUtils from '../../../src/core/state/utils/escrowEntry.js';
import { safeEncodeEscrowEntry } from '../../../src/codecs/state/escrowEntryCodec.js';
import { bigIntTo16ByteBuffer } from '../../../src/utils/amountSerialization.js';
import { uint64ToBuffer } from '../../../src/utils/buffer.js';
import { EntryType, OperationType } from '../../../src/utils/constants.js';

const lockId = 'ab'.repeat(32);
const txHash = 'cd'.repeat(32);
const address = tracCryptoApi.address.encode('trac', b4a.alloc(32, 1));

if (typeof globalThis.Bare !== 'undefined') {
    test('HTLC API unit tests use Node module mocks', t => t.pass('Node-only'));
} else {
    async function createApi(t) {
        const { default: esmock } = await import('esmock');
        let state;
        class CorestoreMock {
            close() { return Promise.resolve(); }
        }
        class StateMock {
            constructor() {
                this.getAdminEntry = sinon.stub().resolves(null);
                this.getSigned = sinon.stub().resolves(null);
                this.get = sinon.stub().resolves(null);
                this.waitForUnsigned = sinon.stub().resolves(true);
                this.getSignedLength = sinon.stub().returns(2);
                this.getUnsignedLength = sinon.stub().returns(3);
                state = this;
            }
            ready() { return Promise.resolve(); }
            close() { return Promise.resolve(); }
            isWritable() { return false; }
            isIndexer() { return false; }
        }
        class NetworkMock {
            ready() { return Promise.resolve(); }
            close() { return Promise.resolve(); }
        }
        const { MainSettlementBus } = await esmock('../../../src/index.js', {
            corestore: CorestoreMock,
            '../../../src/core/state/State.js': StateMock,
            '../../../src/core/network/Network.js': NetworkMock,
            '../../../src/utils/helpers.js': {
                sleep: async () => {},
                isHexString: value => typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0,
            },
        });
        const config = {
            storesFullPath: '/tmp/msb-htlc-rpc-api-test',
            addressPrefix: 'trac',
            networkId: 1,
            enableWallet: false,
            enableRoleRequester: false,
            messageValidatorResponseTimeout: 100,
        };
        const consoleLog = sinon.stub(console, 'log');
        t.teardown(() => consoleLog.restore());
        const msb = new MainSettlementBus(config);
        await msb.ready();
        t.teardown(() => msb.close());
        return { msb, state, config };
    }

    test('MainSettlementBus reads signed and unsigned HTLC escrow with JSON-safe fields', async t => {
        const { msb, state, config } = await createApi(t);
        const addressBytes = addressToBuffer(address, config.addressPrefix);
        const encoded = escrowEntryUtils.init({
            lockId: b4a.from(lockId, 'hex'),
            lockerAddress: addressBytes,
            claimRecipientAddress: addressBytes,
            refundRecipientAddress: addressBytes,
            amount: bigIntTo16ByteBuffer(42n),
            additionalFeeAmount: bigIntTo16ByteBuffer(0n),
            hashLock: b4a.alloc(32, 3),
            refundEpoch: uint64ToBuffer(7n),
        }, config.addressPrefix);
        state.getSigned.resolves(encoded);
        state.get.resolves(encoded);

        const signed = await msb.getHtlc(lockId.toUpperCase());
        t.is(signed.lockId, lockId);
        t.is(signed.status, 'PENDING');
        t.is(signed.lockerAddress, address);
        t.is(signed.amount, '42');
        t.is(signed.refundEpoch, '7');
        t.is(signed.additionalFeeAmount, '0');
        t.is(signed.additionalFeeRecipientAddress, null);
        t.is(signed.preimage, null);
        t.ok(state.getSigned.calledOnceWithExactly(EntryType.HTLC_ESCROW + lockId));

        const unsigned = await msb.getHtlc(lockId, false);
        t.alike(unsigned, signed);
        t.ok(state.get.calledOnceWithExactly(EntryType.HTLC_ESCROW + lockId));

        const preimage = b4a.alloc(32, 9);
        state.getSigned.resolves(safeEncodeEscrowEntry({
            ...escrowEntryUtils.decode(encoded, config.addressPrefix),
            status: escrowEntryUtils.Status.CLAIMED,
            preimage,
        }));
        const claimed = await msb.getHtlc(lockId);
        t.is(claimed.status, 'CLAIMED');
        t.is(claimed.preimage, b4a.toString(preimage, 'hex'));

        await t.exception(() => msb.getHtlc('wrong'), /Invalid HTLC lock ID/);
        state.getSigned.resolves(b4a.from('bad'));
        await t.exception(() => msb.getHtlc(lockId), /Stored HTLC escrow is invalid/);
    });

    test('MainSettlementBus submits each signed HTLC operation through the validator pipeline', async t => {
        const { msb, state } = await createApi(t);
        const validate = sinon.stub(msb, 'validateHtlc').resolves(true);
        const broadcast = sinon.stub(msb, 'broadcastPartialTransaction').resolves(true);
        const common = { tx: txHash, txv: txHash, in: '01', is: 'ab'.repeat(64) };
        const operations = [
            [msb.htlcLock, OperationType.HTLC_LOCK, 'hlo', {
                ...common, ca: address, ra: address, am: '01', fa: '00',
                hl: txHash, re: '0000000000000007', ss: [txHash], th: '01', cs: [],
            }],
            [msb.htlcClaim, OperationType.HTLC_CLAIM, 'hco', { ...common, li: lockId, pi: txHash }],
            [msb.htlcRefund, OperationType.HTLC_REFUND, 'hro', { ...common, li: lockId }],
        ];
        for (const [submit, type, key, operation] of operations) {
            const payload = { type, address, [key]: operation };
            const result = await submit.call(msb, payload);
            t.is(result.tx, txHash);
            t.is(validate.lastCall.args[0].type, type);
            t.alike(broadcast.lastCall.args[0], payload);
        }
        t.is(state.waitForUnsigned.callCount, 3);
        await t.exception(() => msb.htlcClaim({ type: OperationType.TRANSFER }), /HTLC claim payload is required/);
        await t.exception(() => msb.broadcastTransaction({ type: 255 }), /Unsupported transaction operation/);
    });

    test('MainSettlementBus exposes escrow metadata as hex or null in every settlement status', async t => {
        const { msb, state, config } = await createApi(t);
        const addressBytes = addressToBuffer(address, config.addressPrefix);
        const preimage = b4a.alloc(32, 9);
        const hashLock = tracCryptoApi.hash.sha256(preimage);
        for (const metadata of [undefined, b4a.from([0]), b4a.from([0x00, 0x80, 0xff]),
            b4a.from('{"swapId":"swap-816"}', 'utf8'), b4a.alloc(1024, 0xff)]) {
            const pending = escrowEntryUtils.init({
                lockId: b4a.from(lockId, 'hex'),
                lockerAddress: addressBytes,
                claimRecipientAddress: addressBytes,
                refundRecipientAddress: addressBytes,
                amount: bigIntTo16ByteBuffer(42n),
                additionalFeeAmount: bigIntTo16ByteBuffer(0n),
                hashLock,
                refundEpoch: uint64ToBuffer(7n),
                metadata,
            }, config.addressPrefix);
            const claimed = escrowEntryUtils.makeClaim(pending, preimage, uint64ToBuffer(6n), config.addressPrefix);
            const refunded = escrowEntryUtils.makeRefund(pending, uint64ToBuffer(7n), config.addressPrefix);

            for (const [encoded, status] of [[pending, 'PENDING'],
                [claimed.claimedEscrowEntry, 'CLAIMED'], [refunded.refundedEscrowEntry, 'REFUNDED']]) {
                state.getSigned.resolves(encoded);
                state.get.resolves(encoded);
                for (const confirmed of [true, false]) {
                    const result = JSON.parse(JSON.stringify(await msb.getHtlc(lockId, confirmed)));
                    t.is(result.status, status);
                    t.is(result.metadata, metadata === undefined ? null : b4a.toString(metadata, 'hex'),
                        'RPC preserves metadata bytes as hex and represents absence as null');
                    t.is(result.hashLock, b4a.toString(hashLock, 'hex'), 'the hashlock remains a separate field');
                    t.absent(Object.hasOwn(result, 'policyHash'), 'RPC does not expose the removed field');
                }
            }
        }
    });

    test('MainSettlementBus preserves lock metadata through RPC normalization and broadcast', async t => {
        const { msb } = await createApi(t);
        const validate = sinon.stub(msb, 'validateHtlc').resolves(true);
        const broadcast = sinon.stub(msb, 'broadcastPartialTransaction').resolves(true);
        for (const metadata of [undefined, '00', '0080ff', 'ff'.repeat(1024)]) {
            const payload = {
                type: OperationType.HTLC_LOCK,
                address,
                hlo: {
                    tx: txHash, txv: txHash, in: '01', is: 'ab'.repeat(64),
                    ca: address, ra: address, am: '01', fa: '00',
                    hl: txHash, re: '0000000000000007', ss: [txHash], th: '01', cs: [],
                    ...(metadata !== undefined && { md: metadata }),
                },
            };
            await msb.htlcLock(payload);
            const normalized = validate.lastCall.args[0].hlo;
            if (metadata === undefined) {
                t.is(normalized.md, undefined, 'absent metadata stays absent');
            } else {
                t.alike(normalized.md, b4a.from(metadata, 'hex'), 'validation receives the original metadata bytes');
            }
            t.alike(broadcast.lastCall.args[0], payload, 'broadcast retains the original hex metadata');
        }
    });
}
