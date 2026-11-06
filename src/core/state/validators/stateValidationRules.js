import b4a from 'b4a';
import {
    NETWORK_ID_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE,
    VDF_PROOF_BYTE_LENGTHS,
    SIGNATURE_BYTE_LENGTH
} from '../../../utils/constants.js';
import {
    decodeProofProposalApproval,
    decodeProofProposal,
    encodeProofProposalApproval,
    encodeProofProposal
} from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';

export function registerStrictTypeRules(validator) {
    // Check types before the built-in rules read properties or format errors
    // with an untrusted value (e.g. Symbol).
    for (const [type, condition] of [
        ['object', 'value !== null && typeof value === "object" && !Array.isArray(value)'],
        ['number', 'typeof value === "number"'],
        ['array', 'Array.isArray(value)']
    ]) {
        const compileRule = validator.rules[type];
        validator.add(type, function (rule, path, context) {
            const compiled = compileRule.call(this, rule, path, context);
            const typeError = this.makeError({type, actual: 'typeof value', messages: rule.messages});
            return {
                ...compiled,
                source: `
                    if (!(${condition})) {
                        ${typeError}
                        return value;
                    }
                    ${compiled.source}
                `
            };
        });
    }
}

export function bufferRule({schema, messages, index}, _path, context) {
    context.customs[index] = {isBuffer: b4a.isBuffer};
    const typeError = this.makeError({type: 'buffer', actual: 'typeof value', messages});
    const lengthError = this.makeError({type: 'bufferLength', expected: schema.length, actual: 'value.length', messages});
    const emptyError = this.makeError({type: 'emptyBuffer', actual: 'value', messages});

    return {
        source: `
            if (!context.customs[${index}].isBuffer(value)) {
                ${typeError}
                return value;
            }
            if (value.length !== ${schema.length}) {
                ${lengthError}
                return value;
            }
            let isEmpty = true;
            for (let i = 0; i < value.length; i++) {
                if (value[i] !== 0) {
                    isEmpty = false;
                    break;
                }
            }
            if (isEmpty) {
                ${emptyError}
            }
            return value;
        `
    };
}

export function bufferMaxLengthRule({schema, messages, index}, _path, context) {
    context.customs[index] = {isBuffer: b4a.isBuffer};
    const typeError = this.makeError({type: 'buffer', actual: 'typeof value', messages});
    const lengthError = this.makeError({type: 'bufferMaxLength', expected: schema.maxLength, actual: 'value.length', messages});

    return {
        source: `
            if (!context.customs[${index}].isBuffer(value)) {
                ${typeError}
                return value;
            }
            if (value.length === 0 || value.length > ${schema.maxLength}) {
                ${lengthError}
            }
            return value;
        `
    };
}

export function bufferAmountRule({schema, messages, index}, _path, context) {
    context.customs[index] = {isBuffer: b4a.isBuffer};
    const typeError = this.makeError({type: 'buffer', actual: 'typeof value', messages});
    const lengthError = this.makeError({type: 'bufferLength', expected: schema.length, actual: 'value.length', messages});

    return {
        source: `
            if (!context.customs[${index}].isBuffer(value)) {
                ${typeError}
                return value;
            }
            if (value.length !== ${schema.length}) {
                ${lengthError}
            }
            return value;
        `
    };
}

export function boundedHtlcBufferArray(min, max, length) {
    return {
        type: 'custom',
        required: true,
        check(value, errors, _schema, field) {
            if (!Array.isArray(value) || value.length < min || value.length > max) {
                errors.push({type: 'array', field, message: `Expected ${min} to ${max} entries`});
                return value;
            }
            for (let index = 0; index < value.length; index++) {
                const item = value[index];
                if (!b4a.isBuffer(item) || item.length !== length || item.every(byte => byte === 0)) {
                    errors.push({type: 'buffer', field: `${field}[${index}]`, message: `Expected a non-zero ${length}-byte buffer`});
                }
            }
            return value;
        }
    };
}

export function createProofDataRule(addressLength) {
    const fields = Object.freeze([
        {name: 'network_id', length: NETWORK_ID_BYTE_LENGTH},
        {name: 'epoch', length: EPOCH_BYTE_LENGTH},
        {name: 'previous_epoch_record_hash', length: HASH_BYTE_LENGTH},
        {name: 'proposer', length: addressLength},
        {name: 'difficulty', length: VDF_DIFFICULTY_SIZE},
        {name: 'discriminant_bit_size', length: VDF_DISCRIMINANT_SIZE},
        {name: 'signature', length: SIGNATURE_BYTE_LENGTH}
    ]);

    return function proofDataRule({schema, messages, index}, _path, context) {
        // Generated functions have no access to this closure. Store runtime
        // dependencies under the rule index assigned by fastest-validator.
        context.customs[index] = {
            schema,
            decodeProofData: decodeProofProposal,
            encodeProofData: encodeProofProposal,
            equals: b4a.equals,
            isBuffer: b4a.isBuffer,
            fields,
            proofByteLengths: VDF_PROOF_BYTE_LENGTHS
        };
        const typeError = this.makeError({type: 'proofData', actual: 'typeof value', messages});
        const proofError = this.makeError({type: 'proofData', actual: 'value', messages});

        return {
            source: `
                const proofDataRule = context.customs[${index}];
                if (!proofDataRule.isBuffer(value) || value.length === 0) {
                    ${typeError}
                    return value;
                }

                let proofData;
                try {
                    proofData = proofDataRule.decodeProofData(value);
                } catch {
                    ${proofError}
                    return value;
                }

                const reencodedProofDataInput = {};
                for (const field of proofDataRule.fields) {
                    const fieldValue = proofData[field.name];
                    if (!proofDataRule.isBuffer(fieldValue) || fieldValue.length !== field.length) {
                        ${proofError}
                        return value;
                    }

                    let fieldIsZeroFilled = true;
                    for (let i = 0; i < fieldValue.length; i++) {
                        if (fieldValue[i] !== 0) {
                            fieldIsZeroFilled = false;
                            break;
                        }
                    }

                    if (fieldIsZeroFilled) {
                        ${proofError}
                        return value;
                    }

                    reencodedProofDataInput[field.name] = fieldValue;
                }

                const discriminantBitSize = proofData.discriminant_bit_size.readUInt16BE(0);
                const expectedProofLength = proofDataRule.proofByteLengths[discriminantBitSize];
                const proof = proofData.proof;
                if (
                    !Number.isInteger(expectedProofLength) ||
                    !proofDataRule.isBuffer(proof) ||
                    proof.length !== expectedProofLength
                ) {
                    ${proofError}
                    return value;
                }

                let proofIsZeroFilled = true;
                for (let i = 0; i < proof.length; i++) {
                    if (proof[i] !== 0) {
                        proofIsZeroFilled = false;
                        break;
                    }
                }
                if (proofIsZeroFilled) {
                    ${proofError}
                    return value;
                }
                reencodedProofDataInput.proof = proof;

                const reencodedProofData = proofDataRule.encodeProofData(reencodedProofDataInput);
                if (!proofDataRule.equals(value, reencodedProofData)) {
                    ${proofError}
                }

                return value;
            `
        };
    };
}

export function createProofProposalApprovalRule(addressLength) {
    return function proofProposalApprovalRule({schema, messages, index}, _path, context) {
        context.customs[index] = {
            schema,
            decodeApproval: decodeProofProposalApproval,
            encodeApproval: encodeProofProposalApproval,
            equals: b4a.equals,
            isBuffer: b4a.isBuffer,
            addressLength,
            signatureByteLength: SIGNATURE_BYTE_LENGTH
        };
        const typeError = this.makeError({type: 'proofProposalApproval', actual: 'typeof value', messages});
        const approvalError = this.makeError({type: 'proofProposalApproval', actual: 'value', messages});

        return {
            source: `
                const proofProposalApprovalRule = context.customs[${index}];
                if (!proofProposalApprovalRule.isBuffer(value) || value.length === 0) {
                    ${typeError}
                    return value;
                }

                let approval;
                try {
                    approval = proofProposalApprovalRule.decodeApproval(value);
                } catch {
                    ${approvalError}
                    return value;
                }

                const approver = approval.approver;
                const approvalSignature = approval.approval_sig;

                if (!proofProposalApprovalRule.isBuffer(approver) || approver.length !== proofProposalApprovalRule.addressLength) {
                    ${approvalError}
                    return value;
                }

                if (!proofProposalApprovalRule.isBuffer(approvalSignature) || approvalSignature.length !== proofProposalApprovalRule.signatureByteLength) {
                    ${approvalError}
                    return value;
                }

                let approverIsEmpty = true;
                for (let i = 0; i < approver.length; i++) {
                    if (approver[i] !== 0) {
                        approverIsEmpty = false;
                        break;
                    }
                }

                let approvalSignatureIsEmpty = true;
                for (let i = 0; i < approvalSignature.length; i++) {
                    if (approvalSignature[i] !== 0) {
                        approvalSignatureIsEmpty = false;
                        break;
                    }
                }

                if (approverIsEmpty || approvalSignatureIsEmpty) {
                    ${approvalError}
                    return value;
                }

                const reencodedApproval = proofProposalApprovalRule.encodeApproval({
                    approver,
                    approval_sig: approvalSignature
                });

                if (!proofProposalApprovalRule.equals(value, reencodedApproval)) {
                    ${approvalError}
                }

                return value;
            `
        };
    };
}
