import PartialOperationValidator from './PartialOperationValidator.js';

class PartialHtlcValidator extends PartialOperationValidator {

    async validate(payload) {
        this.isPayloadSchemaValid(payload);
        this.validateNoSelfValidation(payload);
        this.validateRequesterAddress(payload);
        await this.validateTransactionUniqueness(payload);
        await this.validateSignature(payload);
        await this.validateTransactionValidity(payload);
        this.isOperationNotCompleted(payload);

        return true;
    }
}

export default PartialHtlcValidator;
