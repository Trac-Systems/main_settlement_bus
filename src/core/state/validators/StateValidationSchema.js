import Validator from 'fastest-validator';
import b4a from 'b4a';

import {
    OperationType,
    WRITER_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    BOOTSTRAP_BYTE_LENGTH,
    CHANNEL_BYTE_LENGTH,
    AMOUNT_BYTE_LENGTH,
    PROTOCOL_VERSION_BYTE_LENGTH,
    NETWORK_ID_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    VDF_BLOB_PROOF_SIZE,
    CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH,
    CONSENSUS_CONFIG_DATA_MAX_SIZE,
} from '../../../utils/constants.js';
import {
    decodeProofProposalApproval,
    decodeProofProposal,
    encodeProofProposalApproval,
    encodeProofProposal
} from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import applyOperationsGenerated from '../../../codecs/apply/applyOperations.generated.cjs';

const { HtlcLockData } = applyOperationsGenerated.apply.operations;
class StateValidationSchema {
    #validator;
    #validateCoreAdminOperationSchema;
    #validateAdminControlOperationSchema;
    #validateRoleAccessOperationSchema;
    #validateBootstrapDeploymentSchema;
    #validateTransactionOperationSchema;
    #validateTransferOperationSchema;
    #validateBalanceInitializationSchema;
    #validateSetEpochOperationSchema;
    #validateConsensusControlOperationSchema;
    #validateHtlcLockOperationSchema;
    #proofDataFields;
    #config;

    /**
     * @param {Config} config
     **/
    constructor(config) {
        this.#config = config

        this.#proofDataFields = Object.freeze([
            {name: 'protocol_version', length: PROTOCOL_VERSION_BYTE_LENGTH},
            {name: 'network_id', length: NETWORK_ID_BYTE_LENGTH},
            {name: 'epoch', length: EPOCH_BYTE_LENGTH},
            {name: 'previous_epoch_record_hash', length: HASH_BYTE_LENGTH},
            {name: 'proposer', length: this.#config.addressLength},
            {name: 'vdf_parameters_hash', length: HASH_BYTE_LENGTH},
            {name: 'vdf_proof', length: VDF_BLOB_PROOF_SIZE},
            {name: 'signature', length: SIGNATURE_BYTE_LENGTH}
        ]);
        this.#validator = new Validator({
            useNewCustomCheckerFunction: true,
            messages: {
                buffer: "The '{field}' field must be a Buffer! Actual: {actual}",
                bufferLength: "The '{field}' field must be a Buffer with length {expected}! Actual: {actual}",
                bufferMaxLength: "The '{field}' field must be a Buffer no longer than {expected} bytes! Actual: {actual}",
                nonZeroBuffer: "The '{field}' field must not be an empty or zero-filled Buffer!",
                emptyBuffer: "The '{field}' field must not be an empty Buffer!",
                proofData: "The '{field}' field must be an encoded ProofProposal buffer.",
                proofProposalApproval: "The '{field}' field must be an encoded ProofProposalApproval buffer.",
                htlcLockData: "The '{field}' field must be a serialized HtlcLockData buffer.",
            },
        });
        const isBuffer = b4a.isBuffer;
        const equals = b4a.equals;
        const decodeApproval = decodeProofProposalApproval;
        const encodeApproval = encodeProofProposalApproval;
        const decodeProofData = decodeProofProposal;
        const encodeProofData = encodeProofProposal;
        const proofDataFields = this.#proofDataFields;
        const addressLength = this.#config.addressLength;
        this.#validator.add("buffer", function ({schema, messages}, _path, _context) {
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({type: "buffer", actual: "value", messages})}
                        }
                        if (value.length !== ${schema.length}) {
                            ${this.makeError({
        type: "bufferLength",
        expected: schema.length,
        actual: "value.length",
        messages
    })}
                        }
                        let isEmpty = true;
                            for (let i = 0; i < value.length; i++) {
                                if (value[i] !== 0) {
                                    isEmpty = false;
                                    break;
                                }
                            }
                            if (isEmpty) {
                                ${this.makeError({type: "emptyBuffer", actual: "value", messages})}
                            }
                            return value;
                    `
            };
        });

        this.#validator.add("buffer_max_length", function ({schema, messages}, _path, _context) {
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({type: "buffer", actual: "value", messages})}
                        }
                        if (value.length === 0 || value.length > ${schema.maxLength}) {
                            ${this.makeError({
        type: "bufferMaxLength",
        expected: schema.maxLength,
        actual: "value.length",
        messages
    })}
                        }
                        return value;
                    `
            };
        });

        this.#validator.add("buffer_amount", function ({schema, messages}, _path, _context) {
            return {
                source:
                    `
                        if (!${isBuffer}(value)) {
                            ${this.makeError({type: "buffer", actual: "value", messages})}
                        }
                        if (value.length !== ${schema.length}) {
                            ${this.makeError({
        type: "bufferLength",
        expected: schema.length,
        actual: "value.length",
        messages
    })}
                        }
                        return value;
                    `
            };
        });
        this.#validator.add("proof_data", function ({schema, messages, index}, _path, _context) {
            _context.customs[index] = {
                schema,
                decodeProofData,
                encodeProofData,
                equals,
                isBuffer,
                fields: proofDataFields
            };

            return {
                source:
                    `
                        const proofDataRule = context.customs[${index}];
                        if (!proofDataRule.isBuffer(value) || value.length === 0) {
                            ${this.makeError({type: "proofData", actual: "value", messages})}
                            return value;
                        }

                        let proofData;
                        try {
                            proofData = proofDataRule.decodeProofData(value);
                        } catch {
                            ${this.makeError({type: "proofData", actual: "value", messages})}
                            return value;
                        }

                        const reencodedProofDataInput = {};
                        for (const field of proofDataRule.fields) {
                            const fieldValue = proofData[field.name];
                            if (!proofDataRule.isBuffer(fieldValue) || fieldValue.length !== field.length) {
                                ${this.makeError({type: "proofData", actual: "value", messages})}
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
                                ${this.makeError({type: "proofData", actual: "value", messages})}
                                return value;
                            }

                            reencodedProofDataInput[field.name] = fieldValue;
                        }

                        const reencodedProofData = proofDataRule.encodeProofData(reencodedProofDataInput);
                        if (!proofDataRule.equals(value, reencodedProofData)) {
                            ${this.makeError({type: "proofData", actual: "value", messages})}
                        }

                        return value;
                    `
            };
        });
        // index is a number assigned by fastest-validator to this compiled rule.
        // Use it as a key for helpers needed by the generated validator function.
        // Example: index = 6 -> _context.customs[6] stores decodeApproval.
        this.#validator.add("proof_proposal_approval", function ({schema, messages, index}, _path, _context) {
            _context.customs[index] = {
                schema,
                decodeApproval,
                encodeApproval,
                equals,
                isBuffer,
                addressLength,
                signatureByteLength: SIGNATURE_BYTE_LENGTH
            };

            return {
                source:
                    `
                        // If index was 6 during compilation, this becomes context.customs[6].
                        const proofProposalApprovalRule = context.customs[${index}];
                        if (!proofProposalApprovalRule.isBuffer(value) || value.length === 0) {
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
                            return value;
                        }

                        let approval;
                        try {
                            approval = proofProposalApprovalRule.decodeApproval(value);
                        } catch {
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
                            return value;
                        }

                        const approver = approval.approver;
                        const approvalSignature = approval.approval_sig;

                        if (!proofProposalApprovalRule.isBuffer(approver) || approver.length !== proofProposalApprovalRule.addressLength) {
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
                            return value;
                        }

                        if (!proofProposalApprovalRule.isBuffer(approvalSignature) || approvalSignature.length !== proofProposalApprovalRule.signatureByteLength) {
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
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
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
                            return value;
                        }

                        const reencodedApproval = proofProposalApprovalRule.encodeApproval({
                            approver,
                            approval_sig: approvalSignature
                        });

                        if (!proofProposalApprovalRule.equals(value, reencodedApproval)) {
                            ${this.makeError({type: "proofProposalApproval", actual: "value", messages})}
                        }

                        return value;
                    `
            };
        });

        this.#validator.add("htlc_lock_data", function ({messages, index}, _path, _context) {
            const htlcLockDataFields = [
                {name: 'hl', length: HASH_BYTE_LENGTH},
                {name: 'ra', length: addressLength},
                {name: 'ca', length: addressLength},
                {name: 'ee', length: EPOCH_BYTE_LENGTH},
            ];
            _context.customs[index] = {
                decode: value => HtlcLockData.decode(value),
                encode: value => HtlcLockData.encode(value).finish(),
                equals,
                isBuffer,
                fields: htlcLockDataFields
            };

            return {
                source: `
                    const htlcRule = context.customs[${index}];
                    if (!htlcRule.isBuffer(value) || value.length === 0) {
                        ${this.makeError({type: "htlcLockData", actual: "value", messages})}
                        return value;
                    }

                    const expectedLength = htlcRule.fields.reduce((total, field) => total + field.length, 0);
                    const isSerialized = value.length === expectedLength;
                    let lockData;
                    if (!isSerialized) {
                        try {
                            lockData = htlcRule.decode(value);
                        } catch {
                            ${this.makeError({type: "htlcLockData", actual: "value", messages})}
                            return value;
                        }
                    }

                    let offset = 0;
                    const reencodedInput = {};
                    for (const field of htlcRule.fields) {
                        const fieldValue = isSerialized
                            ? value.subarray(offset, offset + field.length)
                            : lockData[field.name];
                        if (!htlcRule.isBuffer(fieldValue) || fieldValue.length !== field.length) {
                            ${this.makeError({type: "htlcLockData", actual: "value", messages})}
                            return value;
                        }
                        offset += field.length;
                        let fieldIsZeroFilled = true;
                        for (let i = 0; i < fieldValue.length; i++) {
                            if (fieldValue[i] !== 0) {
                                fieldIsZeroFilled = false;
                                break;
                            }
                        }
                        if (fieldIsZeroFilled) {
                            ${this.makeError({type: "htlcLockData", actual: "value", messages})}
                            return value;
                        }
                        reencodedInput[field.name] = fieldValue;
                    }

                    if (!isSerialized && !htlcRule.equals(value, htlcRule.encode(reencodedInput))) {
                        ${this.makeError({type: "htlcLockData", actual: "value", messages})}
                    }

                    return value;
                `
            };
        });


        this.#validateCoreAdminOperationSchema = this.#compileCoreAdminOperationSchema();
        this.#validateAdminControlOperationSchema = this.#compileAdminControlOperationSchema();
        this.#validateRoleAccessOperationSchema = this.#compileRoleAccessOperationSchema();
        this.#validateBootstrapDeploymentSchema = this.#compileBootstrapDeploymentSchema();
        this.#validateTransactionOperationSchema = this.#compileTransactionOperationSchema();
        this.#validateTransferOperationSchema = this.#compileTransferOperationSchema();
        this.#validateBalanceInitializationSchema = this.#compileBalanceInitializationSchema();
        this.#validateSetEpochOperationSchema = this.#compileSetEpochOperationSchema();
        this.#validateConsensusControlOperationSchema = this.#compileConsensusControlOperationSchema();
        this.#validateHtlcLockOperationSchema = this.#compileHtlcLockOperationSchema();

    }

    #getOperationTypeName(operationType) {
        for (const [name, value] of Object.entries(OperationType)) {
            if (value === operationType) return name;
        }

        return undefined;
    }

    #operationTypeDomain(...values) {
        return {
            type: 'number',
            required: true,
            custom: (value, errors) => {
                if (!values.includes(value)) {
                    const singleValue = values.length === 1;
                    const expectedOperationType = values[0];
                    const expected = singleValue ? expectedOperationType : values;
                    const operationName = this.#getOperationTypeName(expectedOperationType);

                    errors.push({
                        type: 'valueNotAllowed',
                        actual: value,
                        expected,
                        field: 'type',
                        message: singleValue
                            ? `Operation type must be ${expectedOperationType} (${operationName})`
                            : `Operation type must be one of: ${values.join(', ')}`
                    });
                }

                return value;
            }
        };
    }

    // Complete by default - no writer needed
    #compileCoreAdminOperationSchema() {
        const addressLength = this.#config.addressLength
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(
                OperationType.ADD_ADMIN,
                OperationType.DISABLE_INITIALIZATION
            ),
            address: {type: 'buffer', length: addressLength, required: true}, // invoker adddress (admin)
            cao: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    iw: {type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // writer key of the admin
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateCoreAdminOperation(operation) {
        return this.#validateCoreAdminOperationSchema(operation) === true;
    }

    #compileBalanceInitializationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.BALANCE_INITIALIZATION),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            bio: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    ia: {type: 'buffer', length: this.#config.addressLength, required: true}, // selected address to specific operation.
                    am: {type: 'buffer', length: AMOUNT_BYTE_LENGTH, required: true}, // amount to transfer
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce of the invoker
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature of the invoker
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateBalanceInitialization(operation) {
        return this.#validateBalanceInitializationSchema(operation) === true;
    }

    // Complete by default - no writer needed
    #compileAdminControlOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(
                OperationType.APPEND_WHITELIST,
                OperationType.ADD_INDEXER,
                OperationType.REMOVE_INDEXER,
                OperationType.BAN_VALIDATOR
            ),
            address: {type: 'buffer', length: this.#config.addressLength, required: true}, // invoker adddress (admin)
            aco: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    ia: {type: 'buffer', length: this.#config.addressLength, required: true}, // incoming address - selected address for specific operation
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateAdminControlOperation(operation) {
        return this.#validateAdminControlOperationSchema(operation) === true;
    }

    #compileRoleAccessOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(
                OperationType.ADD_WRITER,
                OperationType.REMOVE_WRITER,
                OperationType.ADMIN_RECOVERY
            ),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            rao: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    iw: {type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // writing key of the invoker
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce of the invoker
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}

                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;
                    const {vn, vs, va} = value;
                    const vnPresent = vn !== undefined
                    const vsPresent = vs !== undefined
                    const vaPresent = va !== undefined

                    const fieldsPresent = [vnPresent, vsPresent, vaPresent].filter(Boolean).length;

                    if (fieldsPresent > 0 && fieldsPresent < 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'bdo',
                            message: 'Fields "vn", "vs", and "va" must all be present if any one is provided'
                        });
                    }
                    if (vn === null || vs === null || va === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'bdo',
                            message: 'Validator fields cannot be null, must be a Buffer or undefined'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateRoleAccessOperation(operation) {
        return this.#validateRoleAccessOperationSchema(operation) === true;
    }

    #compileTransactionOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.TX),
            address: {type: 'buffer', length: this.#config.addressLength, required: true}, // invoker address
            txo: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    iw: {type: 'buffer', length: WRITER_BYTE_LENGTH, required: true}, // Writing key of the requesting node (external subnetwork)
                    ch: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // Content hash (hash of the transaction's data)
                    bs: {type: 'buffer', length: BOOTSTRAP_BYTE_LENGTH, required: true}, // External bootstrap contract
                    mbs: {type: 'buffer', length: BOOTSTRAP_BYTE_LENGTH, required: true}, // MSB bootstrap key
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // Nonce of the requesting node
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // Requester's signature
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true}, //validator address
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true}, //validator nonce
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}, //validator signature
                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;
                    const {vn, vs, va} = value;
                    const vnPresent = vn !== undefined;
                    const vsPresent = vs !== undefined;
                    const vaPresent = va !== undefined;

                    const fieldsPresent = [vnPresent, vsPresent, vaPresent].filter(Boolean).length;

                    if (fieldsPresent > 0 && fieldsPresent < 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'bdo',
                            message: 'Fields "vn", "vs", and "va" must all be present if any one is provided'
                        });
                    }
                    if (vn === null || vs === null || va === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'bdo',
                            message: 'Validator fields cannot be null, must be a Buffer or undefined'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateTransactionOperation(op) {
        return this.#validateTransactionOperationSchema(op) === true;
    }

    #compileBootstrapDeploymentSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.BOOTSTRAP_DEPLOYMENT),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            bdo: {

                strict: true,
                type: "object",
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    bs: {type: 'buffer', length: BOOTSTRAP_BYTE_LENGTH, required: true},
                    ic: {type: 'buffer', length: CHANNEL_BYTE_LENGTH, required: true},
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true},
                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;
                    const {vn, vs, va} = value;
                    const vnPresent = vn !== undefined
                    const vsPresent = vs !== undefined
                    const vaPresent = va !== undefined

                    const fieldsPresent = [vnPresent, vsPresent, vaPresent].filter(Boolean).length;

                    if (fieldsPresent > 0 && fieldsPresent < 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'bdo',
                            message: 'Fields "vn", "vs", and "va" must all be present if any one is provided'
                        });
                    }
                    if (vn === null || vs === null || va === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'bdo',
                            message: 'Validator fields cannot be null, must be a Buffer or undefined'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateBootstrapDeploymentOperation(op) {
        return this.#validateBootstrapDeploymentSchema(op) === true;
    }

    #compileTransferOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.TRANSFER),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            tro: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx hash
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true}, // tx validity
                    to: {type: 'buffer', length: this.#config.addressLength, required: true}, // recipient address
                    am: {type: 'buffer_amount', length: AMOUNT_BYTE_LENGTH, required: true}, // amount to transfer
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true}, // nonce of the invoker
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true}, // signature of the invoker
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},  // validator address
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},  // validator nonce
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true} // validator signature

                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;
                    const {vn, vs, va} = value;
                    const vnPresent = vn !== undefined
                    const vsPresent = vs !== undefined
                    const vaPresent = va !== undefined

                    const fieldsPresent = [vnPresent, vsPresent, vaPresent].filter(Boolean).length;

                    if (fieldsPresent > 0 && fieldsPresent < 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'tro',
                            message: 'Fields "vn", "vs", and "va" must all be present if any one is provided'
                        });
                    }
                    if (vn === null || vs === null || va === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'tro',
                            message: 'Validator fields cannot be null, must be a Buffer or undefined'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateTransferOperation(op) {
        return this.#validateTransferOperationSchema(op) === true;
    }

    #compileSetEpochOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.SET_EPOCH),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            seo: {
                strict: true,
                type: 'object',
                props: {
                    pd: {type: 'proof_data', required: true}, // proof data
                    app: {
                        type: 'array',
                        required: true,
                        items: {type: 'proof_proposal_approval'}
                    }, // approvals
                },
            }
        };
        return this.#validator.compile(schema);
    }

    validateSetEpochOperation(op) {
        return this.#validateSetEpochOperationSchema(op) === true;
    }

    #compileConsensusControlOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(
                OperationType.SET_GENESIS_EPOCH,
                OperationType.SET_CONSENSUS_CONFIG
            ),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            cco: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    cc: {
                        strict: true,
                        type: 'object',
                        required: true,
                        props: {
                            sv: {type: 'buffer', length: CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH, required: true},
                            cd: {
                                type: 'buffer_max_length',
                                maxLength: CONSENSUS_CONFIG_DATA_MAX_SIZE,
                                required: true
                            },
                        }
                    },
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateConsensusControlOperation(op) {
        return this.#validateConsensusControlOperationSchema(op) === true;
    }

    #compileHtlcLockOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.HTLC_LOCK),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            hlo: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    ld: {type: 'htlc_lock_data', required: true},
                    am: {type: 'buffer_amount', length: AMOUNT_BYTE_LENGTH, required: true},
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateHtlcLockOperation(op) {
        return this.#validateHtlcLockOperationSchema(op) === true;
    }

}

export default StateValidationSchema;
