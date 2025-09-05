import Wallet from "trac-wallet";
import b4a from "b4a";

import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/constants.js';
import {addressToBuffer, bufferToAddress, isAddressValid} from '../../core/state/utils/address.js';
import {TRAC_ADDRESS_SIZE} from "trac-wallet/constants.js";
import {isHexString} from "../../utils/helpers.js";
import {blake3Hash} from "../../utils/crypto.js";
import {createMessage} from "../../utils/buffer.js";
import {isTransaction, isRoleAccess, isBootstrapDeployment, isTransfer} from "../../utils/operations.js";

class PartialStateMessageBuilder extends StateBuilder {
    #wallet;
    #operationType;
    #address;
    #writingKey;
    #txValidity;
    #contentHash;
    #externalBootstrap;
    #withMsbBootstrap;
    #bootstrapNonce;
    #bootstrapSignature;
    #incomingAddress;
    #amount;
    #payload;

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
        this.#operationType = null;
        this.#address = null;
        this.#writingKey = null;
        this.#txValidity = null;
        this.#contentHash = null;
        this.#externalBootstrap = null;
        this.#withMsbBootstrap = false;
        this.#bootstrapNonce = null;
        this.#bootstrapSignature = null;
        this.#incomingAddress = null;
        this.#amount = null;
        this.#payload = {};
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

        this.#address = address;
        this.#payload.address = this.#address;
        return this;
    }

    withContentHash(contentHash) {
        if (!isHexString(contentHash) || contentHash.length !== 64) {
            throw new Error('Content hash must be a 64-length hexstring.');
        }
        this.#contentHash = contentHash;
        return this;
    }

    withExternalBootstrap(bootstrap) {
        if (!isHexString(bootstrap) || bootstrap.length !== 64) {
            throw new Error('Bootstrap key must be a 64-length hexstring.');
        }
        this.#externalBootstrap = bootstrap;
        return this;
    }

    withMsbBootstrap(msbBootstrap) {
        if (!isHexString(msbBootstrap) || msbBootstrap.length !== 64) {
            throw new Error('MSB Bootstrap key must be a 64-length hexstring.');
        }
        this.#withMsbBootstrap = msbBootstrap;
        return this;
    }

    withWriterKey(writerKey) {
        if (!isHexString(writerKey) || writerKey.length !== 64) {
            throw new Error('Writer key must be a 64-length hexstring.');
        }
        this.#writingKey = writerKey;
        return this;
    }

    withTxValidity(txValidity) {
        if (!isHexString(txValidity) || txValidity.length !== 64) {
            throw new Error('txValidity must be a 64-length hexstring.');
        }
        this.#txValidity = txValidity;
        return this;
    }

    withIncomingAddress(address) {
        if (!isAddressValid(address)) {
            throw new Error(`Incoming address field must be a valid TRAC bech32m address with length ${TRAC_ADDRESS_SIZE}.`);
        }

        this.#incomingAddress = address;
        return this;
    }

    withAmount(amount) {
        console.log(amount.length);
        if (!isHexString(amount) || amount.length !== 32) {
            throw new Error('Amount must be a 32-length hexstring.');
        }

        this.#amount = amount;
        return this;
    }

    async buildValueAndSign() {
        const nonce = Wallet.generateNonce();
        let txMsg = null;
        let tx = null;
        let signature = null;

        // Creating a message for signing based on operation type
        // ATTENTION REMEMBER THAT createMessage accept only BUFFER arguments and uint32
        switch (this.#operationType) {
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                if (!this.#externalBootstrap) {
                    throw new Error('External bootstrap key must be set for BOOTSTRAP DEPLOYMENT operation.');
                }
                txMsg = createMessage(
                    addressToBuffer(this.#address),
                    b4a.from(this.#txValidity, 'hex'),
                    b4a.from(this.#externalBootstrap, 'hex'),
                    nonce,
                    OperationType.BOOTSTRAP_DEPLOYMENT
                );
                break;

            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                txMsg = createMessage(
                    addressToBuffer(this.#address),
                    b4a.from(this.#txValidity, 'hex'),
                    b4a.from(this.#writingKey, 'hex'),
                    nonce,
                    this.#operationType
                );
                break;

            case OperationType.TX:
                txMsg = createMessage(
                    addressToBuffer(this.#address),
                    b4a.from(this.#txValidity, 'hex'),
                    b4a.from(this.#writingKey, 'hex'),
                    b4a.from(this.#contentHash, 'hex'),
                    nonce,
                    b4a.from(this.#externalBootstrap, 'hex'),
                    b4a.from(this.#withMsbBootstrap, 'hex'),
                    this.#operationType
                );
                break;
            case OperationType.TRANSFER:
                txMsg = createMessage(
                    addressToBuffer(this.#address),
                    b4a.from(this.#txValidity, 'hex'),
                    nonce,
                    addressToBuffer(this.#incomingAddress), // we need to sign address of the recipient as well
                    b4a.from(this.#amount, 'hex'),
                    this.#operationType
                )
                break;
            default:
                throw new Error(`Unsupported operation type: ${this.#operationType}`);
        }

        // tx and signature
        tx = await blake3Hash(txMsg);
        signature = this.#wallet.sign(tx);

        // Build the payload based on operation type
        if (isBootstrapDeployment(this.#operationType)) {
            this.#payload.bdo = {
                tx: tx.toString('hex'),
                txv: this.#txValidity,
                bs: this.#externalBootstrap,
                in: nonce.toString('hex'),
                is: signature.toString('hex')
            };
        } else if (isRoleAccess(this.#operationType)) {
            this.#payload.rao = {
                tx: tx.toString('hex'),
                txv: this.#txValidity,
                iw: this.#writingKey,
                in: nonce.toString('hex'),
                is: signature.toString('hex')
            };
        } else if (isTransaction(this.#operationType)) {
            this.#payload.txo = {
                tx: tx.toString('hex'),
                txv: this.#txValidity,
                iw: this.#writingKey,
                in: nonce.toString('hex'),
                ch: this.#contentHash,
                is: signature.toString('hex'),
                bs: this.#externalBootstrap,
                mbs: this.#withMsbBootstrap
            };
        } else if (isTransfer(this.#operationType)) {
            this.#payload.tro = {
                tx: tx.toString('hex'),
                txv: this.#txValidity,
                in: nonce.toString('hex'),
                ia: this.#incomingAddress,
                am: this.#amount,
                is: signature.toString('hex')
            }
        }

        return this;
    }

    getPayload() {
        if (
            !this.#payload.type ||
            !this.#payload.address ||
            (
                !this.#payload.bdo &&
                !this.#payload.rao) &&
                !this.#payload.txo &&
                !this.#payload.tro
        ) {
            throw new Error('Product is not fully assembled. Missing type, address, or value bdo/rao/txo/tro.');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default PartialStateMessageBuilder;
