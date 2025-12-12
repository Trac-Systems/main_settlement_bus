import b4a from 'b4a';
import PeerWallet from 'trac-wallet';

import StateBuilder from '../base/StateBuilder.js'
import {createMessage} from '../../utils/buffer.js';
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'
import {addressToBuffer, bufferToAddress} from '../../core/state/utils/address.js';
import {isAddressValid} from "../../core/state/utils/address.js";
import {blake3Hash} from '../../utils/crypto.js';
import {
    isCoreAdmin,
    isAdminControl,
    isRoleAccess,
    isTransaction,
    isBootstrapDeployment,
    isTransfer,
    isBalanceInitialization
} from '../../utils/applyOperations.js';

class CompleteStateMessageBuilder extends StateBuilder {
    #wallet;
    #config
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
    #channel;
    #msbBootstrap;
    #validatorNonce;
    #txValidity;
    #amount;

    /**
     * 
     * @param {PeerWallet} wallet 
     * @param {Config} config 
     */
    constructor(wallet, config) {
        super();
        this.#config = config;
        if (!wallet || typeof wallet !== 'object') {
            throw new Error('Wallet must be a valid wallet object');
        }
        if (!isAddressValid(wallet.address, this.#config.addressPrefix)) {
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
        this.#channel = null;
        this.#msbBootstrap = null;
        this.#validatorNonce = null;
        this.#txValidity = null;
        this.#amount = null;
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
        if (b4a.isBuffer(address) && address.length === this.#config.addressLength) {
            address = bufferToAddress(address, this.#config.addressPrefix);
        }

        if (!isAddressValid(address, this.#config.addressPrefix)) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${this.#config.addressLength}.`);
        }

        this.#address = addressToBuffer(address, this.#config.addressPrefix);
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
        if (b4a.isBuffer(address) && address.length === this.#config.addressLength) {
            address = bufferToAddress(address, this.#config.addressPrefix);
        }

        if (!isAddressValid(address, this.#config.addressPrefix)) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${this.#config.addressLength}.`);
        }

        this.#incomingAddress = addressToBuffer(address, this.#config.addressPrefix);
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

    withChannel(channel) {
        if (!b4a.isBuffer(channel) || channel.length !== 32) {
            throw new Error('Channel must be a 32-byte buffer.');
        }
        this.#channel = channel;
        return this;
    }

    withTxValidity(txValidity) {
        if (!b4a.isBuffer(txValidity) || txValidity.length !== 32) {
            throw new Error('Transaction validity must be a 32-byte buffer.');
        }
        this.#txValidity = txValidity;
        return this;
    }

    withAmount(amount) {
        if (!b4a.isBuffer(amount) || amount.length !== 16) {
            throw new Error('Amount must be a 16-byte buffer.');
        }

        this.#amount = amount;
        return this;
    }

    async buildValueAndSign() {
        if (!this.#operationType || !this.#address) {
            throw new Error('Operation type, address must be set before building the message.');
        }

        if (this.#operationType === OperationType.UNKNOWN) {
            throw new Error('UNKNOWN is not allowed to construct');
        }

        const nonce = PeerWallet.generateNonce();

        let msg = null;
        let tx = null;
        let signature = null;

        // all incoming data from setters should be as buffer data type, createMessage accept only buffer and uint32
        switch (this.#operationType) {
            // Complete by default
            case OperationType.ADD_ADMIN:
            case OperationType.DISABLE_INITIALIZATION:
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#writingKey,
                    nonce,
                    this.#operationType);
                break;
            // Complete by default
            case OperationType.BALANCE_INITIALIZATION:
                if (!this.#incomingAddress || !this.#amount || !this.#txValidity || !this.#address) {
                    throw new Error('All balance initialization fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#incomingAddress,
                    this.#amount,
                    nonce,
                    this.#operationType
                );
                break;
            // Partial need to be signed
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            // Complete by default
            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_VALIDATOR:
                if (this.#wallet.address === bufferToAddress(this.#incomingAddress, this.#config.addressPrefix)) {
                    throw new Error('Address must not be the same as the wallet address for basic operations.');
                }

                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#incomingAddress,
                    nonce,
                    this.#operationType
                );

                break;
            // Partial need to be signed
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                if (!this.#txHash || !this.#externalBootstrap || !this.#channel || !this.#incomingNonce || !this.#incomingSignature) {
                    throw new Error('All bootstrap deployment fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;

            // Partial need to be signed
            case OperationType.TX:
                if (!this.#txHash || !this.#txValidity || !this.#address || !this.#incomingWriterKey ||
                    !this.#incomingNonce || !this.#contentHash || !this.#incomingSignature ||
                    !this.#externalBootstrap || !this.#msbBootstrap) {
                    throw new Error('All postTx fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;

            case OperationType.TRANSFER:
                if (!this.#txHash || !this.#txValidity || !this.#address || !this.#incomingNonce ||
                    !this.#incomingSignature || !this.#amount || !this.#incomingAddress) {
                    throw new Error('All transfer fields must be set before building the message!');
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
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
                ia: this.#incomingAddress,
                in: nonce,
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
                va: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
                vn: nonce,
                vs: signature,
            };
        } else if (isTransaction(this.#operationType)) {
            this.#payload.txo = {
                tx: this.#txHash,
                txv: this.#txValidity,
                iw: this.#incomingWriterKey,
                ch: this.#contentHash,
                bs: this.#externalBootstrap,
                mbs: this.#msbBootstrap,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
                vn: nonce,
                vs: signature,
            };
        } else if (isBootstrapDeployment(this.#operationType)) {
            this.#payload.bdo = {
                tx: this.#txHash,
                txv: this.#txValidity,
                bs: this.#externalBootstrap,
                ic: this.#channel,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
                vn: nonce,
                vs: signature
            }
        } else if (isTransfer(this.#operationType)) {
            this.#payload.tro = {
                tx: this.#txHash,
                txv: this.#txValidity,
                to: this.#incomingAddress,
                am: this.#amount,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
                vn: nonce,
                vs: signature
            }
        } else if (isBalanceInitialization(this.#operationType)) {
            this.#payload.bio = {
                tx: tx,
                txv: this.#txValidity,
                ia: this.#incomingAddress,
                am: this.#amount,
                in: nonce,
                is: signature
            }
        }
        else {
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
                !this.#payload.bdo &&
                !this.#payload.tro &&
                !this.#payload.bio
            )
        ) {
            throw new Error('Product is not fully assembled. Missing type, address, or value (cao/aco/rao/txo/bdo/tro/bio).');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default CompleteStateMessageBuilder;
