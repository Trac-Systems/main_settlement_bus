import b4a from 'b4a';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress, isAddressValid} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js"

export async function messageOperationsEkoTest(t, fnName, assembler, wallet, writingKey, opType, msgValueLength, expectedMessageAddress) {
    console.log('address:', expectedMessageAddress)
    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await assembler(wallet, writingKey);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.eko).length, msgValueLength, `Message value should have ${msgValueLength} keys`);

        k.is(msg.type, opType, `Message type should be ${opType}`);

        if (msg.type === OperationType.ADD_WRITER || msg.type === OperationType.REMOVE_WRITER || msg.type === OperationType.ADD_ADMIN) {
            k.ok(b4a.equals(msg.eko.wk, writingKey), 'Message wk should be the writing key');
        }

        k.ok(bufferToAddress(msg.address) === expectedMessageAddress, 'Message key should be the the expected one');
        k.ok(isAddressValid(msg.address), 'Message address should be a valid address');

        k.is(msg.eko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.eko.nonce), 'Message nonce should be a buffer');
        k.is(msg.eko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.eko.sig), 'Message signature should be a buffer');
    });

    t.test(`${fnName} - Invalid wallet - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {
        const wallet = {
            address: 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką'
        }
        await k.exception(
            async () => await assembler(wallet, writingKey),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - trac address is to short`, async (k) => {
        const wallet = {
            address: 'trac1y6kkq48fgu3ur'
        }
        await k.exception(
            async () => await assembler(wallet, writingKey),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - invalid prefix`, async (k) => {
        const wallet = {
            address: 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk'
        }
        await k.exception(
            async () => await assembler(wallet, writingKey),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - empty string`, async (k) => {
        const wallet = {
            address: ''
        }
        await k.exception(
            async () => await assembler(wallet, writingKey),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - null Wallet `, async (k) => {
        await k.exception(
            async () => await assembler(null, writingKey),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - undefined Wallet`, async (k) => {
        await k.exception(
            async () => await assembler(undefined, writingKey),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - Invalid writing key - not hex`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex')),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );

    });


    t.test(`${fnName} - Invalid writing key -  invalid length`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                b4a.from("1234567890a", 'hex')
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });


    t.test(`${fnName} - Invalid writing key - empty buffer`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                b4a.alloc(0)
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                null
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });


    t.test(`${fnName} - undefined writing key`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                undefined
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });

}

export async function messageOperationsBkoTest(t, fnName, assembler, wallet, writingKey, opType, msgValueLength, expectedMessageAddress) {

    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await assembler(wallet, expectedMessageAddress);

        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.bko).length, msgValueLength, `Message value should have ${msgValueLength} keys`);


        k.is(msg.type, opType, `Message type should be ${opType}`);

        k.ok(bufferToAddress(msg.address) === expectedMessageAddress, 'Message address should be the the expected one');
        k.is(msg.bko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.bko.nonce), 'Message nonce should be a buffer');
        k.is(msg.bko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.bko.sig), 'Message signature should be a buffer');
    });

    t.test(`${fnName} - Invalid wallet instance - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {
        const invalidWallet = {
            address: 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką'
        }

        await k.exception(
            async () => await assembler(invalidWallet, expectedMessageAddress),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - trac address is to short`, async (k) => {
        const wallet = {
            address: 'trac1y6kkq48fgu3ur'
        }
        await k.exception(
            async () => await assembler(wallet, expectedMessageAddress),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - invalid prefix`, async (k) => {
        const wallet = {
            address: 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk'
        }
        await k.exception(
            async () => await assembler(wallet, expectedMessageAddress),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });


    t.test(`${fnName} - Invalid wallet instance - empty string`, async (k) => {
        const wallet = {
            address: ''
        }
        await k.exception(
            async () => await assembler(wallet, expectedMessageAddress),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - Null Wallet`, async (k) => {
        await k.exception(
            async () => await assembler(null, expectedMessageAddress),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - Invalid wallet instance - undefined Wallet`, async (k) => {
        await k.exception(
            async () => await assembler(undefined, expectedMessageAddress),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - Address parameter - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {

        const invalid = 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką';

        await k.exception(
            async () => await assembler(wallet, invalid),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Address parameter - trac address is to short`, async (k) => {
        const invalid = 'trac1y6kkq48fgu3ur';

        await k.exception(
            async () => await assembler(wallet, invalid),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Address parameter - invalid prefix`, async (k) => {
        const invalid = 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk';

        await k.exception(
            async () => await assembler(wallet, invalid),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });


    t.test(`${fnName} - Address parameter - empty string`, async (k) => {
        const invalid = '';

        await k.exception(
            async () => await assembler(wallet, invalid),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Address parameter - Null`, async (k) => {

        await k.exception(
            async () => await assembler(wallet, null),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Address parameter - undefined`, async (k) => {
        await k.exception(
            async () => await assembler(wallet, undefined),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Address parameter - address is the same as wallet address`, async (k) => {
        await k.exception(
            async () => await assembler(wallet, wallet.address),
            errorMessageIncludes('Address must not be the same as the wallet address for basic operations')
        );
    });



}