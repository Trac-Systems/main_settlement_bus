import {test} from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import {WalletProvider} from 'trac-wallet';

import {addressToBuffer} from '../../../../src/core/state/utils/address.js';
import {applyStateMessageFactory} from '../../../../src/messages/state/applyStateMessageFactory.js';
import ApplyStateMessageBuilder from '../../../../src/messages/state/ApplyStateMessageBuilder.js';
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
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
import {normalizeMessageByOperationType} from '../../../../src/utils/normalizers.js';

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

async function createCosignedLock(maker, operator, claimant, metadata = b4a.from([0x00, 0x80, 0xff])) {
    const txValidity = b4a.alloc(32, 0x11);
    const nonce = b4a.alloc(32, 0x22);
    const amount = b4a.from('00000000000000000000000000000064', 'hex');
    const feeAmount = b4a.from('00000000000000000000000000000005', 'hex');
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
        md: metadata,
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
            metadata,
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
    t.absent(payload.hlo.md);
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
        'tx', 'txv', 'ca', 'ra', 'am', 'fa', 'fr', 'hl', 're', 'md', 'th', 'in', 'is'
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
        md: b4a.alloc(32, 0xee),
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

test('HTLC metadata setter validates byte and hex inputs and allows explicit omission', async t => {
    const maker = await createWallet(testKeyPair1.mnemonic);
    const builder = new ApplyStateMessageBuilder(maker, config);
    for (const metadata of [undefined, b4a.alloc(1), b4a.alloc(1024), new Uint8Array([0xff]),
        new Uint8Array(1024), '00', 'AaFF', 'ff'.repeat(1024)]) {
        t.is(builder.setHtlcMetadata(metadata), builder, 'valid metadata keeps the fluent API');
    }
    for (const metadata of [null, b4a.alloc(0), new Uint8Array(0), b4a.alloc(1025),
        new Uint8Array(1025), '', '0', 'abc', 'zz', '0x00', ' 00', '00 '.repeat(2),
        'ff'.repeat(1025), false, 1, 1n, Symbol('metadata'), {}, [0],
        new ArrayBuffer(1), new Uint16Array(1), {type: 'Buffer', data: [0]}]) {
        t.exception(() => builder.setHtlcMetadata(metadata), /HTLC metadata/, 'invalid metadata is rejected');
    }
    t.is(builder.setHtlcMetadata(undefined), builder, 'undefined clears previously supplied metadata');
});

test('HTLC director preserves metadata through partial, JSON and complete builds', async t => {
    const {maker, operator, claimant} = await createWallets();
    const schema = new StateValidationSchema(config);
    for (const bytes of [b4a.alloc(1), b4a.from([0x00, 0xff, 0x80]), b4a.alloc(1024)]) {
        const {tx, txValidity, lock} = await createCosignedLock(maker, operator, claimant, bytes);
        for (const metadata of [bytes, new Uint8Array(bytes), b4a.toString(bytes, 'hex').toUpperCase()]) {
            const partial = await applyStateMessageFactory(maker, config)
                .buildPartialHtlcLockOperationMessage(maker.address, txValidity, {...lock, metadata});
            t.ok(b4a.equals(partial.hlo.md, bytes), 'partial contains the exact metadata bytes');
            t.ok(b4a.equals(partial.hlo.tx, tx), 'input representations produce the same transaction hash');
            t.is(Object.hasOwn(partial.hlo, 'ph'), false, 'legacy field is absent');
            t.is(schema.validateHtlcLockOperation(partial), true, 'partial conforms to the schema');

            const json = await applyStateMessageFactory(maker, config)
                .buildPartialHtlcLockOperationMessage(maker.address, txValidity, {...lock, metadata}, 'json');
            t.is(json.hlo.md, b4a.toString(bytes, 'hex'), 'JSON contains canonical hex metadata');
            t.is(Object.hasOwn(json.hlo, 'ph'), false, 'JSON omits the legacy field');

            const normalized = normalizeMessageByOperationType(json, config);
            t.alike(normalized, partial, 'JSON normalization restores the signed partial operation');

            const complete = await applyStateMessageFactory(operator, config)
                .buildCompleteHtlcLockOperationMessage(normalized.address, normalized.hlo);
            t.ok(b4a.equals(complete.hlo.md, bytes), 'completion preserves metadata');
            t.is(schema.validateHtlcLockOperation(complete), true, 'complete conforms to the schema');
        }
    }
});

test('HTLC director preserves metadata omission and rejects metadata added or removed after signing', async t => {
    const {maker, operator, claimant} = await createWallets();
    const {txValidity, lock} = await createCosignedLock(maker, operator, claimant);
    const unsignedLock = {...lock, threshold: 1, cosignerSignatures: []};
    for (const withMetadata of [false, true]) {
        const input = {...unsignedLock};
        if (!withMetadata) delete input.metadata;
        const partial = await applyStateMessageFactory(maker, config)
            .buildPartialHtlcLockOperationMessage(maker.address, txValidity, input);
        const complete = await applyStateMessageFactory(operator, config)
            .buildCompleteHtlcLockOperationMessage(partial.address, partial.hlo);
        t.is(Object.hasOwn(complete.hlo, 'md'), withMetadata, 'completion preserves metadata presence');

        const altered = {...partial.hlo};
        if (withMetadata) delete altered.md;
        else altered.md = b4a.alloc(1);
        await t.exception(
            () => applyStateMessageFactory(operator, config)
                .buildCompleteHtlcLockOperationMessage(partial.address, altered),
            /does not match the incoming hash/,
            'adding or removing metadata changes the signed message'
        );
    }
    for (const metadata of [null, b4a.alloc(0), b4a.alloc(1025), 'invalid hex']) {
        await t.exception(
            () => applyStateMessageFactory(maker, config)
                .buildPartialHtlcLockOperationMessage(maker.address, txValidity, {...unsignedLock, metadata}),
            /HTLC metadata/,
            'director forwards invalid metadata to builder validation'
        );
    }
});

test('HTLC signing frames metadata with a uint32 big-endian byte length', t => {
    const {address, hlo} = applyOperationFixtures.validHtlcLockOperation;
    for (const [md, prefix] of [[undefined, '00000000'], [b4a.alloc(1), '00000001'],
        [b4a.from([0x00, 0xff, 0x80]), '00000003'], [b4a.alloc(1024), '00000400']]) {
        const operation = {...hlo, md};
        const expected = createMessage(
            config.networkId, address, hlo.txv, hlo.ca, hlo.ra, hlo.am, hlo.fa, hlo.fr,
            hlo.hl, hlo.re, b4a.from(prefix, 'hex'), md ?? b4a.alloc(0),
            uint8ToBuffer(hlo.ss.length), ...hlo.ss, hlo.th, hlo.in, OperationType.HTLC_LOCK
        );
        t.ok(b4a.equals(createHtlcLockSigningMessage(config.networkId, address, operation), expected),
            `metadata length prefix ${prefix}`);
    }
    for (const md of [null, b4a.alloc(0), b4a.alloc(1025), '00', false]) {
        t.exception(() => createHtlcLockSigningMessage(config.networkId, address, {...hlo, md}), /HTLC metadata/);
    }
});
