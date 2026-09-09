import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import PartialOperationValidator from './PartialOperationValidator.js';
import {bufferToAddress} from '../../../../state/utils/address.js';
import {bufferToBigInt} from '../../../../../utils/amountSerialization.js';
import {isZeroBuffer} from '../../../../../utils/buffer.js';
import {
    HTLC_MIN_LOCK_DURATION_EPOCHS,
    OperationType,
    PUBLIC_KEY_LENGTH,
    ResultCode
} from '../../../../../utils/constants.js';
import {verifyOrderedHtlcCosignerSignatures} from '../../../../../utils/htlcLock.js';
import {V1ProtocolError} from '../../v1/V1ProtocolError.js';

class PartialHtlcValidator extends PartialOperationValidator {
    #config;

    constructor(state, selfAddress, config) {
        super(state, selfAddress, config);
        this.#config = config;
    }

    async validate(payload) {
        // Claim and refund validation are implemented by their own operation tasks.
        if ([OperationType.HTLC_CLAIM, OperationType.HTLC_REFUND].includes(payload?.type)) return true;
        this.isPayloadSchemaValid(payload);
        this.validateNoSelfValidation(payload);
        this.validateRequesterAddress(payload);
        await this.validateTransactionUniqueness(payload);
        await this.validateSignature(payload);
        await this.validateTransactionValidity(payload);
        this.isOperationNotCompleted(payload);

        this.#validateSettlementAddresses(payload.hlo);
        this.#validateLockAuthorizations(payload);
        await this.#validateRefundEpoch(payload.hlo);
        await this.#validateLockerBalance(payload);

        return true;
    }

    #validateSettlementAddresses(operation) {
        for (const [field, label] of [
            [operation.ca, 'claim'],
            [operation.ra, 'refund'],
            ...(operation.fr ? [[operation.fr, 'fee recipient']] : [])
        ]) {
            const address = bufferToAddress(field, this.#config.addressPrefix);
            const publicKey = address && tracCryptoApi.address.decodeSafe(address);
            if (
                !b4a.isBuffer(publicKey) ||
                publicKey.length !== PUBLIC_KEY_LENGTH ||
                isZeroBuffer(publicKey)
            ) {
                throw new V1ProtocolError(
                    ResultCode.TX_INVALID_PAYLOAD,
                    `Invalid HTLC ${label} address.`
                );
            }
        }
    }

    #validateLockAuthorizations(payload) {
        const operation = payload.hlo;
        const lockerAddress = bufferToAddress(payload.address, this.#config.addressPrefix);
        const lockerPublicKey = tracCryptoApi.address.decodeSafe(lockerAddress);
        if (!b4a.equals(lockerPublicKey, operation.ss[0])) {
            throw new V1ProtocolError(
                ResultCode.TX_SIGNATURE_INVALID,
                'HTLC signer zero must be the locker identified by the operation address.'
            );
        }

        if (!verifyOrderedHtlcCosignerSignatures(operation.cs, operation.tx, operation.ss)) {
            throw new V1ProtocolError(
                ResultCode.TX_SIGNATURE_INVALID,
                'HTLC cosigner signatures are invalid or not in signer-set order.'
            );
        }
    }

    async #validateRefundEpoch(operation) {
        const currentEpoch = await this.state.getCurrentEpoch();
        if (typeof currentEpoch !== 'bigint') {
            throw new V1ProtocolError(
                ResultCode.TX_INVALID_PAYLOAD,
                'HTLC locks require an initialized network epoch.'
            );
        }

        const refundEpoch = operation.re.readBigUInt64BE(0);
        if (refundEpoch < currentEpoch + HTLC_MIN_LOCK_DURATION_EPOCHS) {
            throw new V1ProtocolError(
                ResultCode.TX_INVALID_PAYLOAD,
                `HTLC refund epoch must be at least ${HTLC_MIN_LOCK_DURATION_EPOCHS} epoch(s) after the current epoch.`
            );
        }
    }

    async #validateLockerBalance(payload) {
        const lockerAddress = bufferToAddress(payload.address, this.#config.addressPrefix);
        const lockerEntry = await this.state.getNodeEntryUnsigned(lockerAddress);
        if (!lockerEntry) {
            throw new V1ProtocolError(ResultCode.TRANSFER_SENDER_NOT_FOUND, 'HTLC locker account not found.');
        }

        const principal = bufferToBigInt(payload.hlo.am);
        const surchargeFee = bufferToBigInt(payload.hlo.fa);
        const escrowAmount = principal + surchargeFee;
        if (escrowAmount > this.max_amount || escrowAmount + this.fee > this.max_amount) {
            throw new V1ProtocolError(
                ResultCode.TRANSFER_AMOUNT_TOO_LARGE,
                'HTLC escrow amount exceeds the maximum allowed value.'
            );
        }

        if (bufferToBigInt(lockerEntry.balance) < escrowAmount + this.fee) {
            throw new V1ProtocolError(
                ResultCode.TRANSFER_INSUFFICIENT_BALANCE,
                'Insufficient balance for HTLC principal, surcharge fee, and network fee.'
            );
        }
    }
}

export default PartialHtlcValidator;
