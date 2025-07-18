import { isHexString } from './helpers.js';
import { createHash } from './crypto.js';
import { OperationType } from './constants.js';
import fileUtils from './fileUtils.js';
import b4a from 'b4a';
import Wallet from 'trac-wallet';

// TODO: Legacy class kept for backward compatibility – to be deleted after full protobuf migration.
class MsgUtils {

    static createMessage(...args) {
        let buf = null;
        if (args.length >= 1) {
            buf = b4a.concat(
                args.map(arg => b4a.from(arg, isHexString(arg) ? 'hex' : undefined))
            );
        }
        return buf;
    }

    // TODO: Move part of this logic into check.js after we reach consensus on how to manage addresses
    static #checkAssembleMessageBaseParams(wallet, keyParam) {
        return !((!wallet || !keyParam) ||
            (typeof wallet !== 'object') ||
            (typeof keyParam !== 'string') ||
            (keyParam.length !== 64) ||
            (!isHexString(keyParam)) ||
            (!wallet.publicKey) ||
            (wallet.publicKey.length !== 64) ||
            (!isHexString(wallet.publicKey)));
    }


    static async #assembleMessageBase(wallet, keyParam, operationType) {
        if (!this.#checkAssembleMessageBaseParams(wallet, keyParam)) {
            return null;
        }

        let nonce = null;
        let msg = null;
        let hash = null;
        let baseKey = null;
        let value = null;

        switch (operationType) {
            case OperationType.ADD_ADMIN:
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
                nonce = Wallet.generateNonce().toString('hex');
                msg = this.createMessage(wallet.publicKey, keyParam, nonce, operationType);
                hash = await createHash('sha256', msg);
                baseKey = wallet.publicKey;
                value = {
                    pub: wallet.publicKey,
                    wk: keyParam,
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;
            case OperationType.APPEND_WHITELIST:
            case OperationType.WHITELISTED:
            case OperationType.BAN_VALIDATOR:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
                nonce = Wallet.generateNonce().toString('hex');
                msg = this.createMessage(keyParam, nonce, operationType);
                hash = await createHash('sha256', msg);
                baseKey = keyParam;
                value = {
                    nonce: nonce,
                    sig: wallet.sign(hash)
                };
                break;

            default:
                return null;
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
            if (!adminEntry || !wallet || !adminEntry.tracPublicKey || !wallet.publicKey || wallet.publicKey !== adminEntry.tracPublicKey) {
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

    static async assembleBanValidatorMessage(wallet, writerTracPublicKey) {
        return await this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.BAN_VALIDATOR);
    }

    static async assembleWhitelistedMessage(wallet, writerTracPublicKey) {
        return await this.#assembleMessageBase(wallet, writerTracPublicKey, OperationType.WHITELISTED);
    }

}

export default MsgUtils;
