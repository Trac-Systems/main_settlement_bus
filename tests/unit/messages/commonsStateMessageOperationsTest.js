import b4a from 'b4a';
import { OperationType } from "../../src/utils/constants.js";
import { bufferToAddress, isAddressValid } from "../../src/core/state/utils/address.js";
import { errorMessageIncludes } from "../utils/regexHelper.js"
import { config } from '../../helpers/config.js'

const payloadKeyForOperation = opType => {
    if ([OperationType.ADD_ADMIN, OperationType.DISABLE_INITIALIZATION].includes(opType)) return 'cao';
    if ([OperationType.ADD_WRITER, OperationType.REMOVE_WRITER, OperationType.ADMIN_RECOVERY].includes(opType)) return 'rao';
    if ([OperationType.APPEND_WHITELIST, OperationType.ADD_INDEXER, OperationType.REMOVE_INDEXER, OperationType.BAN_VALIDATOR].includes(opType)) return 'aco';
    if (OperationType.BALANCE_INITIALIZATION === opType) return 'bio';
    if (OperationType.TRANSFER === opType) return 'tro';
    if (OperationType.TX === opType) return 'txo';
    if (OperationType.BOOTSTRAP_DEPLOYMENT === opType) return 'bdo';
    return null;
};

export async function messageOperationsEkoTest(t, fnName, assembler, wallet, writingKey, opType, msgValueLength, expectedMessageAddress) {
    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await assembler(wallet, writingKey);
        const payloadKey = payloadKeyForOperation(opType);
        const value = msg?.[payloadKey];
        k.ok(msg, 'Message should be created');
        k.ok(value, 'Message value should be set');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(value).length, msgValueLength, `Message value should have ${msgValueLength} keys`);

        k.is(msg.type, opType, `Message type should be ${opType}`);

        if (value.iw) {
            k.ok(b4a.equals(value.iw, writingKey), 'Message iw should be the writing key');
        }

        k.ok(bufferToAddress(msg.address, config.addressPrefix) === expectedMessageAddress, 'Message key should be the the expected one');
        k.ok(isAddressValid(msg.address, config.addressPrefix), 'Message address should be a valid address');

        if (payloadKey === 'rao') {
            k.is(value.in.length, 32, 'Message incoming nonce should be 32 bytes long');
            k.ok(b4a.isBuffer(value.in), 'Message incoming nonce should be a buffer');
            k.is(value.is.length, 64, 'Message incoming signature should be 64 bytes long');
            k.ok(b4a.isBuffer(value.is), 'Message incoming signature should be a buffer');
            k.is(value.vn.length, 32, 'Message validator nonce should be 32 bytes long');
            k.ok(b4a.isBuffer(value.vn), 'Message validator nonce should be a buffer');
            k.is(value.vs.length, 64, 'Message validator signature should be 64 bytes long');
            k.ok(b4a.isBuffer(value.vs), 'Message validator signature should be a buffer');
            const validatorAddress = bufferToAddress(value.va, config.addressPrefix);
            k.is(validatorAddress, wallet.address, 'Message validator address should match wallet');
        } else if (payloadKey === 'cao') {
            k.is(value.in.length, 32, 'Message nonce should be 32 bytes long');
            k.ok(b4a.isBuffer(value.in), 'Message nonce should be a buffer');
            k.is(value.is.length, 64, 'Message signature should be 64 bytes long');
            k.ok(b4a.isBuffer(value.is), 'Message signature should be a buffer');
        }
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
    //
    // //TODO: fix -  works on node, but not on bare.
    //
    //
    // t.test(`${fnName} - Invalid writing key - not hex`, async (k) => {
    //     try {
    //         const invalidHexKey = b4a.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg", 'hex');
    //         await k.exception(
    //             async () => await assembler(wallet, invalidHexKey),
    //             errorMessageIncludes('Writer key must be a 32 length buffer')
    //         );
    //     } catch (error) {
    //         k.pass('Invalid hex string was rejected');
    //     }
    // });


    t.test(`${fnName} - Invalid writing key -  invalid length`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                b4a.from("1234567890a", 'hex')
            ),
            errorMessageIncludes('Incoming writer key must be a 32-byte buffer')
        );
    });


    t.test(`${fnName} - Invalid writing key - empty buffer`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                b4a.alloc(0)
            ),
            errorMessageIncludes('Incoming writer key must be a 32-byte buffer')
        );
    });

    t.test(`${fnName} - Null writing key`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                null
            ),
            errorMessageIncludes('Incoming writer key must be a 32-byte buffer')
        );
    });


    t.test(`${fnName} - undefined writing key`, async (k) => {
        await k.exception(
            async () => await assembler(
                wallet,
                undefined
            ),
            errorMessageIncludes('Incoming writer key must be a 32-byte buffer')
        );
    });

}

export async function messageOperationsBkoTest(t, fnName, assembler, wallet, writingKey, opType, msgValueLength, expectedMessageAddress) {

    t.test(`${fnName} - Happy Path`, async (k) => {
        const msg = await assembler(wallet, expectedMessageAddress);
        const payloadKey = payloadKeyForOperation(opType);
        const value = msg?.[payloadKey];

        k.ok(msg, 'Message should be created');
        k.ok(value, 'Message value should be set');
        k.is(Object.keys(msg).length, 3, 'Message should have 3 keys');
        k.is(Object.keys(value).length, msgValueLength, `Message value should have ${msgValueLength} keys`);


        k.is(msg.type, opType, `Message type should be ${opType}`);

        k.ok(bufferToAddress(msg.address, config.addressPrefix) === wallet.address, 'Message address should be the admin address');
        k.ok(bufferToAddress(value.ia, config.addressPrefix) === expectedMessageAddress, 'Message incoming address should match');
        k.is(value.in.length, 32, 'Message nonce should be 32 bytes long');
        k.ok(b4a.isBuffer(value.in), 'Message nonce should be a buffer');
        k.is(value.is.length, 64, 'Message signature should be 64 bytes long');
        k.ok(b4a.isBuffer(value.is), 'Message signature should be a buffer');
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

}
