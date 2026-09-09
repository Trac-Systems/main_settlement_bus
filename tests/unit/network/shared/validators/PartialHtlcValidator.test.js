import test from 'brittle';
import b4a from 'b4a';

import PartialHtlcValidator from '../../../../../src/core/network/protocols/shared/validators/PartialHtlcValidator.js';
import {addressToBuffer} from '../../../../../src/core/state/utils/address.js';
import {$TNK} from '../../../../../src/core/state/utils/balance.js';
import {bigIntToBuffer, uint64ToBuffer, uint8ToBuffer} from '../../../../../src/utils/buffer.js';
import {ResultCode} from '../../../../../src/utils/constants.js';
import {createHtlcLockTransactionHash} from '../../../../../src/utils/htlcLock.js';
import {config} from '../../../../helpers/config.js';
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
    const counterpartyHash = b4a.alloc(32, 0x44);
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
        cc: counterpartyHash,
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
        counterpartyHash,
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
