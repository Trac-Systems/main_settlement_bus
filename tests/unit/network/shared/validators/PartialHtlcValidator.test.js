import test from 'brittle';
import b4a from 'b4a';

import PartialHtlcValidator from '../../../../../src/core/network/protocols/shared/validators/PartialHtlcValidator.js';
import {addressToBuffer} from '../../../../../src/core/state/utils/address.js';
import {$TNK} from '../../../../../src/core/state/utils/balance.js';
import {bigIntToBuffer, uint64ToBuffer, uint8ToBuffer} from '../../../../../src/utils/buffer.js';
import {HTLC_MIN_LOCK_DURATION_EPOCHS, OperationType, ResultCode} from '../../../../../src/utils/constants.js';
import {config} from '../../../../helpers/config.js';
import {createHtlcLockTransactionHash} from '../../../../helpers/htlcLock.js';
import applyOperationFixtures from '../../../../fixtures/applyOperation.fixtures.js';
import {
    buildHtlcLockPayload,
    createNodeEntry,
    createState,
    expectSharedValidatorError,
    getWalletSet,
} from '../../utils/sharedValidatorTestUtils.js';

function createValidState(maker, overrides = {}) {
    return createState({
        unsignedEntries: new Map([[maker.address, createNodeEntry({balance: $TNK(10n)})]]),
        getCurrentEpoch: async () => 10n,
        ...overrides
    });
}

async function resignLock(payload, maker) {
    const tx = await createHtlcLockTransactionHash(config.networkId, payload.address, payload.hlo);
    payload.hlo.tx = tx;
    payload.hlo.is = maker.sign(tx);
}

async function buildCosignedLock(maker, operator, claimant) {
    const txValidity = b4a.alloc(32, 0x11);
    const nonce = b4a.alloc(32, 0x22);
    const amount = bigIntToBuffer(100n);
    const feeAmount = bigIntToBuffer(5n);
    const hashLock = b4a.alloc(32, 0x33);
    const refundEpoch = uint64ToBuffer(100);
    const signerSet = [maker.publicKey, operator.publicKey];
    const wireTerms = {
        txv: txValidity,
        ca: addressToBuffer(claimant.address, config.addressPrefix),
        ra: addressToBuffer(maker.address, config.addressPrefix),
        am: amount,
        fa: feeAmount,
        fr: addressToBuffer(operator.address, config.addressPrefix),
        hl: hashLock,
        re: refundEpoch,
        ss: signerSet,
        th: uint8ToBuffer(2),
        in: nonce,
    };
    const locker = addressToBuffer(maker.address, config.addressPrefix);
    const tx = await createHtlcLockTransactionHash(config.networkId, locker, wireTerms);

    return buildHtlcLockPayload(maker, claimant.address, txValidity, {
        amount,
        feeAmount,
        feeRecipient: operator.address,
        hashLock,
        refundEpoch,
        signerSet,
        threshold: 2,
        cosignerSignatures: [operator.sign(tx)],
        nonce,
    });
}

test('PartialHtlcValidator accepts maker-only and cosigned lock authorizations', async t => {
    const {requester: maker, validator, recipient: claimant, alternate: operator} = await getWalletSet();
    const validatorInstance = new PartialHtlcValidator(createValidState(maker), validator.address, config);

    t.ok(await validatorInstance.validate(await buildHtlcLockPayload(maker, claimant.address)));
    t.ok(await validatorInstance.validate(await buildCosignedLock(maker, operator, claimant)));
});

test('PartialHtlcValidator rejects unfinished claim and refund operations', async t => {
    const validatorInstance = new PartialHtlcValidator(createState(), undefined, config);
    const claim = applyOperationFixtures.validHtlcClaimOperation;
    const lock = applyOperationFixtures.validHtlcLockOperation;

    for (const type of [OperationType.HTLC_CLAIM, OperationType.HTLC_REFUND]) {
        for (const payload of [{type}, {...claim, type}, {...lock, type}]) {
            await expectSharedValidatorError(
                t,
                () => validatorInstance.validate(payload),
                ResultCode.OPERATION_TYPE_UNKNOWN,
                'validation is not implemented'
            );
        }
    }
});

test('PartialHtlcValidator binds signer zero to the locker address', async t => {
    const {requester: maker, validator, recipient: claimant, alternate: other} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);
    payload.hlo.ss[0] = other.publicKey;
    await resignLock(payload, maker);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(payload),
        ResultCode.TX_SIGNATURE_INVALID,
        'signer zero'
    );
});

test('PartialHtlcValidator verifies every supplied cosigner signature', async t => {
    const {requester: maker, validator, recipient: claimant, alternate: operator} = await getWalletSet();
    const payload = await buildCosignedLock(maker, operator, claimant);
    payload.hlo.cs[0] = b4a.alloc(64, 0xaa);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(payload),
        ResultCode.TX_SIGNATURE_INVALID,
        'cosigner signatures'
    );

    const unsatisfied = await buildCosignedLock(maker, operator, claimant);
    unsatisfied.hlo.cs = [];
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(unsatisfied),
        ResultCode.SCHEMA_VALIDATION_FAILED,
        'Payload is invalid'
    );
});

test('PartialHtlcValidator matches cosigner signatures only in signer-set order', async t => {
    const {requester: maker, validator, recipient: claimant, alternate: operator} = await getWalletSet();
    const validatorInstance = new PartialHtlcValidator(createValidState(maker), validator.address, config);
    const payload = await buildCosignedLock(maker, operator, claimant);
    const cosigners = [operator, claimant]
        .sort((left, right) => b4a.compare(left.publicKey, right.publicKey));

    payload.hlo.ss = [maker.publicKey, ...cosigners.map(wallet => wallet.publicKey)];
    payload.hlo.th = uint8ToBuffer(2);
    await resignLock(payload, maker);
    payload.hlo.cs = [cosigners[1].sign(payload.hlo.tx)];
    t.ok(await validatorInstance.validate(payload), 'a later cosigner can sign without an empty placeholder');

    payload.hlo.th = uint8ToBuffer(3);
    await resignLock(payload, maker);
    payload.hlo.cs = cosigners.map(wallet => wallet.sign(payload.hlo.tx)).reverse();
    await expectSharedValidatorError(
        t,
        () => validatorInstance.validate(payload),
        ResultCode.TX_SIGNATURE_INVALID,
        'signer-set order'
    );
});

test('PartialHtlcValidator requires valid settlement addresses', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);
    payload.hlo.ca = b4a.alloc(config.addressLength, 0x01);
    await resignLock(payload, maker);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(payload),
        ResultCode.TX_INVALID_PAYLOAD,
        'claim address'
    );
});

test('PartialHtlcValidator rejects signed high-bit settlement-address aliases', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const validatorInstance = new PartialHtlcValidator(createValidState(maker), validator.address, config);

    for (const [field, label] of [['ca', 'claim'], ['ra', 'refund'], ['fr', 'fee recipient']]) {
        const payload = await buildHtlcLockPayload(maker, claimant.address, undefined, {
            feeAmount: bigIntToBuffer(5n),
            feeRecipient: claimant.address,
        });
        payload.hlo[field] = b4a.from(payload.hlo[field]);
        payload.hlo[field][0] |= 0x80;
        await resignLock(payload, maker);

        await expectSharedValidatorError(
            t,
            () => validatorInstance.validate(payload),
            ResultCode.TX_INVALID_PAYLOAD,
            `${label} address`
        );
    }
});

test('PartialHtlcValidator rejects a signed high-bit requester-address alias', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);
    payload.address = b4a.from(payload.address);
    payload.address[0] |= 0x80;
    await resignLock(payload, maker);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(payload),
        ResultCode.REQUESTER_ADDRESS_INVALID,
        'requesting address'
    );
});

test('PartialHtlcValidator enforces an initialized epoch and minimum lock duration', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const expiredPayload = await buildHtlcLockPayload(maker, claimant.address, undefined, {
        refundEpoch: uint64ToBuffer(10)
    });

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(expiredPayload),
        ResultCode.TX_INVALID_PAYLOAD,
        'refund epoch'
    );

    const validPayload = await buildHtlcLockPayload(maker, claimant.address);
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(
            createValidState(maker, {getCurrentEpoch: async () => null}),
            validator.address,
            config
        ).validate(validPayload),
        ResultCode.TX_INVALID_PAYLOAD,
        'initialized network epoch'
    );
});

test('PartialHtlcValidator handles Buffer and Uint8Array refund epochs consistently', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const currentEpoch = 0x0102030405060708n;
    const minimumRefundEpoch = currentEpoch + HTLC_MIN_LOCK_DURATION_EPOCHS;
    const validatorInstance = new PartialHtlcValidator(
        createValidState(maker, {getCurrentEpoch: async () => currentEpoch}),
        validator.address,
        config
    );
    const byteForms = [
        ['Buffer', value => value],
        ['Uint8Array', value => new Uint8Array(value)],
        ['Uint8Array view', value => {
            const storage = new Uint8Array(value.length + 2);
            storage.set(value, 1);
            return storage.subarray(1, value.length + 1);
        }]
    ];

    for (const [label, asBytes] of byteForms) {
        for (const refundEpoch of [minimumRefundEpoch - 1n, minimumRefundEpoch, minimumRefundEpoch + 1n, 0xffffffffffffffffn]) {
            const payload = await buildHtlcLockPayload(maker, claimant.address, undefined, {
                refundEpoch: uint64ToBuffer(refundEpoch)
            });
            payload.hlo.re = asBytes(payload.hlo.re);

            if (refundEpoch < minimumRefundEpoch) {
                await expectSharedValidatorError(
                    t,
                    () => validatorInstance.validate(payload),
                    ResultCode.TX_INVALID_PAYLOAD,
                    'refund epoch'
                );
            } else {
                t.ok(await validatorInstance.validate(payload), `${label} accepts refund epoch ${refundEpoch}`);
            }
        }

        for (const length of [7, 9]) {
            const payload = await buildHtlcLockPayload(maker, claimant.address);
            payload.hlo.re = asBytes(b4a.alloc(length, 1));
            await expectSharedValidatorError(
                t,
                () => validatorInstance.validate(payload),
                ResultCode.SCHEMA_VALIDATION_FAILED,
                'Payload is invalid'
            );
        }
    }
});

test('PartialHtlcValidator checks principal, surcharge, and network fee against locker balance', async t => {
    const {requester: maker, validator, recipient: claimant, alternate: feeRecipient} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(
            createValidState(maker, {
                unsignedEntries: new Map([[maker.address, createNodeEntry({balance: bigIntToBuffer(0n)})]])
            }),
            validator.address,
            config
        ).validate(payload),
        ResultCode.TRANSFER_INSUFFICIENT_BALANCE,
        'principal, surcharge fee, and network fee'
    );

    const overflowPayload = await buildHtlcLockPayload(maker, claimant.address, undefined, {
        amount: b4a.alloc(16, 0xff),
        feeAmount: bigIntToBuffer(1n),
        feeRecipient: feeRecipient.address
    });
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(createValidState(maker), validator.address, config).validate(overflowPayload),
        ResultCode.TRANSFER_AMOUNT_TOO_LARGE,
        'maximum allowed value'
    );
});
