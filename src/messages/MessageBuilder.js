import Builder from './Builder.js';
import { createHash } from '../utils/crypto.js';
import { createMessage } from '../utils/buffer.js';
import { OperationType } from '../utils/protobuf/applyOperations.cjs'
import b4a from 'b4a';
import Wallet from 'trac-wallet';
import {TRAC_NETWORK_PREFIX} from '../utils/constants.js';


class MessageBuilder extends Builder {
    #wallet;
    #operationType;
    #tracPublicKey;
    #writingKey;
    #bootstrap;
    #adminEntry;
    #payload;
    #networkPrefix;

    constructor(wallet, networkPrefix = TRAC_NETWORK_PREFIX) {
        super();
        if (!wallet || typeof wallet !== 'object' || !b4a.isBuffer(wallet.publicKey)) {
            throw new Error('MessageBuilder requires a valid Wallet instance with a 32-byte public key Buffer.');
        }
        this.#wallet = wallet;
        this.#networkPrefix = networkPrefix;
        this.reset();
    }

    reset() {
        this.#operationType = OperationType.UNKNOWN;
        this.#tracPublicKey = null;
        this.#writingKey = null;
        this.#bootstrap = null;
        this.#adminEntry = null;
        this.#payload = {}
        this.#networkPrefix = TRAC_NETWORK_PREFIX;
    }

    forOperationType(operationType) {
        if (!Object.values(OperationType).includes(operationType) || OperationType === OperationType.UNKNOWN) {
            throw new Error(`Invalid operation type: ${operationType}`);
        }
        this.#operationType = operationType;
        this.#payload.type = operationType;
        return this;
    }

    withTracPubKey(publicKey) {
        if (!b4a.isBuffer(publicKey) || publicKey.length !== 32) {
            throw new Error('Key parameter must be a 32 length buffer.');

        }
        this.#tracPublicKey = b4a.from([this.#networkPrefix, ...publicKey]);
        this.#payload.key = this.#tracPublicKey;

        return this;
    }

    withWriterKey(writingKey) {
        if (!b4a.isBuffer(writingKey) || writingKey.length !== 32) {
            throw new Error('Writer key must be a 32 length buffer.');
        }
        this.#writingKey = writingKey;
        this.#payload.wk = writingKey;
        return this;
    }

    withBootstrap(bootstrap) {
        if (!b4a.isBuffer(bootstrap) || bootstrap.length !== 32) {
            throw new Error('Bootstrap key must be a 32 length buffer.');
        }
        this.#bootstrap = bootstrap;
        return this;
    }

    withAdminEntry(adminEntry) {
        this.#adminEntry = adminEntry;
        return this;
    }

    async buildValueAndSign() {
        const wallet = this.#wallet;
        const operationType = this.#operationType;
        const tracPublicKey = this.#tracPublicKey;
        const writingKey = this.#writingKey;
        const bootstrap = this.#bootstrap;
        const adminEntry = this.#adminEntry;
        
        // writer key is not required for all operations, but it is required for some...
        if (!operationType || !tracPublicKey) {
            throw new Error('Operation type, trac public key must be set before building the message.');
        }

        // for now we assume post_tx operation is not supported by this MessageBuilder
        if (operationType === OperationType.POST_TX) {
            throw new Error('PostTxOperation is not supported by this MessageBuilder');
        }

        if (operationType === OperationType.UNKNOWN) {
            throw new Error('UNKNOWN is not allowed to construct');
        }

        const nonce = Wallet.generateNonce();

        let msg = null;
        let value = null;
        let hash = null;
        let signature = null;

        switch (operationType) {
            case OperationType.ADD_ADMIN:
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
                if (!writingKey) {
                    throw new Error('Writer key must be set for writer operations (ADD_WRITER REMOVE_WRITER or ADD_ADMIN operation).');
                }
                msg = createMessage(tracPublicKey, writingKey, nonce, operationType);
                break;

            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_WRITER:
                msg = createMessage(tracPublicKey, nonce, operationType);
                break;
            default:
                throw new Error(`Unsupported operation type for building value: ${OperationType[operationType]}.`);
        }

        hash = await createHash('sha256', msg);
        signature = wallet.sign(hash);

        if (this.#isExtended(operationType)) {
            value = {
                wk: writingKey,
                nonce: nonce,
                sig: signature
            }
            this.#payload.eko = value;
        } else if (this.#isBasic(operationType)) {
            value = {
                nonce: nonce,
                sig: signature
            }
            this.#payload.bko = value;
        } else {
            throw new Error(`No corresponding value type for operation: ${OperationType[operationType]}.`);
        }

        return this;
    }

    #isExtended(type) {
        return [
            OperationType.ADD_ADMIN,
            OperationType.ADD_WRITER,
            OperationType.REMOVE_WRITER
        ].includes(type);
    };

    #isBasic(type) {
        return [
            OperationType.APPEND_WHITELIST,
            OperationType.ADD_INDEXER,
            OperationType.REMOVE_INDEXER,
            OperationType.BAN_WRITER
        ].includes(type);
    };

    getPayload() {
        if (!this.#payload.type || !this.#payload.key || (!this.#payload.bko && !this.#payload.eko)) {
            throw new Error('Product is not fully assembled. Missing type, key, or value (bko/eko).');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default MessageBuilder;
