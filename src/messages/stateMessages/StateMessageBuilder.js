import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Builder from './Builder.js';
import {createHash} from '../../utils/crypto.js';
import {createMessage} from '../../utils/buffer.js';
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'
import {addressToBuffer, bufferToAddress} from '../../core/state/utils/address.js';
import {TRAC_ADDRESS_SIZE} from 'trac-wallet/constants.js';
import {isAddressValid} from "../../core/state/utils/address.js";

class StateMessageBuilder extends Builder {
    #wallet;
    #operationType;
    #address;
    #writingKey;
    #payload;
    #txHash;
    #incomingAddress;
    #incomingWriterKey;
    #incomingNonce;
    #contentHash;
    #incomingSignature;
    #externalBootstrap;
    #msbBootstrap;
    #validatorNonce;

    constructor(wallet) {
        super();
        if (!wallet || typeof wallet !== 'object') {
            throw new Error('Wallet must be a valid wallet object');
        }
        if (!isAddressValid(wallet.address)) {
            throw new Error('Wallet should have a valid TRAC address.');
        }


        this.#wallet = wallet;
        this.reset();
    }

    reset() {
        this.#operationType = OperationType.UNKNOWN;
        this.#address = null;
        this.#writingKey = null;
        this.#payload = {};
        this.#txHash = null;
        this.#incomingAddress = null;
        this.#incomingWriterKey = null;
        this.#incomingNonce = null;
        this.#contentHash = null;
        this.#incomingSignature = null;
        this.#externalBootstrap = null;
        this.#msbBootstrap = null;
        this.#validatorNonce = null;
    }

    forOperationType(operationType) {
        if (!Object.values(OperationType).includes(operationType) || OperationType === OperationType.UNKNOWN) {
            throw new Error(`Invalid operation type: ${operationType}`);
        }
        this.#operationType = operationType;
        this.#payload.type = operationType;
        return this;
    }

    withAddress(address) {
        if (!isAddressValid(address)) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${TRAC_ADDRESS_SIZE}.`);
        }
        this.#address = addressToBuffer(address);
        this.#payload.address = this.#address;
        return this;
    }

    withWriterKey(writingKey) {
        if (!b4a.isBuffer(writingKey) || writingKey.length !== 32) {
            throw new Error('Writer key must be a 32 length buffer.');
        }
        this.#writingKey = writingKey;
        return this;
    }

    withTxHash(txHash) {
        if (!b4a.isBuffer(txHash) || txHash.length !== 32) {
            throw new Error('Transaction hash must be a 32-byte buffer.');
        }
        this.#txHash = txHash;
        return this;
    }

    withIncomingAddress(address) {
        if (!(typeof address === 'string') || address.length !== TRAC_ADDRESS_SIZE) {
            throw new Error(`Incoming address must be a ${TRAC_ADDRESS_SIZE} length string.`);
        }
        this.#incomingAddress = addressToBuffer(address);
        return this;
    }

    withIncomingWriterKey(writerKey) {
        if (!b4a.isBuffer(writerKey) || writerKey.length !== 32) {
            throw new Error('Incoming writer key must be a 32-byte buffer.');
        }
        this.#incomingWriterKey = writerKey;
        return this;
    }

    withIncomingNonce(nonce) {
        if (!b4a.isBuffer(nonce) || nonce.length !== 32) {
            throw new Error('Incoming nonce must be a 32-byte buffer.');
        }
        this.#incomingNonce = nonce;
        return this;
    }

    withContentHash(contentHash) {
        if (!b4a.isBuffer(contentHash) || contentHash.length !== 32) {
            throw new Error('Content hash must be a 32-byte buffer.');
        }
        this.#contentHash = contentHash;
        return this;
    }

    withIncomingSignature(signature) {
        if (!b4a.isBuffer(signature) || signature.length !== 64) {
            throw new Error('Incoming signature must be a 64-byte buffer.');
        }
        this.#incomingSignature = signature;
        return this;
    }

    withExternalBootstrap(bootstrapKey) {
        if (!b4a.isBuffer(bootstrapKey) || bootstrapKey.length !== 32) {
            throw new Error('Bootstrap key must be a 32-byte buffer.');
        }
        this.#externalBootstrap = bootstrapKey;
        return this;
    }

    withMsbBootstrap(msbBootstrap) {
        if (!b4a.isBuffer(msbBootstrap) || msbBootstrap.length !== 32) {
            throw new Error('MSB bootstrap must be a 32-byte buffer.');
        }
        this.#msbBootstrap = msbBootstrap;
        return this;
    }

    async buildValueAndSign() {
        const wallet = this.#wallet;
        const operationType = this.#operationType;
        const address = this.#address;
        const writingKey = this.#writingKey;

        // writer key is not required for all operations, but it is required for some...
        if (!operationType || !address) {
            throw new Error('Operation type, address must be set before building the message.');
        }

        if (operationType === OperationType.UNKNOWN) {
            throw new Error('UNKNOWN is not allowed to construct');
        }

        if (operationType === OperationType.TX) {
            if (!this.#txHash || !this.#incomingAddress || !this.#incomingWriterKey ||
                !this.#incomingNonce || !this.#contentHash || !this.#incomingSignature ||
                !this.#externalBootstrap || !this.#msbBootstrap) {
                throw new Error('All postTx fields must be set before building the message');
            }
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
                msg = createMessage(address, writingKey, nonce, operationType);
                break;

            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_WRITER:
                if (this.#wallet.address === bufferToAddress(address)) {
                    throw new Error('Address must not be the same as the wallet address for basic operations.');
                }

                msg = createMessage(address, nonce, operationType);
                break;

            case OperationType.TX:
                msg = b4a.concat([this.#txHash, nonce]);
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
        } else if (this.#isTransaction(operationType)) {
            value = {
                tx: this.#txHash,
                ia: this.#incomingAddress,
                iw: this.#incomingWriterKey,
                in: this.#incomingNonce,
                ch: this.#contentHash,
                is: this.#incomingSignature,
                bs: this.#externalBootstrap,
                mbs: this.#msbBootstrap,
                vs: signature,
                vn: nonce,
            }
            this.#payload.txo = value;
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

    #isTransaction(type) {
        return [
            OperationType.TX
        ].includes(type);
    }

    getPayload() {
        if (!this.#payload.type || !this.#payload.address || (!this.#payload.bko && !this.#payload.eko && !this.#payload.txo)) {
            throw new Error('Product is not fully assembled. Missing type, address, or value (bko/eko/txo).');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default StateMessageBuilder;
