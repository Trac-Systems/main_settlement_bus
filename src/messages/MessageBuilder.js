import Builder from './Builder.js';
import { createHash } from '../utils/crypto.js';
import { createMessage } from '../utils/buffer.js';
import { OperationType } from '../utils/protobuf/applyOperations.cjs'
import b4a from 'b4a';
import Wallet from 'trac-wallet';
import { TRAC_ADDRESS_SIZE, addressToBuffer } from '../core/state/ApplyOperationEncodings.js';

class MessageBuilder extends Builder {
    #wallet;
    #operationType;
    #tracAddress;
    #writingKey;
    #bootstrap;
    #adminEntry;
    #payload;

    constructor(wallet) {
        super();
        if (!wallet || typeof wallet !== 'object' || !b4a.isBuffer(wallet.publicKey)) {
            throw new Error('MessageBuilder requires a valid Wallet instance with a 32-byte public key Buffer.');
        }
        this.#wallet = wallet;
        this.reset();
    }

    reset() {
        this.#operationType = OperationType.UNKNOWN;
        this.#tracAddress = null;
        this.#writingKey = null;
        this.#bootstrap = null;
        this.#adminEntry = null;
        this.#payload = {}
    }

    forOperationType(operationType) {
        if (!Object.values(OperationType).includes(operationType) || OperationType === OperationType.UNKNOWN) {
            throw new Error(`Invalid operation type: ${operationType}`);
        }
        this.#operationType = operationType;
        this.#payload.type = operationType;
        return this;
    }

    withTracAddress(address) {
        if (!(typeof address === 'string') || address.length !== TRAC_ADDRESS_SIZE) {
            throw new Error(`Address must be a ${TRAC_ADDRESS_SIZE} length buffer.`);
        }
        this.#tracAddress =  addressToBuffer(address);
        this.#payload.address = this.#tracAddress;

        return this;
    }

    withWriterKey(writingKey) {
        if (!b4a.isBuffer(writingKey) || writingKey.length !== 32) {
            throw new Error('Writer key must be a 32 length buffer.');
        }
        this.#writingKey = writingKey;
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
        const tracAddress = this.#tracAddress;
        const writingKey = this.#writingKey;
        
        // writer key is not required for all operations, but it is required for some...
        if (!operationType || !tracAddress) {
            throw new Error('Operation type, trac address must be set before building the message.');
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
                msg = createMessage(tracAddress, writingKey, nonce, operationType);
                break;

            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_WRITER:
                msg = createMessage(tracAddress, nonce, operationType);
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
        if (!this.#payload.type || !this.#payload.address || (!this.#payload.bko && !this.#payload.eko)) {
            throw new Error('Product is not fully assembled. Missing type, address, or value (bko/eko).');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default MessageBuilder;
