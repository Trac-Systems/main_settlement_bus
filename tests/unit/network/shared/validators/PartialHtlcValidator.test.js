import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import PartialHtlcValidator from '../../../../../src/core/network/protocols/shared/validators/PartialHtlcValidator.js';
import {safeDecodeApplyOperation, safeEncodeApplyOperation} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {applyStateMessageFactory} from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {addressToBuffer} from '../../../../../src/core/state/utils/address.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import nodeEntryUtils from '../../../../../src/core/state/utils/nodeEntry.js';
import {$TNK, BALANCE_FEE, PERCENT_75} from '../../../../../src/core/state/utils/balance.js';
import {bigIntToBuffer, uint64ToBuffer, uint8ToBuffer} from '../../../../../src/utils/buffer.js';
import {EntryType, HTLC_MIN_LOCK_DURATION_EPOCHS, ResultCode} from '../../../../../src/utils/constants.js';
import {config} from '../../../../helpers/config.js';
import {createHtlcLockTransactionHash} from '../../../../helpers/htlcLock.js';
import {
    buildHtlcLockPayload,
    createNodeEntry,
    createState,
    DEFAULT_TX_VALIDITY,
    expectSharedValidatorError,
    getWalletSet,
} from '../../utils/sharedValidatorTestUtils.js';

function createValidState(maker, overrides = {}) {
    const state = createState({
        unsignedEntries: new Map([[maker.address, createNodeEntry({balance: $TNK(10n)})]]),
        getCurrentEpoch: async () => 10n,
        ...overrides
    });
    state.getCurrentEpochUnsigned ??= async () => state.getCurrentEpoch();
    return state;
}

test('PartialHtlcValidator rejects a lock with an existing escrow entry', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);
    const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(payload.hlo.tx, 'hex');
    const state = createValidState(maker, {
        get: async key => key === escrowKey ? b4a.from([1]) : null
    });

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TX_ALREADY_EXISTS,
        'escrow already exists'
    );
});

test('PartialHtlcValidator checks the latest unsigned epoch at admission', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address, undefined, {
        refundEpoch: uint64ToBuffer(12)
    });
    const state = createValidState(maker, {getCurrentEpochUnsigned: async () => 12n});

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TX_INVALID_PAYLOAD,
        'refund epoch'
    );

    state.getCurrentEpochUnsigned = async () => null;
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TX_INVALID_PAYLOAD,
        'initialized network epoch'
    );
});

test('PartialHtlcValidator rejects validator reward overflow before completion', async t => {
    const {requester: maker, validator, recipient: claimant} = await getWalletSet();
    const payload = await buildHtlcLockPayload(maker, claimant.address);
    const maximumBalance = (1n << 128n) - 1n;
    const unsignedEntries = new Map([
        [maker.address, createNodeEntry({balance: $TNK(10n)})],
        [validator.address, createNodeEntry({balance: bigIntToBuffer(maximumBalance)})]
    ]);
    const state = createValidState(maker, {unsignedEntries});

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
        'validator reward'
    );

    const reward = BALANCE_FEE.percentage(PERCENT_75).asBigInt();
    unsignedEntries.set(validator.address, createNodeEntry({balance: bigIntToBuffer(maximumBalance - reward)}));
    t.ok(await new PartialHtlcValidator(state, validator.address, config).validate(payload),
        'a validator balance that reaches the maximum exactly is accepted');
});

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

async function createClaimScenario({sameRecipient = false} = {}) {
    const {requester: maker, validator, recipient: claimant, alternate: submitter} = await getWalletSet();
    const lockId = b4a.alloc(32, 0x71);
    const preimage = b4a.alloc(32, 0x72);
    const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(lockId, 'hex');
    const escrow = escrowEntryUtils.init({
        lockId,
        lockerAddress: addressToBuffer(maker.address, config.addressPrefix),
        claimRecipientAddress: addressToBuffer(claimant.address, config.addressPrefix),
        refundRecipientAddress: addressToBuffer(maker.address, config.addressPrefix),
        amount: bigIntToBuffer(100n),
        additionalFeeAmount: bigIntToBuffer(5n),
        additionalFeeRecipientAddress: addressToBuffer(
            sameRecipient ? claimant.address : maker.address,
            config.addressPrefix
        ),
        hashLock: tracCryptoApi.hash.sha256(preimage),
        refundEpoch: uint64ToBuffer(20n)
    }, config.addressPrefix);
    const txEntries = new Map([[escrowKey, escrow]]);
    const signedEntries = new Map([[escrowKey, escrow]]);
    const state = createState({
        txEntries,
        signedEntries,
        getCurrentEpoch: async () => 10n,
        getCurrentEpochUnsigned: async () => 10n
    });
    const buildClaim = (secret = preimage) => applyStateMessageFactory(submitter, config)
        .buildPartialHtlcClaimOperationMessage(submitter.address, DEFAULT_TX_VALIDITY, lockId, secret);

    return {maker, validator, claimant, submitter, lockId, preimage, escrowKey, escrow, txEntries, signedEntries, state, buildClaim};
}

test('PartialHtlcValidator admits a claim signed by an unfunded third party', async t => {
    const {validator, submitter, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();

    t.is(await state.getNodeEntryUnsigned(submitter.address), null, 'submitter has no account');
    t.ok(await new PartialHtlcValidator(state, validator.address, config).validate(claim));
});

test('PartialHtlcValidator requires a signed lock before admitting a claim', async t => {
    const {validator, escrowKey, signedEntries, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();
    signedEntries.delete(escrowKey);

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(claim),
        ResultCode.TX_INVALID_PAYLOAD,
        'not confirmed in signed state'
    );
});

test('PartialHtlcValidator rejects a validator signing its own claim', async t => {
    const {submitter, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, submitter.address, config).validate(claim),
        ResultCode.SELF_VALIDATION_FORBIDDEN
    );
});

test('PartialHtlcValidator rejects missing and already settled escrows', async t => {
    const {validator, escrowKey, escrow, preimage, txEntries, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();
    const validatorInstance = new PartialHtlcValidator(state, validator.address, config);

    txEntries.delete(escrowKey);
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_INVALID_PAYLOAD, 'does not exist');

    const settled = escrowEntryUtils.makeClaim(escrow, preimage, uint64ToBuffer(10n), config.addressPrefix);
    txEntries.set(escrowKey, settled.claimedEscrowEntry);
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_ALREADY_EXISTS, 'already settled');
});

test('PartialHtlcValidator rejects an already recorded claim transaction', async t => {
    const {validator, txEntries, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();
    txEntries.set(b4a.toString(claim.hco.tx, 'hex'), b4a.from([1]));

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(claim),
        ResultCode.TX_ALREADY_EXISTS,
        'already exists'
    );
});

test('PartialHtlcValidator checks signed and unsigned claim epochs', async t => {
    const {validator, state, buildClaim} = await createClaimScenario();
    const claim = await buildClaim();
    const validatorInstance = new PartialHtlcValidator(state, validator.address, config);

    state.getCurrentEpochUnsigned = async () => 20n;
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_EXPIRED, 'expired');

    state.getCurrentEpochUnsigned = async () => 10n;
    state.getCurrentEpoch = async () => 20n;
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_EXPIRED, 'expired');

    state.getCurrentEpoch = async () => null;
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_INVALID_PAYLOAD, 'initialized');
});

test('PartialHtlcValidator rejects a wrong preimage and an invalid submitter signature', async t => {
    const {validator, state, buildClaim} = await createClaimScenario();
    const validatorInstance = new PartialHtlcValidator(state, validator.address, config);
    const wrongPreimageClaim = await buildClaim(b4a.alloc(32, 0x73));

    await expectSharedValidatorError(
        t,
        () => validatorInstance.validate(wrongPreimageClaim),
        ResultCode.TX_INVALID_PAYLOAD,
        'preimage'
    );

    const claim = await buildClaim();
    claim.hco.is = b4a.alloc(claim.hco.is.length, 0xaa);
    await expectSharedValidatorError(t, () => validatorInstance.validate(claim), ResultCode.TX_SIGNATURE_INVALID);
});

test('PartialHtlcValidator rejects a claim that would overflow a payout account', async t => {
    const {validator, claimant, state, buildClaim} = await createClaimScenario();
    const maxBalance = (1n << 128n) - 1n;
    const claim = await buildClaim();
    state.getNodeEntryUnsigned = async address => address === claimant.address
        ? createNodeEntry({balance: bigIntToBuffer(maxBalance - 99n)})
        : null;

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(claim),
        ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
        'overflow'
    );
});

test('PartialHtlcValidator combines overlapping claim and fee payouts before overflow checking', async t => {
    const {validator, claimant, state, buildClaim} = await createClaimScenario({sameRecipient: true});
    const maxBalance = (1n << 128n) - 1n;
    const claim = await buildClaim();
    const validatorInstance = new PartialHtlcValidator(state, validator.address, config);

    state.getNodeEntryUnsigned = async address => address === claimant.address
        ? createNodeEntry({balance: bigIntToBuffer(maxBalance - 104n)})
        : null;
    await expectSharedValidatorError(
        t,
        () => validatorInstance.validate(claim),
        ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
        'overflow'
    );

    state.getNodeEntryUnsigned = async address => address === claimant.address
        ? createNodeEntry({balance: bigIntToBuffer(maxBalance - 105n)})
        : null;
    t.ok(await validatorInstance.validate(claim), 'recipient may reach the maximum balance exactly');
});

async function createRefundScenario({signedEpoch = 100n, unsignedEpoch = 100n} = {}) {
    const {requester: maker, validator, recipient: claimant, alternate: relayer} = await getWalletSet();
    const lock = await buildHtlcLockPayload(maker, claimant.address);
    const lockId = lock.hlo.tx;
    const escrowKey = EntryType.HTLC_ESCROW + b4a.toString(lockId, 'hex');
    const escrow = escrowEntryUtils.init({
        lockId,
        lockerAddress: lock.address,
        claimRecipientAddress: lock.hlo.ca,
        refundRecipientAddress: lock.hlo.ra,
        amount: lock.hlo.am,
        additionalFeeAmount: lock.hlo.fa,
        hashLock: lock.hlo.hl,
        refundEpoch: lock.hlo.re,
    }, config.addressPrefix);
    const signedEntries = new Map([[escrowKey, escrow]]);
    const txEntries = new Map([[escrowKey, escrow]]);
    const state = createState({
        signedEntries,
        txEntries,
        getCurrentEpoch: async () => signedEpoch,
        getCurrentEpochUnsigned: async () => unsignedEpoch,
    });
    const payload = await applyStateMessageFactory(relayer, config)
        .buildPartialHtlcRefundOperationMessage(relayer.address, b4a.alloc(32, 0x11), lockId);
    return {maker, validator, relayer, lockId, escrowKey, escrow, signedEntries, txEntries, state, payload};
}

test('PartialHtlcValidator admits a signed third-party refund at the expiry epoch', async t => {
    const {validator, relayer, state, payload} = await createRefundScenario();
    t.ok(await new PartialHtlcValidator(state, validator.address, config).validate(payload));
    const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(payload));
    t.ok(await new PartialHtlcValidator(state, validator.address, config).validate(decoded),
        'protobuf-decoded partial refund is admitted');
    t.not(relayer.address, validator.address, 'submitter need not be the refund recipient or validator');
});

test('PartialHtlcValidator requires a confirmed pending escrow', async t => {
    const {validator, state, payload, escrowKey, escrow, signedEntries, txEntries} = await createRefundScenario();
    const admission = () => new PartialHtlcValidator(state, validator.address, config).validate(payload);

    signedEntries.delete(escrowKey);
    await expectSharedValidatorError(t, admission, ResultCode.TX_INVALID_PAYLOAD, 'signed state');
    signedEntries.set(escrowKey, escrow);
    txEntries.delete(escrowKey);
    await expectSharedValidatorError(t, admission, ResultCode.TX_INVALID_PAYLOAD, 'current state');
    txEntries.set(escrowKey, escrowEntryUtils.makeRefund(escrow, uint64ToBuffer(100n), config.addressPrefix).refundedEscrowEntry);
    await expectSharedValidatorError(t, admission, ResultCode.TX_ALREADY_EXISTS, 'already settled');
});

test('PartialHtlcValidator waits for the signed refund epoch', async t => {
    const {validator, state, payload} = await createRefundScenario({signedEpoch: 99n});
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TX_INVALID_PAYLOAD,
        'not been reached'
    );
});

test('PartialHtlcValidator also waits for the unsigned refund epoch', async t => {
    const {validator, state, payload} = await createRefundScenario({unsignedEpoch: 99n});
    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TX_INVALID_PAYLOAD,
        'not been reached'
    );
});

test('PartialHtlcValidator rejects a refund that would overflow the stored recipient', async t => {
    const {maker, validator, state, payload, txEntries} = await createRefundScenario();
    const maximumBalance = (1n << 128n) - 1n;
    txEntries.set(maker.address, nodeEntryUtils.encode(createNodeEntry({balance: bigIntToBuffer(maximumBalance)})));

    await expectSharedValidatorError(
        t,
        () => new PartialHtlcValidator(state, validator.address, config).validate(payload),
        ResultCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
        'overflow'
    );

    txEntries.set(maker.address, nodeEntryUtils.encode(createNodeEntry({balance: bigIntToBuffer(maximumBalance - 1n)})));
    t.ok(await new PartialHtlcValidator(state, validator.address, config).validate(payload),
        'a recipient balance that reaches the maximum exactly is accepted');
});

test('PartialHtlcValidator rejects a corrupt refund recipient account but accepts an absent one', async t => {
    const {maker, validator, state, payload, txEntries} = await createRefundScenario();
    const admission = () => new PartialHtlcValidator(state, validator.address, config).validate(payload);

    txEntries.set(maker.address, b4a.from([1]));
    await expectSharedValidatorError(t, admission, ResultCode.TX_INVALID_PAYLOAD, 'recipient account is invalid');

    txEntries.delete(maker.address);
    t.ok(await admission(), 'a missing refund recipient account can be created during apply');
});

test('PartialHtlcValidator rejects refund replay, forged signature and self-validation', async t => {
    const {validator, state, payload, txEntries} = await createRefundScenario();
    const admission = candidate => new PartialHtlcValidator(state, validator.address, config).validate(candidate);

    txEntries.set(b4a.toString(payload.hro.tx, 'hex'), b4a.from([1]));
    await expectSharedValidatorError(t, () => admission(payload), ResultCode.TX_ALREADY_EXISTS);
    txEntries.delete(b4a.toString(payload.hro.tx, 'hex'));

    const forged = {...payload, hro: {...payload.hro, is: b4a.alloc(payload.hro.is.length, 0xaa)}};
    await expectSharedValidatorError(t, () => admission(forged), ResultCode.TX_SIGNATURE_INVALID);

    const selfPayload = await applyStateMessageFactory(validator, config)
        .buildPartialHtlcRefundOperationMessage(validator.address, payload.hro.txv, payload.hro.li);
    await expectSharedValidatorError(t, () => admission(selfPayload), ResultCode.SELF_VALIDATION_FORBIDDEN);
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

test.skip('PartialHtlcValidator rejects signed high-bit settlement-address aliases', async t => {
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

test.skip('PartialHtlcValidator rejects a signed high-bit requester-address alias', async t => {
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
