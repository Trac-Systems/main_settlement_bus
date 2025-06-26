import MessageDirector from './messageDirector.js';
import MessageBuilder from './messageBuilder.js';
import { safeEncodeAppyOperation } from '../functions.js';
//facade
class MsgUtils {
    static async assembleAddAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;
            const payload = await director.buildAddAdminMessage(adminEntry, writingKey, bootstrap, wallet.publicKey);
            console.log("assembleAddAdminMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

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
            console.log("assembleAddWriterMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

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
            console.log("assembleRemoveWriterMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

        } catch (error) {
            console.error(`Failed to assemble add writer message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleAddIndexerMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(wallet.publicKey);
            console.log("assembleAddIndexerMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

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
            console.log("assembleRemoveIndexerMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

        } catch (error) {
            console.error(`Failed to assemble add indexer message via MsgUtils: ${error.message}`);
            return null;
        }
    }
    
    static async assembleAppendWhitelistMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildAppendWhitelistMessage(wallet.publicKey);
            console.log("assembleAppendWhitelistMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

        } catch (error) {
            console.error(`Failed to assemble add indexer message via MsgUtils: ${error.message}`);
            return null;
        }
    }

    static async assembleBanWriterMessage(wallet) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(wallet.publicKey);
            console.log("assembleAppendWhitelistMessage payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);

        } catch (error) {
            console.error(`Failed to assemble add indexer message via MsgUtils: ${error.message}`);
            return null;
        }
    }
}

export default MsgUtils;