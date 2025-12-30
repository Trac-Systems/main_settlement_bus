import test from 'brittle';
import { createApplyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import b4a from 'b4a';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import {isAddressValid} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";
import {randomBytes} from "../../helpers/setupApplyTests.js";
import { config } from '../../helpers/config.js';

const msgTxoLength = 11;
const opType = OperationType.TX;
test('assemblePostTxMessage - ....', async (k) => {
    await fixtures.initAll();
    const nonAdminWallet = fixtures.walletNonAdmin;
    const validatorAddress = nonAdminWallet.address;
    const txHash = randomBytes(32);
    const txValidity = randomBytes(32);

    const incomingWriterKey = randomBytes(32);
    const incomingNonce = randomBytes(32);
    const contentHash = randomBytes(32);
    const incomingSignature = randomBytes(64);
    const externalBootstrap = randomBytes(32);
    const msbBootstrap = randomBytes(32);

    const buildEncodedPostTx = async ({
        wallet = nonAdminWallet,
        invokerAddress = validatorAddress,
        txHash: txHashValue = txHash,
        txValidity: txValidityValue = txValidity,
        incomingWriterKey: incomingWriterKeyValue = incomingWriterKey,
        incomingNonce: incomingNonceValue = incomingNonce,
        contentHash: contentHashValue = contentHash,
        incomingSignature: incomingSignatureValue = incomingSignature,
        externalBootstrap: externalBootstrapValue = externalBootstrap,
        msbBootstrap: msbBootstrapValue = msbBootstrap
    } = {}) => {
        const payload = await createApplyStateMessageFactory(wallet, config)
            .buildCompleteTransactionOperationMessage(
                invokerAddress,
                txHashValue,
                txValidityValue,
                incomingWriterKeyValue,
                incomingNonceValue,
                contentHashValue,
                incomingSignatureValue,
                externalBootstrapValue,
                msbBootstrapValue
            );
        return safeEncodeApplyOperation(payload);
    };

    const decodedPostTx = safeDecodeApplyOperation(await buildEncodedPostTx());
    k.ok(decodedPostTx, 'Message should be created');
    k.is(Object.keys(decodedPostTx).length, 3, 'Message should have 3 keys');
    k.is(Object.keys(decodedPostTx.txo).length, msgTxoLength, `Message value should have ${msgTxoLength} keys`);

    k.is(decodedPostTx.type, opType, `Message type should be ${opType}`);

    k.ok(isAddressValid(decodedPostTx.address, config.addressPrefix), 'Message validator address should be a valid address');
    k.ok(bufferToAddress(decodedPostTx.address, config.addressPrefix) === validatorAddress, 'Message validator address should be the address of the non-admin wallet');

    k.ok(b4a.isBuffer(decodedPostTx.txo.tx), 'tx should be a buffer');
    k.is(decodedPostTx.txo.tx.length, 32, 'tx should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.txv), 'txv should be a buffer');
    k.is(decodedPostTx.txo.txv.length, 32, 'txv should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.iw), 'iw should be a buffer');
    k.is(decodedPostTx.txo.iw.length, 32, 'iw should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.in), 'in should be a buffer');
    k.is(decodedPostTx.txo.in.length, 32, 'in should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.ch), 'ch should be a buffer');
    k.is(decodedPostTx.txo.ch.length, 32, 'ch should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.is), 'is should be a buffer');
    k.is(decodedPostTx.txo.is.length, 64, 'is should be 64 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.bs), 'bs should be a buffer');
    k.is(decodedPostTx.txo.bs.length, 32, 'bs should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.mbs), 'mbs should be a buffer');
    k.is(decodedPostTx.txo.mbs.length, 32, 'mbs should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.vs), 'vs should be a buffer');
    k.is(decodedPostTx.txo.vs.length, 64, 'vs should be 64 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.vn), 'vn should be a buffer');
    k.is(decodedPostTx.txo.vn.length, 32, 'vn should be 32 bytes long');

    k.test(`assemblePostTxMessage - Invalid wallet instance - trac address is to short`, async (k) => {
        const invalidWallet = {
            address: 'trac1y6kkq48fgu3ur'
        }
        await k.exception(
            async () => await buildEncodedPostTx({ wallet: invalidWallet }),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - invalid prefix`, async (k) => {
        const invalidWallet = {
            address: 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk'
        }
        await k.exception(
            async () => await buildEncodedPostTx({ wallet: invalidWallet }),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - empty string`, async (k) => {
        const invalidWallet = {
            address: ''
        }
        await k.exception(
            async () => await buildEncodedPostTx({ wallet: invalidWallet }),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - null Wallet `, async (k) => {
        await k.exception(
            async () => await buildEncodedPostTx({ wallet: null }),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - undefined Wallet`, async (k) => {
        await k.exception(
            async () => await buildEncodedPostTx({ wallet: undefined }),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {

        const invalid = 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką';

        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: invalid }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - trac address is to short`, async (k) => {
        const invalid = 'trac1y6kkq48fgu3ur';

        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: invalid }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage- Address parameter (validator address) - invalid prefix`, async (k) => {
        const invalid = 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk';

        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: invalid }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });


    k.test(`assemblePostTxMessage - Address parameter (validator address) - empty string`, async (k) => {
        const invalid = '';

        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: invalid }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - Null`, async (k) => {

        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: null }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - undefined`, async (k) => {
        await k.exception(
            async () => await buildEncodedPostTx({ invokerAddress: undefined }),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test('assemblePostTxMessage - txValidity - invalid hex chars', async (k) => {
        const invalid = 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką';
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: invalid }),
            errorMessageIncludes('Transaction validity must be a 64-length hexstring')
        );
    });

    k.test('assemblePostTxMessage - txValidity - too short', async (k) => {
        const invalid = 'trac1y6kkq48fgu3ur';
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: invalid }),
            errorMessageIncludes('Transaction validity must be a 64-length hexstring')
        );
    });

    k.test('assemblePostTxMessage - txValidity - invalid prefix', async (k) => {
        const invalid = 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk';
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: invalid }),
            errorMessageIncludes('Transaction validity must be a 64-length hexstring')
        );
    });

    k.test('assemblePostTxMessage - txValidity - empty string', async (k) => {
        const invalid = '';
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: invalid }),
            errorMessageIncludes('Transaction validity must be a 64-length hexstring')
        );
    });

    k.test('assemblePostTxMessage - txValidity - null', async (k) => {
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: null }),
            errorMessageIncludes('Transaction validity must be a 32-byte buffer')
        );
    });

    k.test('assemblePostTxMessage - txValidity - undefined', async (k) => {
        await k.exception(
            async () => await buildEncodedPostTx({ txValidity: undefined }),
            errorMessageIncludes('Transaction validity must be a 32-byte buffer')
        );
    });

    const invalidBufferCases = [
        { name: 'empty buffer', value: b4a.alloc(0) },
        { name: 'null', value: null },
        { name: 'undefined', value: undefined },
    ];
    const bufferParams = [
        { key: 'txValidity', error: 'Transaction validity must be a 32-byte buffer' },
        { key: 'msbBootstrap', error: 'MSB bootstrap must be a 32-byte buffer' },
        { key: 'externalBootstrap', error: 'Bootstrap key must be a 32-byte buffer' },
        { key: 'incomingSignature', error: 'Incoming signature must be a 64-byte buffer' },
        { key: 'contentHash', error: 'Content hash must be a 32-byte buffer' },
        { key: 'incomingNonce', error: 'Incoming nonce must be a 32-byte buffer' },
        { key: 'incomingWriterKey', error: 'Incoming writer key must be a 32-byte buffer' },
        { key: 'txHash', error: 'Transaction hash must be a 32-byte buffer' },
    ];
    for (const param of bufferParams) {
        for (const invalid of invalidBufferCases) {
            k.test(`assemblePostTxMessage - ${param.key} - ${invalid.name}`, async (k) => {
                const args = {
                    msbBootstrap,
                    externalBootstrap,
                    incomingSignature,
                    contentHash,
                    incomingNonce,
                    incomingWriterKey,
                    txHash,
                    txValidity
                };
                args[param.key] = invalid.value;
                await k.exception(
                    async () =>
                        await buildEncodedPostTx({
                            txHash: args.txHash,
                            txValidity: args.txValidity,
                            incomingWriterKey: args.incomingWriterKey,
                            incomingNonce: args.incomingNonce,
                            contentHash: args.contentHash,
                            incomingSignature: args.incomingSignature,
                            externalBootstrap: args.externalBootstrap,
                            msbBootstrap: args.msbBootstrap
                        }),
                    errorMessageIncludes(param.error)
                );
            });
        }
    }

})
