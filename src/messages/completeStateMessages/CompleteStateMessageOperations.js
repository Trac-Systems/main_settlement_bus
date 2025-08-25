import PeerWallet from 'trac-wallet';
import b4a from 'b4a';

import CompleteStateMessageDirector from './CompleteStateMessageDirector.js';
import CompleteStateMessageBuilder from './CompleteStateMessageBuilder.js';
import {safeEncodeApplyOperation} from '../../utils/protobuf/operationHelpers.js';
import fileUtils from '../../../src/utils/fileUtils.js';
import {OperationType} from '../../utils/constants.js';
import {createMessage} from '../../utils/buffer.js';
import {bufferToAddress} from '../../core/state/utils/address.js';
import {blake3Hash} from '../../utils/crypto.js';

class CompleteStateMessageOperations {

    static async assembleAddAdminMessage(wallet, writingKey, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddAdminMessage(wallet.address, writingKey, txValidity);
            console.log(payload)
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble admin message: ${error.message}`);
        }
    }

    static async assembleAddWriterMessage(wallet, writingKey, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddWriterMessage(wallet.address, writingKey, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble add writer message: ${error.message}`);
        }
    }

    static async assembleRemoveWriterMessage(wallet, writingKey) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveWriterMessage(wallet.address, writingKey);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble remove writer message: ${error.message}`);
        }
    }

    static async assembleAddIndexerMessage(wallet, address) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(address);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble addIndexerMessage: ${error.message}`);
        }
    }

    static async assembleRemoveIndexerMessage(wallet, address) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveIndexerMessage(address);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble removeIndexerMessage: ${error.message}`);
        }
    }

    static async assembleAppendWhitelistMessages(wallet, txValidity) {
        try {

            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const messages = new Map();
            const addresses = await fileUtils.readPublicKeysFromFile();

            for (const addressToWhitelist of addresses) {
                const payload = await director.buildAppendWhitelistMessage(wallet.address, addressToWhitelist, txValidity);
                const encodedPayload = safeEncodeApplyOperation(payload);
                messages.set(addressToWhitelist, encodedPayload);
            }
            return messages;
        } catch (error) {
            throw new Error(`Failed to assemble appendWhitelistMessages: ${error.message}`);
        }
    }

    static async assembleBanWriterMessage(wallet, address) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(address);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble ban writer message: ${error.message}`);
        }
    }

    static async assembleCompleteTransactionOperationMessage(
        wallet,
        invokerAddress,
        txHash,
        txValidity,
        incomingWriterKey,
        incomingNonce,
        contentHash,
        incomingSignature,
        externalBootstrap,
        msbBootstrap
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;
            const payload = await director.buildTransactionOperationMessage(
                invokerAddress,
                txHash,
                txValidity,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap,
            );
            console.log(payload)
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble transaction Operation: ${error.message}`);
        }
    }

    static async assembleCompleteBootstrapDeployment(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        externalBootstrap,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildBootstrapDeploymentMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                externalBootstrap,
                incomingNonce,
                incomingSignature,
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble ban writer message: ${error.message}`);
        }
    }

    //TODO: This method can be simplified and moved to another module responsible for message verification.
    static async verifyEventMessage(parsedRequest, wallet, check, state) {
        try {
            const {type} = parsedRequest;
            if (
                type !== OperationType.ADD_ADMIN &&
                type !== OperationType.ADD_WRITER &&
                type !== OperationType.REMOVE_WRITER
            ) {
                return false;
            }

            const validationResult = check.validateExtendedKeyOpSchema(parsedRequest);
            if (!validationResult) return false;

            if (type === OperationType.ADD_WRITER) {
                const nodeAddress = bufferToAddress(parsedRequest.address);
                if (nodeAddress === null) return false;

                const nodeEntry = await state.getNodeEntry(nodeAddress);
                if (!nodeEntry) return false;

                const isNodeAlreadyWriter = nodeEntry.isWriter;
                const isNodeWhitelisted = nodeEntry.isWhitelisted;
                const canAddWriter = state.isWritable() && !isNodeAlreadyWriter && isNodeWhitelisted;

                if (parsedRequest.address === wallet.address || !canAddWriter) return false;

                const nodePublicKey = PeerWallet.decodeBech32m(nodeAddress);

                const msg = createMessage(parsedRequest.address, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await blake3Hash(msg);

                return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
            } else if (type === OperationType.REMOVE_WRITER) {
                const nodeAddress = bufferToAddress(parsedRequest.address);
                if (nodeAddress === null) return false;

                const nodeEntry = await state.getNodeEntry(nodeAddress);
                if (!nodeEntry) return false;

                const isAlreadyWriter = nodeEntry.isWriter;
                const canRemoveWriter = state.isWritable() && isAlreadyWriter;
                if (nodeAddress === wallet.address || !canRemoveWriter) return false;

                const nodePublicKey = PeerWallet.decodeBech32m(nodeAddress);

                const msg = createMessage(parsedRequest.address, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await blake3Hash(msg);

                return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
            } else if (type === OperationType.ADD_ADMIN) {
                const adminEntry = await state.getAdminEntry();
                if (!adminEntry) return false;
                const adminAddressBuffer = parsedRequest.address;
                const adminAddress = bufferToAddress(adminAddressBuffer);
                if (adminAddress === null) return false;

                const isRecoveryCase = !!(
                    adminEntry.address === adminAddress &&
                    parsedRequest.eko.wk &&
                    !b4a.equals(parsedRequest.eko.wk, adminEntry.wk)
                );
                if (!isRecoveryCase) return false;

                const incomingAdminPublicKey = PeerWallet.decodeBech32m(adminAddress);

                const msg = createMessage(adminAddressBuffer, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await blake3Hash(msg);
                return wallet.verify(parsedRequest.eko.sig, hash, incomingAdminPublicKey);
            }
        } catch (error) {
            console.error(`Failed to verify event message: ${error.message}`);
            return false;
        }
    }

}

export default CompleteStateMessageOperations;
