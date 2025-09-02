import b4a from 'b4a';
import Wallet from 'trac-wallet';

import StateBuilder from '../base/StateBuilder.js'
import {createMessage} from '../../utils/buffer.js';
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'
import {addressToBuffer, bufferToAddress} from '../../core/state/utils/address.js';
import {TRAC_ADDRESS_SIZE} from 'trac-wallet/constants.js';
import {isAddressValid} from "../../core/state/utils/address.js";
import {blake3Hash} from '../../utils/crypto.js';
import { isCoreAdmin, isAdminControl, isRoleAccess, isTransaction, isBootstrapDeployment } from '../../utils/operations.js';

class CompleteStateMessageBuilder extends StateBuilder {
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
    #txValidity

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
        this.#txValidity = null;
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
        if (b4a.isBuffer(address) && address.length === TRAC_ADDRESS_SIZE) {
            address = bufferToAddress(address);
        }

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
        if (b4a.isBuffer(address) && address.length === TRAC_ADDRESS_SIZE) {
            address = bufferToAddress(address);
        }

        if (!isAddressValid(address)) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${TRAC_ADDRESS_SIZE}.`);
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

    withTxValidity(txValidity) {
        if (!b4a.isBuffer(txValidity) || txValidity.length !== 32) {
            throw new Error('Transaction validity must be a 32-byte buffer.');
        }
        this.#txValidity = txValidity;
        return this;
    }

    async buildValueAndSign() {
        if (!this.#operationType || !this.#address) {
            throw new Error('Operation type, address must be set before building the message.');
        }

        if (this.#operationType === OperationType.UNKNOWN) {
            throw new Error('UNKNOWN is not allowed to construct');
        }

        const nonce = Wallet.generateNonce();

        let msg = null;
        let tx = null;
        let signature = null;

        // all incoming data from setters should be as buffer data type, createMessage accept only buffer and uint32
        switch (this.#operationType) {
            // Complete by default
            case OperationType.ADD_ADMIN:
                msg = createMessage(this.#address, this.#txValidity, this.#writingKey, nonce, this.#operationType);
                break;

            // Partial need to be signed
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                msg = createMessage(
                    this.#txHash,
                    addressToBuffer(this.#wallet.address),
                    nonce,
                    this.#operationType
                );
                break;
            // Complete by default
            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_VALIDATOR:
                if (this.#wallet.address === bufferToAddress(this.#incomingAddress)) {
                    throw new Error('Address must not be the same as the wallet address for basic operations.');
                }

                msg = createMessage(this.#address, this.#txValidity, this.#incomingAddress, nonce, this.#operationType);
                break;
            // Partial need to be signed
            case OperationType.TX:
                if (!this.#txHash || !this.#txValidity || !this.#address || !this.#incomingWriterKey ||
                    !this.#incomingNonce || !this.#contentHash || !this.#incomingSignature ||
                    !this.#externalBootstrap || !this.#msbBootstrap) {
                    throw new Error('All postTx fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#txHash,
                    addressToBuffer(this.#wallet.address),
                    nonce,
                    this.#operationType
                );
                break;
            // Partial need to be signed
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                if (!this.#txHash || !this.#externalBootstrap || !this.#incomingNonce || !this.#incomingSignature) {
                    throw new Error('All bootstrap deployment fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#txHash,
                    addressToBuffer(this.#wallet.address),
                    nonce,
                    this.#operationType
                );
                break;

            default:
                throw new Error(`Unsupported operation type for building value: ${OperationType[this.#operationType]}.`);
        }

        tx = await blake3Hash(msg);
        signature = this.#wallet.sign(tx);

        if (isCoreAdmin(this.#operationType)) {
            this.#payload.cao = {
                tx: tx,
                txv: this.#txValidity,
                iw: this.#writingKey,
                in: nonce,
                is: signature
            };
        } else if (isAdminControl(this.#operationType)) {
            this.#payload.aco = {
                tx: tx,
                txv: this.#txValidity,
                in: nonce,
                ia: this.#incomingAddress,
                is: signature
            };
        }
        else if (isRoleAccess(this.#operationType)) {
            this.#payload.rao = {
                tx: this.#txHash,
                txv: this.#txValidity,
                iw: this.#incomingWriterKey,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: addressToBuffer(this.#wallet.address),
                vn: nonce,
                vs: signature,
            };
        } else if (isTransaction(this.#operationType)) {
            this.#payload.txo = {
                tx: this.#txHash,
                txv: this.#txValidity,
                iw: this.#incomingWriterKey,
                in: this.#incomingNonce,
                ch: this.#contentHash,
                is: this.#incomingSignature,
                bs: this.#externalBootstrap,
                mbs: this.#msbBootstrap,
                va: addressToBuffer(this.#wallet.address),
                vn: nonce,
                vs: signature,
            };
        } else if (isBootstrapDeployment(this.#operationType)) {
            this.#payload.bdo = {
                tx: this.#txHash,
                txv: this.#txValidity,
                bs: this.#externalBootstrap,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: addressToBuffer(this.#wallet.address),
                vn: nonce,
                vs: signature
            }
        } else {
            throw new Error(`No corresponding value type for operation: ${OperationType[this.#operationType]}.`);
        }

        return this;
    }

    getPayload() {
        if (
            !this.#payload.type ||
            !this.#payload.address ||
            (
                !this.#payload.cao &&
                !this.#payload.aco &&
                !this.#payload.rao &&
                !this.#payload.txo &&
                !this.#payload.bdo)) {
            throw new Error('Product is not fully assembled. Missing type, address, or value (cao/aco/rao/txo/bdo).');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default CompleteStateMessageBuilder;
