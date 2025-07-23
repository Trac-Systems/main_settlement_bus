import StateMessageDirector from './StateMessageDirector.js';
import StateMessageBuilder from './StateMessageBuilder.js';
import { safeEncodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import fileUtils from '../../../src/utils/fileUtils.js';
import { OperationType } from '../../utils/constants.js';
import { createMessage } from '../../utils/buffer.js';
import { createHash } from '../../utils/crypto.js';
import b4a from 'b4a';
import PeerWallet from 'trac-wallet';
import ApplyOperationEncodings from '../../core/state/ApplyOperationEncodings.js';

class StateMessageOperations {
    static async assembleAddAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddAdminMessage(adminEntry, writingKey, bootstrap, wallet.address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble admin message through MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAddWriterMessage(wallet, writingKey) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddWriterMessage(writingKey, wallet.address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add writer message through MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveWriterMessage(wallet, writingKey) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveWriterMessage(writingKey, wallet.address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove writer message through MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAddIndexerMessage(wallet, address) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add indexer message through MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveIndexerMessage(wallet, address) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveIndexerMessage(address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove indexer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAppendWhitelistMessages(wallet) {
        try {

            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const messages = new Map();
            const addresses = await fileUtils.readPublicKeysFromFile();

            for (const address of addresses) {
                const payload = await director.buildAppendWhitelistMessage(address);
                const encodedPayload = safeEncodeApplyOperation(payload);
                messages.set(address, encodedPayload);
            }
            return messages;
        } catch (error) {
            console.error(`Failed to assemble append whitelist message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleBanWriterMessage(wallet, address) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(address);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble ban writer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assemblePostTxMessage(wallet, validatorAddress, txHash, incomingAddress, incomingWriterKey, incomingNonce, contentHash, incomingSignature, externalBootstrap, msbBootstrap) {
        try {
            const builder = new StateMessageBuilder(wallet);
            const director = new StateMessageDirector();
            director.builder = builder;
            const payload = await director.buildPostTxMessage(
                validatorAddress,
                txHash,
                incomingAddress,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap
            );
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble pre-transaction message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    //TODO: This method can be simplified and moved to another module responsible for message verification.
    static async verifyEventMessage(parsedRequest, wallet, check, state) {
        try {
            const { type } = parsedRequest;
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
                const nodeAddress = ApplyOperationEncodings.bufferToAddress(parsedRequest.address);
                if (nodeAddress === null) return false;

                const nodeEntry = await state.getNodeEntry(nodeAddress);
                if (!nodeEntry) return false;

                const isNodeAlreadyWriter = nodeEntry.isWriter;
                const isNodeWhitelisted = nodeEntry.isWhitelisted;
                const canAddWriter = state.isWritable() && !isNodeAlreadyWriter && isNodeWhitelisted;

                if (parsedRequest.address === wallet.address || !canAddWriter) return false;

                const nodePublicKey = PeerWallet.decodeBech32m(nodeAddress);

                const msg = createMessage(parsedRequest.address, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await createHash('sha256', msg);

                return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
            } else if (type === OperationType.REMOVE_WRITER) {
                const nodeAddress = ApplyOperationEncodings.bufferToAddress(parsedRequest.address);
                if (nodeAddress === null) return false;

                const nodeEntry = await state.getNodeEntry(nodeAddress);
                if (!nodeEntry) return false;

                const isAlreadyWriter = nodeEntry.isWriter;
                const canRemoveWriter = state.isWritable() && isAlreadyWriter;
                if (nodeAddress === wallet.address || !canRemoveWriter) return false;

                const nodePublicKey = PeerWallet.decodeBech32m(nodeAddress);

                const msg = createMessage(parsedRequest.address, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await createHash('sha256', msg);

                return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
            }
            else if (type === OperationType.ADD_ADMIN) {
                const adminEntry = await state.getAdminEntry();
                if (!adminEntry) return false;
                const adminAddressBuffer = parsedRequest.address;
                const adminAddress = ApplyOperationEncodings.bufferToAddress(adminAddressBuffer);
                if (adminAddress === null) return false;

                const isRecoveryCase = !!(
                    adminEntry.tracAddr === adminAddress &&
                    parsedRequest.eko.wk &&
                    !b4a.equals(parsedRequest.eko.wk, adminEntry.wk)
                );
                if (!isRecoveryCase) return false;

                const incomingAdminPublicKey = PeerWallet.decodeBech32m(adminAddress);

                const msg = createMessage(adminAddressBuffer, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
                const hash = await createHash('sha256', msg);
                return wallet.verify(parsedRequest.eko.sig, hash, incomingAdminPublicKey);
            }
        } catch (error) {
            console.error(`Failed to verify event message: ${error.message}`);
            return false;
        }
    }
}

export default StateMessageOperations;
