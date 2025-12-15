import test from 'brittle';
import CompleteStateMessageOperations from '../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import {default as fixtures} from '../fixtures/assembleMessage.fixtures.js';
import {OperationType} from "../../src/utils/constants.js";
import {bufferToAddress} from "../../src/core/state/utils/address.js";
import b4a from 'b4a';
import {safeDecodeApplyOperation} from '../../src/utils/protobuf/operationHelpers.js';
import {isAddressValid} from "../../src/core/state/utils/address.js";
import {errorMessageIncludes} from "../utils/regexHelper.js";
import {randomBytes} from "../../helpers/setupApplyTests.js";
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

const msgTxoLength = 10;
const opType = OperationType.TX;
test('assemblePostTxMessage - ....', async (k) => {
    await fixtures.initAll();
    const nonAdminWallet = fixtures.walletNonAdmin;
    const peerWallet = fixtures.walletPeer;
    const validatorAddress = nonAdminWallet.address;
    const txHash = randomBytes(32);
    const incomingAddress = peerWallet.address;

    const incomingWriterKey = randomBytes(32);
    const incomingNonce = randomBytes(32);
    const contentHash = randomBytes(32);
    const incomingSignature = randomBytes(64);
    const externalBootstrap = randomBytes(32);
    const msbBootstrap = randomBytes(32);

    const decodedPostTx = safeDecodeApplyOperation(await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
        nonAdminWallet,
        validatorAddress,
        txHash,
        incomingAddress,
        incomingWriterKey,
        incomingNonce,
        contentHash,
        incomingSignature,
        externalBootstrap,
        msbBootstrap
    ));
    k.ok(decodedPostTx, 'Message should be created');
    k.is(Object.keys(decodedPostTx).length, 3, 'Message should have 3 keys');
    k.is(Object.keys(decodedPostTx.txo).length, msgTxoLength, `Message value should have ${msgTxoLength} keys`);

    k.is(decodedPostTx.type, opType, `Message type should be ${opType}`);

    k.ok(isAddressValid(decodedPostTx.address, TRAC_NETWORK_MSB_MAINNET_PREFIX), 'Message validator address should be a valid address');
    k.ok(isAddressValid(decodedPostTx.txo.ia, TRAC_NETWORK_MSB_MAINNET_PREFIX), 'Message incoming address should be a valid address');

    k.ok(bufferToAddress(decodedPostTx.txo.ia, TRAC_NETWORK_MSB_MAINNET_PREFIX) === incomingAddress, 'Message incoming address should be the address of the peer wallet');
    k.ok(bufferToAddress(decodedPostTx.address, TRAC_NETWORK_MSB_MAINNET_PREFIX) === validatorAddress, 'Message validator address should be the address of the non-admin wallet');

    k.ok(b4a.isBuffer(decodedPostTx.txo.tx), 'tx should be a buffer');
    k.is(decodedPostTx.txo.tx.length, 32, 'tx should be 32 bytes long');
    k.ok(b4a.isBuffer(decodedPostTx.txo.ia), 'ia should be a buffer');
    k.is(decodedPostTx.txo.ia.length, 63, 'ia should be 63 bytes long');
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
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                invalidWallet,
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - invalid prefix`, async (k) => {
        const invalidWallet = {
            address: 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk'
        }
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                invalidWallet,
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - empty string`, async (k) => {
        const invalidWallet = {
            address: ''
        }
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                invalidWallet,
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Wallet should have a valid TRAC address')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - null Wallet `, async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                null,
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    k.test(`assemblePostTxMessage - Invalid wallet instance - undefined Wallet`, async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                undefined,
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Wallet must be a valid wallet object')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {

        const invalid = 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką';

        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                invalid,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - trac address is to short`, async (k) => {
        const invalid = 'trac1y6kkq48fgu3ur';

        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                invalid,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage- Address parameter (validator address) - invalid prefix`, async (k) => {
        const invalid = 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk';

        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                invalid,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });


    k.test(`assemblePostTxMessage - Address parameter (validator address) - empty string`, async (k) => {
        const invalid = '';

        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                invalid,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - Null`, async (k) => {

        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                null,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (validator address) - undefined`, async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                undefined,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Address field must be a valid TRAC bech32m address with length 63')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (incoming address) - 'ą' does not belongs to the TRAC bench alphabet`, async (k) => {
        const invalid = 'trac1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljką';
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress, // correct validator address
                txHash,
                invalid, // invalid incoming address
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (incoming address) - trac address is to short`, async (k) => {
        const invalid = 'trac1y6kkq48fgu3ur';
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress,
                txHash,
                invalid,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ),
            errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    k.test(`assemblePostTxMessage- Address parameter (incoming address) - invalid prefix`, async (k) => {
        const invalid = 'testnet1y6kkq48fgu3urrhg0gm7h8zdyxl3gnaazd2u7568lfl5zxqs285q6kuljk';
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress,
                txHash,
                invalid,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (incoming address) - empty string`, async (k) => {
        const invalid = '';
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress,
                txHash,
                invalid,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (incoming address) - Null`, async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress,
                txHash,
                null,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    k.test(`assemblePostTxMessage - Address parameter (incoming address) - undefined`, async (k) => {
        await k.exception(
            async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                nonAdminWallet,
                validatorAddress,
                txHash,
                undefined,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            ), errorMessageIncludes('Incoming address must be a 63 length string')
        );
    });

    const invalidBufferCases = [
        { name: 'empty buffer', value: b4a.alloc(0) },
        { name: 'null', value: null },
        { name: 'undefined', value: undefined },
    ];
    const bufferParams = [
        { key: 'msbBootstrap', error: 'MSB bootstrap must be a 32-byte buffer.' },
        { key: 'externalBootstrap', error: 'Bootstrap key must be a 32-byte buffer.' },
        { key: 'incomingSignature', error: 'Incoming signature must be a 64-byte buffer.' },
        { key: 'contentHash', error: 'Content hash must be a 32-byte buffer.' },
        { key: 'incomingNonce', error: 'Incoming nonce must be a 32-byte buffer.' },
        { key: 'incomingWriterKey', error: 'Incoming writer key must be a 32-byte buffer.' },
        { key: 'txHash', error: 'Transaction hash must be a 32-byte buffer.' },
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
                    txHash
                };
                args[param.key] = invalid.value;
                await k.exception(
                    async () => await CompleteStateMessageOperations.assembleCompleteTransactionOperationMessage(
                        nonAdminWallet,
                        validatorAddress,
                        args.txHash,
                        incomingAddress,
                        args.incomingWriterKey,
                        args.incomingNonce,
                        args.contentHash,
                        args.incomingSignature,
                        args.externalBootstrap,
                        args.msbBootstrap
                    ),
                    errorMessageIncludes(param.error)
                );
            });
        }
    }

})
