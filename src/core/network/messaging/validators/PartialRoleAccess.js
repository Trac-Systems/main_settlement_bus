import b4a from 'b4a';
import Wallet from 'trac-wallet';

import Check from '../../../../utils/check.js';
import {OperationType} from "../../../../utils/constants.js";
import {blake3Hash} from "../../../../utils/crypto.js";
import {createMessage} from "../../../../utils/buffer.js";
import {addressToBuffer, bufferToAddress} from "../../../state/utils/address.js";

//TODO: Implement BASE VALIDATOR CLASS AND MOVE COMMON METHODS THERE

class PartialRoleAccess {
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

    async validate(payload) {
        if (!this.#isPayloadSchemaValid(payload)) return false;
        if (!this.#validateRequesterAddress(payload)) return false;
        if (!await this.#validateTransactionUniqueness(payload)) return false;
        if (!await this.#validateSignature(payload)) return false;
        if (!await this.#isRequesterAllowedToChangeRole(payload)) return false;
        if (!await this.#validateTransactionValidity(payload)) return false;
        return true;
    }

    async #validateTransactionUniqueness(payload) {
        const tx = payload.rao.tx;
        const txHex = tx.toString('hex');
        if (await this.state.get(txHex) !== null) {
            console.error(`Transaction with hash ${txHex} already exists in the state.`);
            return false;
        }
        return true;
    }

    #isPayloadSchemaValid(payload) {
        const isPayloadValid = this.check.validateRoleAccessOperation(payload);

        if (!isPayloadValid) {
            console.error('Role access payload is invalid.');
            return false;
        }
        return true;
    }

    #validateRequesterAddress(payload) {
        const incomingAddress = bufferToAddress(payload.address);
        if (!incomingAddress) {
            console.error('Invalid requesting address in role access payload.');
            return false;
        }

        const incomingPublicKey = Wallet.decodeBech32mSafe(incomingAddress);

        if (incomingPublicKey === null) {
            console.error('Invalid requesting public key in role access payload.');
            return false;
        }
        return true;
    }

    async #validateSignature(payload) {
        const incomingPublicKey = Wallet.decodeBech32mSafe(bufferToAddress(payload.address));
        const incomingSignature = payload.rao.is;

        const incomingTx = payload.rao.tx;

        const message = createMessage(
            payload.address,
            payload.rao.txv,
            payload.rao.iw,
            payload.rao.in,
            payload.type
        );

        const regeneratedTx = await blake3Hash(message);

        // ensure that regenerated tx matches the incoming tx
        if (!b4a.equals(incomingTx, regeneratedTx)) {
            console.error('Regenerated transaction does not match incoming transaction in Role Access payload.');
            return false;
        }

        const isSignatureValid = Wallet.verify(incomingSignature, regeneratedTx, incomingPublicKey);
        if (!isSignatureValid) {
            console.error('Invalid signature in PreTx payload.');
            return false;
        }
        return true;
    }
    async #isRequesterAllowedToChangeRole(payload) {
        const {type} = payload;

        if (type === OperationType.ADD_WRITER) {
            const nodeAddress = bufferToAddress(payload.address);
            const nodeEntry = await this.state.getNodeEntry(nodeAddress);
            if (!nodeEntry) {
                console.error(`Node with address ${nodeAddress} entry does not exist.`);
                return false;
            }

            const isNodeAlreadyWriter = nodeEntry.isWriter;
            if (isNodeAlreadyWriter) {
                console.error(`Node with address ${nodeAddress} is already a writer.`);
                return false;
            }

            const isNodeWhitelisted = nodeEntry.isWhitelisted;
            if (!isNodeWhitelisted) {
                console.error(`Node with address ${nodeAddress} is not whitelisted.`);
                return false;
            }

            return true;
        } else if (type === OperationType.REMOVE_WRITER) {
            const nodeAddress = bufferToAddress(payload.address);
            const nodeEntry = await this.state.getNodeEntry(nodeAddress);
            if (!nodeEntry) {
                console.error(`Node with address ${nodeAddress} entry does not exist.`);
                return false;
            }

            const isAlreadyWriter = nodeEntry.isWriter;
            if (!isAlreadyWriter) {
                console.error(`Node with address ${nodeAddress} is not a writer.`);
                return false;
            }

            const isAlreadyIndexer = nodeEntry.isIndexer;
            if (isAlreadyIndexer) {
                console.error(`Node with address ${nodeAddress} is an indexer.`);
                return false;
            }

            return true;
        } else if (type === OperationType.ADMIN_RECOVERY) {
            const adminEntry = await this.state.getAdminEntry();
            if (!adminEntry) {
                console.error('Admin entry does not exist.');
                return false;
            }

            const adminAddressBuffer = payload.address;
            const adminAddress = bufferToAddress(adminAddressBuffer);
            const isRecoveryCase = !!(
                adminEntry.address === adminAddress &&
                !b4a.equals(payload.rao.iw, adminEntry.wk)
            );
            if (!isRecoveryCase) {
                console.error(`Node with address ${adminAddress} is not a valid recovery case.`);
                return false;
            }

            return true;
        }
        return false;
    }

    async #validateTransactionValidity(payload) {
        const currentTxv = await this.state.getIndexerSequenceState()
        const incomingTxv = payload.rao.txv
        if (!b4a.equals(currentTxv, incomingTxv)) {
            console.error(`Transaction has expired.`);
            return false;
        }
        return true;
    }
}

export default PartialRoleAccess;
