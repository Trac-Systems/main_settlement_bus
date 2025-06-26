import MessageDirector from './MessageDirector.js';
import MessageBuilder from './MessageBuilder.js';
import { safeEncodeAppyOperation } from '../functions.js';

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
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble admin message via MsgUtils: ${error.message}`);
            return null;
        }
    }
    static async assembleAddWriterMessage(writingKey, wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddWriterMessage(writingKey, wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add writer message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveWriterMessage(writingKey, wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveWriterMessage(writingKey, wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove writer message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleAddIndexerMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble add indexer message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleRemoveIndexerMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveIndexerMessage(wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble remove indexer message via MsgUtils: ${error.message}`);
            return null;
        }
    }
    
    static async assembleAppendWhitelistMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAppendWhitelistMessage(wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble append whitelist message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleBanWriterMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(wallet.publicKey);
            const encodedPayload = safeEncodeAppyOperation(payload);
            return encodedPayload;

        } catch (error) {
            console.error(`Failed to assemble ban writer message via MsgUtils: ${error.message}`);
            return null;
        }
    }
    //TODO: verifyEventMessage. This task will require to refactor check.js to support data in bytes.
}

export default MessageOperations;
