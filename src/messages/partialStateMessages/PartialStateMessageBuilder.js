import Wallet from "trac-wallet";
import b4a from "b4a";

import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/protobuf/applyOperations.cjs';
import {isAddressValid} from '../../core/state/utils/address.js';
import {TRAC_ADDRESS_SIZE} from "trac-wallet/constants.js";
import {isHexString} from "../../utils/helpers.js";
import {blake3Hash} from "../../utils/crypto.js";

class PartialStateMessageBuilder extends StateBuilder {
    #wallet;
    #operationType;
    #address;
    #externalBootstrap;
    #bootstrapNonce;
    #bootstrapSignature;
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
        this.#externalBootstrap = null;
        this.#bootstrapNonce = null;
        this.#bootstrapSignature = null;
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

    withExternalBootstrap(bootstrap) {
        if (!isHexString(bootstrap) || bootstrap.length !== 64) {
            throw new Error('Bootstrap key must be a 32-length hexstring.');
        }
        this.#externalBootstrap = bootstrap;
        return this;
    }

    async buildValueAndSign() {
        const nonce = Wallet.generateNonce();
        let txMsg = null;
        let value = null;
        let hash = null;
        let signature = null;

        switch (this.#operationType) {
            case OperationType.BOOTSTRAP_DEPLOYMENT:

                if (!this.#externalBootstrap) {
                    throw new Error('External bootstrap key must be set for BOOTSTRAP DEPLOYMENT operation.');
                }

                const typeBuffer = b4a.alloc(4);
                typeBuffer.writeUInt32BE(OperationType.BOOTSTRAP_DEPLOYMENT);
                const externalBootstrapBuffer = b4a.from(this.#externalBootstrap, 'hex');
                txMsg = b4a.concat([externalBootstrapBuffer, nonce, typeBuffer]);
                break;

            default:
                throw new Error(`Unsupported operation type: ${this.#operationType}`);
        }
        hash = await blake3Hash(txMsg);
        signature = this.#wallet.sign(hash);

        if (this.#isBootstrapDeployment(this.#operationType)) {
            value = {
                tx: hash.toString('hex'),
                bs: this.#externalBootstrap,
                in: nonce.toString('hex'),
                is: signature.toString('hex')
            }
            this.#payload.bdo = value;
        }
    }

    #isBootstrapDeployment(type) {
        return [
            OperationType.BOOTSTRAP_DEPLOYMENT
        ].includes(type);
    }

    getPayload() {
        if (
            !this.#payload.type ||
            !this.#payload.address ||
            (!this.#payload.bdo)) {
            throw new Error('Product is not fully assembled. Missing type, address, or value bdo.');
        }
        const res = this.#payload;
        this.reset();
        return res;
    }
}

export default PartialStateMessageBuilder;
