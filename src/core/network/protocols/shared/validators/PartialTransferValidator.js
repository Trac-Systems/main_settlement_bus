import PeerWallet from 'trac-wallet';

import {bufferToAddress} from "../../../../state/utils/address.js";
import {bufferToBigInt} from "../../../../../utils/amountSerialization.js";
import PartialOperationValidator from './PartialOperationValidator.js';
import {
    SharedValidatorError,
    SharedValidatorErrorCode,
} from './SharedValidatorError.js';

class PartialTransferValidator extends PartialOperationValidator {
    #config

    constructor(state, selfAddress, config) {
        super(state, selfAddress, config);
        this.#config = config
    }

    async validate(payload) {
        this.isPayloadSchemaValid(payload);
        this.validateNoSelfValidation(payload);
        this.validateRequesterAddress(payload);
        await this.validateTransactionUniqueness(payload);
        await this.validateSignature(payload);
        await this.validateTransactionValidity(payload);
        this.isOperationNotCompleted(payload);

        // uncommon validations below
        this.#validateRecipientAddress(payload)
        await this.#validateStateBalances(payload)

        return true;
    }

    #validateRecipientAddress(payload) {
        const incomingAddress = bufferToAddress(payload.tro.to, this.#config.addressPrefix);
        if (!incomingAddress) {
            throw new SharedValidatorError(
                SharedValidatorErrorCode.TRANSFER_RECIPIENT_ADDRESS_INVALID,
                'Invalid recipient address in transfer payload.'
            );
        }

        const incomingPublicKey = PeerWallet.decodeBech32mSafe(incomingAddress);
        if (incomingPublicKey === null) {
            throw new SharedValidatorError(
                SharedValidatorErrorCode.TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID,
                'Invalid recipient public key in transfer payload.'
            );
        }

    }

    async #validateStateBalances(payload) {
        const senderAddress = bufferToAddress(payload.address, this.#config.addressPrefix);
        const recipientAddress = bufferToAddress(payload.tro.to, this.#config.addressPrefix);

        const transferAmount = bufferToBigInt(payload.tro.am);
        if (transferAmount > this.max_amount) {
            throw new SharedValidatorError(
                SharedValidatorErrorCode.TRANSFER_AMOUNT_TOO_LARGE,
                'Transfer amount exceeds maximum allowed value'
            );
        }

        const isSelfTransfer = senderAddress === recipientAddress;
        const totalDeductedAmount = isSelfTransfer ? this.fee : (transferAmount + this.fee);

        const senderEntry = await this.state.getNodeEntryUnsigned(senderAddress);
        if (!senderEntry) {
            throw new SharedValidatorError(
                SharedValidatorErrorCode.TRANSFER_SENDER_NOT_FOUND,
                'Sender account not found'
            );
        }

        const senderBalance = bufferToBigInt(senderEntry.balance);
        if (!(senderBalance >= totalDeductedAmount)) {
            throw new SharedValidatorError(
                SharedValidatorErrorCode.TRANSFER_INSUFFICIENT_BALANCE,
                'Insufficient balance for transfer' + (isSelfTransfer ? ' fee' : ' + fee')
            );
        }

        if (!isSelfTransfer) {
            const recipientEntry = await this.state.getNodeEntryUnsigned(recipientAddress);
            if (recipientEntry) {
                const recipientBalance = bufferToBigInt(recipientEntry.balance);
                const newRecipientBalance = recipientBalance + transferAmount;
                if (newRecipientBalance > this.max_amount) {
                    throw new SharedValidatorError(
                        SharedValidatorErrorCode.TRANSFER_RECIPIENT_BALANCE_OVERFLOW,
                        'Transfer would cause recipient balance to exceed maximum allowed value'
                    );
                }
            }
        }
    }
}

export default PartialTransferValidator;
