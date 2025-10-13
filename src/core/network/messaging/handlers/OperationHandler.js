import {OperationType} from '../../../../utils/constants.js';
import PartialRoleAccess from "../validators/PartialRoleAccess.js";
import {addressToBuffer} from "../../../state/utils/address.js";
import CompleteStateMessageOperations
    from "../../../../messages/completeStateMessages/CompleteStateMessageOperations.js";
import {normalizeHex} from "../../../../utils/helpers.js";

class OperationHandler {
    #partialRoleAccessValidator;
    #wallet;
    #network;

    constructor(state, wallet, network) {
        this.#wallet = wallet;
        this.#network = network;
        this.#partialRoleAccessValidator = new PartialRoleAccess(state)
    }

    get wallet() {
        return this.#wallet;
    }

    get network() {
        return this.#network;
    }

    get partialRoleAccessValidator() {
        return this.#partialRoleAccessValidator;
    }

    async handle(message, connection) {
        const normalizedPartialRoleAccessPayload = this.#normalizePartialRoleAccess(message)
        const isValid = await this.partialRoleAccessValidator.validate(normalizedPartialRoleAccessPayload)
        let completePayload = null
        if (!isValid) {
            throw new Error("OperationHandler: partial role access payload validation failed.");
        }

        switch (normalizedPartialRoleAccessPayload.type) {
            case OperationType.ADD_WRITER:
                completePayload = await CompleteStateMessageOperations.assembleAddWriterMessage(
                    this.wallet,
                    normalizedPartialRoleAccessPayload.address,
                    normalizedPartialRoleAccessPayload.rao.tx,
                    normalizedPartialRoleAccessPayload.rao.txv,
                    normalizedPartialRoleAccessPayload.rao.iw,
                    normalizedPartialRoleAccessPayload.rao.in,
                    normalizedPartialRoleAccessPayload.rao.is,
                );
                break;
            case OperationType.REMOVE_WRITER:
                completePayload = await CompleteStateMessageOperations.assembleRemoveWriterMessage(
                    this.wallet,
                    normalizedPartialRoleAccessPayload.address,
                    normalizedPartialRoleAccessPayload.rao.tx,
                    normalizedPartialRoleAccessPayload.rao.txv,
                    normalizedPartialRoleAccessPayload.rao.iw,
                    normalizedPartialRoleAccessPayload.rao.in,
                    normalizedPartialRoleAccessPayload.rao.is,
                );
                break;
            case OperationType.ADMIN_RECOVERY:
                completePayload = await CompleteStateMessageOperations.assembleAdminRecoveryMessage(
                    this.wallet,
                    normalizedPartialRoleAccessPayload.address,
                    normalizedPartialRoleAccessPayload.rao.tx,
                    normalizedPartialRoleAccessPayload.rao.txv,
                    normalizedPartialRoleAccessPayload.rao.iw,
                    normalizedPartialRoleAccessPayload.rao.in,
                    normalizedPartialRoleAccessPayload.rao.is,
                );
                console.log("Assembled complete role access operation:", completePayload);
                break;
            default:
                throw new Error("OperationHandler: Assembling complete role access operation failed due to unsupported operation type.");
        }

        if (!completePayload) {
            throw new Error("OperationHandler: Assembling complete role access operation failed.");
        }

        this.network.poolService.addTransaction(completePayload)
    }

    #normalizePartialRoleAccess(payload) {
        if (!payload || typeof payload !== 'object' || !payload.rao) {
            throw new Error('Invalid payload for bootstrap deployment normalization.');
        }
        const {type, address, rao} = payload;
        if (
            !type ||
            !address ||
            !rao.tx || !rao.txv || !rao.iw || !rao.in || !rao.is
        ) {
            throw new Error('Missing required fields in bootstrap deployment payload.');
        }

        const normalizedRao = {
            tx: normalizeHex(rao.tx),
            txv: normalizeHex(rao.txv),
            iw: normalizeHex(rao.iw),
            in: normalizeHex(rao.in),
            is: normalizeHex(rao.is)
        };

        return {
            type,
            address: addressToBuffer(address),
            rao: normalizedRao
        };
    }
}

export default OperationHandler;
