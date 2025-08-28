import {OperationType} from '../../../../utils/constants.js';
import {addressToBuffer} from "../../../state/utils/address.js";
import CompleteStateMessageOperations from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import {normalizeHex} from "../../../../utils/helpers.js";
import PartialTransaction from "../validators/PartialTransaction.js";
import WhitelistEvent from "../validators/WhitelistEvent.js";
import PeerWallet from "trac-wallet";
import PartialStateMessageOperations from "../../../../messages/partialStateMessages/PartialStateMessageOperations.js";
class WhitelistedEventHandler {
    #state;
    #wallet;
    #network;
    #options;
    #whitelistEventValidator;

    constructor(network, state, wallet, options) {
        this.#state = state;
        this.#wallet = wallet;
        this.#network = network;
        this.#options = options
        this.#whitelistEventValidator = new WhitelistEvent(this.#state, this.#wallet, this.#network)
    }

    get state() {
        return this.#state;
    }

    get wallet() {
        return this.#wallet;
    }

    get network() {
        return this.#network;
    }

    async handle(message, connection) {
        const normalizedPayload = this.#normalizeAdminControlOperation(message);
        const adminPublicKey =  connection.remotePublicKey;
        const adminAddress = PeerWallet.encodeBech32mSafe(adminPublicKey);

        const isValid = await this.#whitelistEventValidator.validate(normalizedPayload, adminAddress);
        if (!isValid) {
            throw new Error(
                `Validation failed: Node with address ${adminAddress} and public key ${adminPublicKey.toString('hex')} attempted this operation.`
            );
        }

        const txValidity = await this.state.getIndexerSequenceState();
        const assembledMessage = await PartialStateMessageOperations.assembleAddWriterMessage(
            this.#wallet,
            this.#state.writingKey.toString('hex'),
            txValidity.toString('hex')

        );
        await this.network.validator_stream.messenger.send(assembledMessage);
    }

    #normalizeAdminControlOperation(payload) {
        if (!payload || typeof payload !== 'object' || !payload.aco) {
            throw new Error('Invalid payload for whitelist event normalization.');
        }

        const {type, address, aco} = payload;
        if (
            !type ||
            !address ||
            !aco.tx || !aco.txv || !aco.in || !aco.ia || !aco.is
        ) {
            throw new Error('Missing required fields in whitelist event payload.');
        }

        const normalizedAco = {
            tx: normalizeHex(aco.tx),
            txv: normalizeHex(aco.txv),
            in: normalizeHex(aco.in),
            ia: normalizeHex(aco.ia),
            is: normalizeHex(aco.is)
        };

        return {
            type,
            address: addressToBuffer(address),
            aco: normalizedAco
        };
    }
}

export default WhitelistedEventHandler;
