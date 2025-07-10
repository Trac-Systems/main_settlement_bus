import MessageDirector from './MessageDirector.js';
import MessageBuilder from './MessageBuilder.js';
import { safeEncodeApplyOperation } from '../utils/protobuf/operationHelpers.js';
import fileUtils from '../../src/utils/fileUtils.js';
import { OperationType } from '../utils/constants.js';
import { createMessage } from '../utils/buffer.js';
import { createHash } from '../utils/crypto.js';
import { TRAC_NETWORK_PREFIX } from '../utils/constants.js';
import b4a from 'b4a';

class MessageOperations {
    static async assembleAddAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddAdminMessage(adminEntry, writingKey, bootstrap, wallet.publicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble admin message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAddWriterMessage(wallet, writingKey) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddWriterMessage(writingKey, wallet.publicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add writer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveWriterMessage(wallet, writingKey) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveWriterMessage(writingKey, wallet.publicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove writer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAddIndexerMessage(wallet, tracPublicKey) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(tracPublicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add indexer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveIndexerMessage(wallet, tracPublicKey) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveIndexerMessage(tracPublicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove indexer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleAppendWhitelistMessages(wallet) {
        try {

            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const messages = [];
            const pubKeys = await fileUtils.readPublicKeysFromFile(); // TODO: This method should return public keys in Buffer, not string format

            for (const pubKey of pubKeys) {
                const payload = await director.buildAppendWhitelistMessage(b4a.from(pubKey, 'hex'));
                const encodedPayload = safeEncodeApplyOperation(payload);
                messages.push(encodedPayload);
            }

            return messages;

        } catch (error) {
            console.error(`Failed to assemble append whitelist message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    static async assembleBanWriterMessage(wallet, tracPublicKey) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(tracPublicKey);
            const encodedPayload = safeEncodeApplyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble ban writer message via MessageOperations: ${error.message}`);
            return null;
        }
    }

    //todo refactor when all cases are implemented. Missing addAdmin
    //TODO: This method can be simplified.
    static async verifyEventMessage(parsedRequest, wallet, check, state) {
        const { type } = parsedRequest;
        if (
            type !== OperationType.ADD_ADMIN &&
            type !== OperationType.ADD_WRITER &&
            type !== OperationType.REMOVE_WRITER
        ) {
            return false;
        }

        const sanitizationResult = check.sanitizeExtendedKeyOpSchema(parsedRequest);
        if (!sanitizationResult) return false;

        if (type === OperationType.ADD_WRITER) {

            const nodeEntry = await state.getNodeEntry(parsedRequest.key.toString('hex'));
            if (!nodeEntry) return false;

            const isNodeAlreadyWriter = nodeEntry.isWriter;
            const isNodeWhitelisted = nodeEntry.isWhitelisted;
            const canAddWriter = state.isWritable() && !isNodeAlreadyWriter && isNodeWhitelisted;

            if (parsedRequest.key === wallet.address || !canAddWriter) return false;

            const nodeTracAddress = parsedRequest.key
            const networkPrefix = nodeTracAddress.slice(0, 1);
            if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return false;
            const nodePublicKey = nodeTracAddress.slice(1, 33);

            const msg = createMessage(parsedRequest.key, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
            const hash = await createHash('sha256', msg);

            return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
        } else if (type === OperationType.REMOVE_WRITER) {

            const nodeEntry = await state.getNodeEntry(parsedRequest.key.toString('hex'));
            if (!nodeEntry) return false;

            const isAlreadyWriter = nodeEntry.isWriter;
            const canRemoveWriter = state.isWritable() && isAlreadyWriter;
            if (parsedRequest.key === wallet.address || !canRemoveWriter) return false;

            const nodeTracAddress = parsedRequest.key
            const networkPrefix = nodeTracAddress.slice(0, 1);
            if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return false;
            const nodePublicKey = nodeTracAddress.slice(1, 33);

            const msg = createMessage(parsedRequest.key, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
            const hash = await createHash('sha256', msg);

            return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
        }
        else if (type === OperationType.ADD_ADMIN) {
            const adminEntry = await state.getAdminEntry();
            
            const isRecoveryCase = !!(
                adminEntry &&
                b4a.equals(adminEntry.tracAddr, parsedRequest.key) &&
                parsedRequest.eko.wk &&
                !b4a.equals(parsedRequest.eko.wk, adminEntry.wk)
            );
            if (!isRecoveryCase) return false;

            const adminTracAddress = parsedRequest.key
            const networkPrefix = adminTracAddress.slice(0, 1);
            if (networkPrefix.readUInt8(0) !== TRAC_NETWORK_PREFIX) return false;

            const nodePublicKey = adminTracAddress.slice(1, 33);

            const msg = createMessage(adminEntry.tracAddr, parsedRequest.eko.wk, parsedRequest.eko.nonce, parsedRequest.type);
            const hash = await createHash('sha256', msg);
            return wallet.verify(parsedRequest.eko.sig, hash, nodePublicKey);
        }
    }
}

export default MessageOperations;
