import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';

import {addressToBuffer} from '../../../../src/core/state/utils/address.js';
import {applyStateMessageFactory} from '../../../../src/messages/state/applyStateMessageFactory.js';
import {createMessage, uint64ToBuffer, uint8ToBuffer} from '../../../../src/utils/buffer.js';
import {OperationType} from '../../../../src/utils/constants.js';
import {
    createHtlcLockSigningMessage,
    verifyOrderedHtlcCosignerSignatures
} from '../../../../src/utils/htlcLock.js';
import {testKeyPair1, testKeyPair2, testKeyPair3} from '../../../fixtures/apply.fixtures.js';
import applyOperationFixtures from '../../../fixtures/applyOperation.fixtures.js';
import {config} from '../../../helpers/config.js';
import {createHtlcLockTransactionHash} from '../../../helpers/htlcLock.js';

async function createWallet(mnemonic) {
    return new WalletProvider(config).fromMnemonic({mnemonic, derivationPath: config.derivationPath});
}

async function createWallets() {
    return {
        maker: await createWallet(testKeyPair1.mnemonic),
        operator: await createWallet(testKeyPair2.mnemonic),
        claimant: await createWallet(testKeyPair3.mnemonic),
    };
}

async function createCosignedLock(maker, operator, claimant) {
    const txValidity = b4a.alloc(32, 0x11);
    const nonce = b4a.alloc(32, 0x22);
    const amount = b4a.from('00000000000000000000000000000064', 'hex');
    const feeAmount = b4a.from('00000000000000000000000000000005', 'hex');
    const hashLock = b4a.alloc(32, 0x33);
    const refundEpoch = uint64ToBuffer(100);
    const policyHash = b4a.alloc(32, 0x55);
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
        ph: policyHash,
        ss: signerSet,
        th: uint8ToBuffer(2),
        in: nonce,
    };
    const locker = addressToBuffer(maker.address, config.addressPrefix);
    const tx = await createHtlcLockTransactionHash(config.networkId, locker, wireTerms);

    return {
        tx,
        txValidity,
        lock: {
            claimAddress: claimant.address,
            refundAddress: maker.address,
            amount,
            feeAmount,
            feeRecipient: operator.address,
            hashLock,
            refundEpoch,
            policyHash,
            signerSet,
            threshold: 2,
            cosignerSignatures: [operator.sign(tx)],
            nonce,
        }
    };
}

test('HTLC lock signing rejects duplicate keys across byte representations', t => {
    const fixture = applyOperationFixtures.validHtlcLockOperation;
    for (const makerIsUint8Array of [false, true]) {
        const maker = fixture.hlo.ss[0];
        const operation = {
            ...fixture.hlo,
            ss: makerIsUint8Array
                ? [new Uint8Array(maker), b4a.from(maker)]
                : [b4a.from(maker), new Uint8Array(maker)],
            th: b4a.from([1]),
            cs: []
        };

        t.exception(
            () => createHtlcLockSigningMessage(config.networkId, fixture.address, operation),
            /must not contain duplicates/
        );
    }
});

test('HTLC lock signing treats equivalent byte representations identically', t => {
    const fixture = applyOperationFixtures.validHtlcLockOperation;
    for (const threshold of [1, 2]) {
        const operation = {...fixture.hlo, th: b4a.from([threshold])};
        const expected = createHtlcLockSigningMessage(config.networkId, fixture.address, operation);
        const actual = createHtlcLockSigningMessage(config.networkId, fixture.address, {
            ...operation,
            ss: [operation.ss[0], new Uint8Array(operation.ss[1])],
            th: new Uint8Array([threshold])
        });

        t.ok(b4a.equals(actual, expected), 'equivalent signer keys and thresholds produce the same message');
    }
});

test('HTLC lock signing rejects invalid Uint8Array thresholds', t => {
    const fixture = applyOperationFixtures.validHtlcLockOperation;
    for (const bytes of [[0], [3], [255], [], [1, 0]]) {
        t.exception(
            () => createHtlcLockSigningMessage(config.networkId, fixture.address, {
                ...fixture.hlo,
                th: new Uint8Array(bytes)
            }),
            /HTLC threshold must be/
        );
    }
});

test('HTLC lock builder creates a deterministic threshold-authorized lock id', async t => {
    const {maker, operator, claimant} = await createWallets();
    const {tx, txValidity, lock} = await createCosignedLock(maker, operator, claimant);

    const payload = await applyStateMessageFactory(maker, config)
        .buildPartialHtlcLockOperationMessage(maker.address, txValidity, lock);

    t.ok(b4a.equals(payload.hlo.tx, tx), 'transaction hash is the lock id');
    t.ok(tracCryptoApi.signature.verify(payload.hlo.is, tx, maker.publicKey));
    t.ok(tracCryptoApi.signature.verify(payload.hlo.cs[0], tx, operator.publicKey));
    t.is(payload.hlo.th.readUInt8(0), 2);
    t.absent(payload.hlo.ordered, 'ordering is a protocol rule, not a signed flag');
});

test('HTLC cosigner signatures use forward-only signer-set matching', async t => {
    const {maker, operator, claimant: secondCosigner} = await createWallets();
    const cosigners = [operator, secondCosigner]
        .sort((left, right) => b4a.compare(left.publicKey, right.publicKey));
    const signerSet = [maker.publicKey, ...cosigners.map(wallet => wallet.publicKey)];
    const tx = b4a.alloc(32, 0x42);
    const signatures = cosigners.map(wallet => wallet.sign(tx));

    t.ok(
        verifyOrderedHtlcCosignerSignatures([signatures[1]], tx, signerSet),
        'an earlier optional cosigner may be omitted'
    );
    t.ok(
        verifyOrderedHtlcCosignerSignatures(signatures, tx, signerSet),
        'signatures in signer-set order are accepted'
    );
    t.absent(
        verifyOrderedHtlcCosignerSignatures([...signatures].reverse(), tx, signerSet),
        'signatures in reverse signer-set order are rejected'
    );
});

test('HTLC lock builder supports a maker-only threshold and JSON output', async t => {
    const {maker, claimant} = await createWallets();
    const payload = await applyStateMessageFactory(maker, config)
        .buildPartialHtlcLockOperationMessage(
            maker.address,
            b4a.alloc(32, 0x11),
            {
                claimAddress: claimant.address,
                refundAddress: maker.address,
                amount: b4a.alloc(16, 0x01),
                feeAmount: b4a.alloc(16),
                hashLock: b4a.alloc(32, 0x22),
                refundEpoch: uint64ToBuffer(100),
                signerSet: [maker.publicKey],
                threshold: 1,
            },
            'json'
        );

    t.is(payload.address, maker.address);
    t.is(payload.hlo.ca, claimant.address);
    t.is(payload.hlo.ra, maker.address);
    t.is(payload.hlo.th, '01');
    t.alike(payload.hlo.cs, []);
    t.absent(payload.hlo.fr);
    t.absent(payload.hlo.ph);
});

test('HTLC lock builder rejects ambiguous or invalid authorization inputs', async t => {
    const {maker, operator, claimant} = await createWallets();
    const {txValidity, lock} = await createCosignedLock(maker, operator, claimant);

    await t.exception(
        () => applyStateMessageFactory(maker, config).buildPartialHtlcLockOperationMessage(
            maker.address,
            txValidity,
            {...lock, threshold: 0, cosignerSignatures: []}
        ),
        /threshold/
    );

    await t.exception(
        () => applyStateMessageFactory(maker, config).buildPartialHtlcLockOperationMessage(
            maker.address,
            txValidity,
            {...lock, nonce: undefined}
        ),
        /nonce must be supplied/
    );

    await t.exception(
        () => applyStateMessageFactory(maker, config).buildPartialHtlcLockOperationMessage(
            maker.address,
            txValidity,
            {...lock, cosignerSignatures: [b4a.alloc(64, 0xaa)]}
        ),
        /cosigner signatures/
    );

    await t.exception(
        () => applyStateMessageFactory(maker, config).buildPartialHtlcLockOperationMessage(
            maker.address,
            txValidity,
            {...lock, signerSet: [operator.publicKey, maker.publicKey]}
        ),
        /signer zero/
    );

    await t.exception(
        () => applyStateMessageFactory(maker, config).buildPartialHtlcLockOperationMessage(
            maker.address,
            txValidity,
            {...lock, feeAmount: b4a.alloc(16), feeRecipient: operator.address}
        ),
        /fee recipient must be omitted/
    );
});

test('HTLC lock completion preserves lock authorization and adds validator metadata', async t => {
    const {maker, operator, claimant} = await createWallets();
    const {txValidity, lock} = await createCosignedLock(maker, operator, claimant);
    const partial = await applyStateMessageFactory(maker, config)
        .buildPartialHtlcLockOperationMessage(maker.address, txValidity, lock);

    const complete = await applyStateMessageFactory(operator, config)
        .buildCompleteHtlcLockOperationMessage(partial.address, partial.hlo);

    for (const field of [
        'tx', 'txv', 'ca', 'ra', 'am', 'fa', 'fr', 'hl', 're', 'ph', 'th', 'in', 'is'
    ]) {
        t.ok(b4a.equals(complete.hlo[field], partial.hlo[field]), `${field} is preserved`);
    }
    t.alike(complete.hlo.ss, partial.hlo.ss);
    t.alike(complete.hlo.cs, partial.hlo.cs);
    t.is(complete.hlo.va.toString('ascii'), operator.address);

    const validatorMessage = createMessage(
        config.networkId,
        partial.hlo.tx,
        complete.hlo.vn,
        OperationType.HTLC_LOCK
    );
    const validatorHash = await tracCryptoApi.hash.blake3(validatorMessage);
    t.ok(tracCryptoApi.signature.verify(complete.hlo.vs, validatorHash, operator.publicKey));

    const alteredFields = {
        fa: b4a.from('00000000000000000000000000000006', 'hex'),
        fr: addressToBuffer(maker.address, config.addressPrefix),
        ph: b4a.alloc(32, 0xee),
    };
    for (const [field, value] of Object.entries(alteredFields)) {
        await t.exception(
            () => applyStateMessageFactory(operator, config).buildCompleteHtlcLockOperationMessage(
                partial.address,
                {...partial.hlo, [field]: value}
            ),
            /does not match the incoming hash/,
            `${field} cannot change after signing`
        );
    }
});
