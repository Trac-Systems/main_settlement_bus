import b4a from 'b4a';
import {
    ConsensusResultCode,
    EPOCH_APPENDER_SELECTION_COUNTER_LIMIT,
    EPOCH_BYTE_LENGTH,
    VDF_DISCRIMINANT_SIZE,
    VDF_PROOF_BYTE_LENGTHS,
} from '../../../../../../utils/constants.js';

/**
 * Checks that the proof length matches the discriminant size in the proposal.
 *
 * @param {object} proofProposal Proposal checked by the compiled schema.
 * @param {object[]} errors Validation errors collected by the schema.
 * @returns {object} Original proposal.
 */
export function validateProofProposalLength(proofProposal, errors) {
    const discriminant = proofProposal?.discriminant_bit_size;
    const proof = proofProposal?.proof;
    if (!b4a.isBuffer(discriminant) || discriminant.length !== VDF_DISCRIMINANT_SIZE) {
        return proofProposal;
    }

    const discriminantBitSize = discriminant.readUInt16BE(0);
    const expectedProofLength = VDF_PROOF_BYTE_LENGTHS[discriminantBitSize];
    if (!Number.isInteger(expectedProofLength)) {
        errors.push({
            type: 'unsupportedDiscriminantBitSize',
            field: 'proof_proposal.discriminant_bit_size',
            actual: discriminantBitSize,
            expected: Object.keys(VDF_PROOF_BYTE_LENGTHS).map(Number),
            message: 'Discriminant bit size must be one of: 1024, 2048, 4096.'
        });
        return proofProposal;
    }

    if (b4a.isBuffer(proof) && proof.length !== expectedProofLength) {
        errors.push({
            type: 'bufferLength',
            field: 'proof_proposal.proof',
            actual: proof.length,
            expected: expectedProofLength,
            message: `Proof must be a Buffer with length ${expectedProofLength}.`
        });
    }
    return proofProposal;
}

/**
 * Requires an approval for OK responses and forbids it for other results.
 *
 * @param {object} response Response checked by the compiled schema.
 * @param {object[]} errors Validation errors collected by the schema.
 * @returns {object} Original response.
 */
export function validateProofProposalApprovalPresence(response, errors) {
    if (!response || typeof response !== 'object') {
        return response;
    }
    const requiresApproval = response.result === ConsensusResultCode.OK;
    const hasApproval = response.approval !== undefined && response.approval !== null;
    if (requiresApproval !== hasApproval) {
        errors.push({
            type: 'conditionalDependency',
            field: 'proof_proposal_response.approval',
            message: requiresApproval
                ? 'Approval is required when the result is OK.'
                : 'Approval is only allowed when the result is OK.'
        });
    }
    return response;
}

/**
 * Checks the allowed counter range after the buffer rule checks its shape.
 *
 * @param {Buffer} counter Encoded election counter.
 * @param {object[]} errors Validation errors collected by the schema.
 * @returns {Buffer} Original counter.
 */
export function validateSelectionCounter(counter, errors) {
    if (!b4a.isBuffer(counter) || counter.length !== EPOCH_BYTE_LENGTH) {
        return counter;
    }
    const counterValue = counter.readBigUInt64BE(0);
    if (counterValue === 0n || counterValue > EPOCH_APPENDER_SELECTION_COUNTER_LIMIT) {
        errors.push({
            type: 'selectionCounter',
            actual: counterValue.toString(),
            message: 'Selection counter is outside the allowed range.'
        });
    }
    return counter;
}

/**
 * Builds the buffer check during schema compilation. The validator provides this.makeError.
 *
 * @this {import('fastest-validator').default}
 * @param {object} rule Buffer field definition and error messages.
 * @returns {{source: string}} Code used by the compiled validator.
 */
export function compileBufferRule({ schema, messages }) {
    const isBuffer = b4a.isBuffer;
    const allowEmpty = schema.allowEmpty === true;
    const exactLength = Number.isInteger(schema.length) ? schema.length : null;
    const minLength = Number.isInteger(schema.min) ? schema.min : null;
    const maxLength = Number.isInteger(schema.max) ? schema.max : null;
    return {
        source: `
            if (!${isBuffer}(value)) {
                ${this.makeError({ type: "buffer", actual: "value", messages })}
                return value;
            }
            const len = value.length;
            ${exactLength === null ? '' : `
            if (len !== ${exactLength}) {
                ${this.makeError({ type: "bufferLength", expected: exactLength, actual: "len", messages })}
            }`}
            ${minLength === null ? '' : `
            if (len < ${minLength}) {
                ${this.makeError({ type: "bufferMinLength", expected: minLength, actual: "len", messages })}
            }`}
            ${maxLength === null ? '' : `
            if (len > ${maxLength}) {
                ${this.makeError({ type: "bufferMaxLength", expected: maxLength, actual: "len", messages })}
            }`}
            if (len === 0 && !${allowEmpty}) {
                ${this.makeError({ type: "emptyBuffer", actual: "len", messages })}
                return value;
            }
            let isZeroFilled = true;
            for (let i = 0; i < len; i++) {
                if (value[i] !== 0) {
                    isZeroFilled = false;
                    break;
                }
            }
            if (isZeroFilled) {
                ${this.makeError({ type: "nonZeroBuffer", actual: "value", messages })}
            }
            return value;
        `,
    };
}
