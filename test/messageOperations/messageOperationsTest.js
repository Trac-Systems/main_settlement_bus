import b4a from 'b4a';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress, isAddressValid} from "../../src/core/state/utils/address.js";
import StateMessageOperations from "../../src/messages/stateMessages/StateMessageOperations.js";
import {errorMessageIncludes} from "../utils/regexHelper.js"

export async function messageOperationsEkoTest(t, fnName, assembler, wallet, writingKey, opType, msgValueLength, expectedMessageAddress) {
    console.log('address:', expectedMessageAddress)
    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await assembler(wallet, writingKey);
        console.log('msg', msg);
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
            async () => await StateMessageOperations.assembleAddWriterMessage(wallet, writingKey),
            errorMessageIncludes('Address must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Invalid wallet - trac address is to short`, async (k) => {
        const wallet = {
            address: 'trac1y6kkq48fgu3ur'
        }
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(wallet, writingKey),
            errorMessageIncludes('Address must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Invalid wallet - invalid prefix`, async (k) => {
        const wallet = {
            address: 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk'
        }
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(wallet, writingKey),
            errorMessageIncludes('Address must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Invalid wallet - empty string`, async (k) => {
        const wallet = {
            address: ''
        }
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(wallet, writingKey),
            errorMessageIncludes('Address must be a valid TRAC bech32m address with length 63')
        );
    });

    t.test(`${fnName} - Null Wallet`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(null, writingKey),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - undefined Wallet`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(undefined, writingKey),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    t.test(`${fnName} - Invalid writing key - not hex`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(
                wallet,
                b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex')),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );

    });


    t.test(`${fnName} - Invalid writing key -  invalid length`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(
                wallet,
                b4a.from("1234567890a", 'hex')
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });


    t.test(`${fnName} - Invalid writing key - empty buffer`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(
                wallet,
                b4a.alloc(0)
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(
                wallet,
                null
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });


    t.test(`${fnName} - undefined writing key`, async (k) => {
        await k.exception(
            async () => await StateMessageOperations.assembleAddWriterMessage(
                wallet,
                undefined
            ),
            errorMessageIncludes('Writer key must be a 32 length buffer')
        );
    });

}

export async function messageOperationsBkoTest(t, fnName, fn, wallet, writingKey, opType, msgValueLength, expectedMsgKey) {

    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await fn(wallet, expectedMsgKey);
        k.ok(msg, 'Message should be created');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(msg.bko).length, msgValueLength, `Message value should have ${msgValueLength} keys`);

        if (msgValueLength > 2) {
            //k.is(msg.bko.pub, wallet.publicKey, 'Message pub should be the public key of the wallet'); // pub does not exist
            k.ok(b4a.equals(msg.bko.wk, writingKey), 'Message wk should be the writing key');
        }

        k.is(msg.type, opType, `Message type should be ${opType}`);

        k.ok(b4a.equals(msg.key, expectedMsgKey), 'Message key should be the the expected one');
        k.is(msg.bko.nonce.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(msg.bko.nonce), 'Message nonce should be a buffer');
        k.is(msg.bko.sig.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(msg.bko.sig), 'Message signature should be a buffer');
    });

    t.test(`${fnName} - Invalid wallet 1`, async (k) => {
        const msg = await fn({publicKey: b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex')}, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 2`, async (k) => {
        const msg = await fn({publicKey: b4a.from("1234567890abcdef", 'hex')}, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid wallet 3`, async (k) => {
        const msg = await fn({publicKey: b4a.from("", 'hex')}, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null Wallet`, async (k) => {
        const msg = await fn(null, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined Wallet`, async (k) => {
        const msg = await fn(undefined, writingKey);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 1`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 2`, async (k) => {
        const msg = await fn(wallet, b4a.from("1234567890abcdef", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Invalid writing key 3`, async (k) => {
        const msg = await fn(wallet, b4a.from("", 'hex'));
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        const msg = await fn(wallet, null);
        k.is(msg, null, 'Message should be null');
    });

    t.test(`${fnName} - undefined writing key`, async (k) => {
        const msg = await fn(wallet, undefined);
        k.is(msg, null, 'Message should be null');
    });


}