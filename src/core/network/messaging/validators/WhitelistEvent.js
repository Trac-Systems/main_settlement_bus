import PeerWallet from "trac-wallet";

import Check from '../../../../utils/check.js';
import {bufferToAddress} from "../../../state/utils/address.js";


class WhitelistEvent {
    #state;
    #wallet;
    #network;
    #check;

    constructor(state, wallet, network) {
        this.#state = state;
        this.#wallet = wallet;
        this.#network = network;
        this.#check = new Check();
    }

    get state() {
        return this.#state;
    }

    get network() {
        return this.#network;
    }

    get check() {
        return this.#check;
    }

    async validate(payload, address) {
        if (!this.#isPayloadSchemaValid(payload)) return false;
        if (!await this.#validateIfAddressIsAdmin(payload, address)) return false;
        if (!await this.#transactionHasBeenAppended(payload)) return false;
        if (!await this.#isNodeAllowedToChangeRole(payload)) return false;
        if (!this.#checkIfAddressMatchToAddressInPayload(payload)) return false;
        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validateAdminControlOperation(payload);

        if (!isPayloadValid) {
            console.error('Role access payload is invalid.');
            return false;
        }
        return true;
    }

    async #validateIfAddressIsAdmin(payload, address) {
        const incomingPublicKey = PeerWallet.decodeBech32mSafe(bufferToAddress(payload.address));

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in the access operation payload.');
            return false;
        }

        const adminEntry = await this.state.getAdminEntry();
        const isIncomingAddressAnAdmin = (address === adminEntry.address);
        const addressInPayload = bufferToAddress(payload.address);
        const isAddressInPayloadAnAdmin = (addressInPayload === adminEntry.address);
        if (!isIncomingAddressAnAdmin || !isAddressInPayloadAnAdmin) {
            console.error(
                `Validation failed: The node attempting this operation is not an administrator.`
            );

        }
        return true;
    }

    async #isNodeAllowedToChangeRole() {
        const nodeEntry =  await this.state.getNodeEntry(this.#wallet.address);
        if (nodeEntry === null) {
            console.error(
                `Validation failed: nodeEntry with address ${this.#wallet.address} does not exist in the state.`
            );
            return false;
        }

        if (nodeEntry.isWhitelisted && !nodeEntry.isIndexer && !nodeEntry.isWriter) {
            return true;
        }

        console.error(
            `Validation failed: nodeEntry with address ${this.#wallet.address} is either not whitelisted, or is an indexer, or is a writer.`
        );
        return false;
    }

    async #transactionHasBeenAppended(payload) {
        const txHex = payload.aco.tx.toString('hex');
        const existingTx = await this.state.get(txHex);
        if (existingTx === null) {
            console.error(
                `Transaction validation failed: The transaction with hash ${txHex} does not exist in the state. This indicates that the node attempting this operation is not whitelisted.`
            );
            return false;
        }
        return true;
    }

    #checkIfAddressMatchToAddressInPayload(payload) {
        const nodeAddress = this.#wallet.address;
        const addressInPayload = bufferToAddress(payload.aco.ia);
        if (nodeAddress !== addressInPayload) {
            console.error(
                `Validation failed: The node with address ${nodeAddress} does not match the address in the payload ${addressInPayload}.`
            );
            return false;
        }
        return true;

    }
}

export default WhitelistEvent;
