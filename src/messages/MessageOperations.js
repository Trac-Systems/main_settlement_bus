import MessageDirector from './MessageDirector.js';
import MessageBuilder from './MessageBuilder.js';
import { safeEncodeApplyOperation } from '../utils/protobuf/operationHelpers.js';
import fileUtils from '../fileUtils.js';
import b4a from 'b4a';
/*
    This module won't work properly as long as createHash returns string. 
*/
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
                console.log(`payload ${payload}`);
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
    
    //TODO: verifyEventMessage. This task will require to refactor check.js to support data in bytes.
    static async verifyEventMessage() {
        //TODO!
    }
}

export default MessageOperations;
