import { isHexString, createHash } from './functions.js';
import { OperationType } from './constants.js';
import fileUtils from './fileUtils.js';
import b4a from 'b4a';

// TODO: This class is trying to solve too many problems at once.
//       It is responsible for creating messages, verifying them, reading public keys from a file, etc.
//       It would be better to separate these concerns into different classes or modules.
//       For example, we could have a separate class for file operations, another for message creation, etc.
//       This would make the code more modular and easier to maintain.
//       It would also make it easier to create tests and mocks in the future.
class MsgUtils {
    static generateNonce() {
        return Math.random() + '-' + Date.now(); // TODO: Change it to crypto.randomBytes. Math.random might not be secure enough. It's even better to use nonce generator from sodium. GENERATE NONCE WITH CRYPTO LIBRARY WHICH ALLOW US TO GENERATE IT WITH UNIFORM DISTRIBUTION.
    }

    static createMessage(...args) {
        let buf = null;
        if (args.length >= 1) {
            buf = b4a.concat(
                args.map(arg => b4a.from(arg, isHexString(arg) ? 'hex' : undefined))
            );
        }
        return buf;
    }

    static async #assembleMessageBase(wallet, keyParam, operationType) {
        let nonce = null;
        let msg = null;
        let hash = null;
        let baseKey = wallet.publicKey;
        let value = null;

        switch (operationType) {
            case OperationType.ADD_ADMIN:
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
                nonce = this.generateNonce();
                msg = this.createMessage(wallet.publicKey, keyParam, nonce, operationType);
                hash = await createHash('sha256', msg);
                value = {
                    pub : wallet.publicKey,
                    wk: keyParam,
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;
            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
                nonce = this.generateNonce();
                msg = this.createMessage(keyParam, nonce, operationType);
                hash = await createHash('sha256', msg);
                baseKey = keyParam;
                value = {
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;

            default:
                return undefined;
        }

        return {
            type: operationType,
            key: baseKey,
            value
        };
    }

    static async assembleAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        if ((!adminEntry && wallet && writingKey && writingKey === bootstrap) || // Admin entry doesn't exist yet, thus admin public key can only be associated with bootstrap writing key
            (adminEntry && adminEntry.tracPublicKey === wallet.publicKey && writingKey && writingKey !== adminEntry.wk)) { // Admin entry exists and we have to update its writing key in base, so it can recover admin access

            return await this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_ADMIN);
        }
    }

    static async assembleWhitelistMessages(adminEntry, wallet) {
        try {
            if (!adminEntry || !wallet || wallet.publicKey !== adminEntry.tracPublicKey) {
                return null;
            }

            const messages = [];
            const pubKeys = await fileUtils.readPublicKeysFromFile();

            for (const pubKey of pubKeys) {
                const assembledMessage = await this.#assembleMessageBase(wallet, pubKey, OperationType.APPEND_WHITELIST);
                messages.push(assembledMessage);
            }

            return messages;
        } catch (err) {
            console.log(`Failed to create whitelist messages: ${err.message}`);
        }
    }

    static async assembleAddWriterMessage(wallet, writingKey) {
        return await this.#assembleMessageBase(wallet, writingKey, OperationType.ADD_WRITER);
    }

    static async assembleRemoveWriterMessage(wallet, writingKey) {
        return await this.#assembleMessageBase(wallet, writingKey, OperationType.REMOVE_WRITER);
    }

    static async assembleAddIndexerMessage(wallet, writerTracPublicKey) {
        return await this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.ADD_INDEXER);
    }

    static async assembleRemoveIndexerMessage(wallet, writerTracPublicKey) {
        return await this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.REMOVE_INDEXER);
    }

    static async verifyEventMessage(parsedRequest, wallet) {
        //TODO: Here we can add some sanitization
        const msg = this.createMessage(parsedRequest.key, parsedRequest.value.wk, parsedRequest.value.nonce, parsedRequest.type);
        const hash = await createHash('sha256', msg);
        return wallet.verify(parsedRequest.value.sig, hash, parsedRequest.key);
    }

}

export default MsgUtils;