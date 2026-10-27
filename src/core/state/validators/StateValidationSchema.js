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
    EPOCH_BYTE_LENGTH,
    CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH,
    CONSENSUS_CONFIG_DATA_MAX_SIZE,
    SET_EPOCH_DATA_MAX_SIZE,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_MAX_SIGNERS,
    HTLC_PREIMAGE_BYTE_LENGTH,
    HTLC_THRESHOLD_BYTE_LENGTH,
    PUBLIC_KEY_LENGTH,
    HTLC_METADATA_MAX_BYTE_LENGTH,
} from '../../../utils/constants.js';
import {
    boundedHtlcBufferArray,
    registerStrictTypeRules,
    bufferRule,
    bufferMaxLengthRule,
    bufferAmountRule,
    createProofDataRule,
    createProofProposalApprovalRule
} from './stateValidationRules.js';

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
    #validateEpochProofV1Schema;
    #validateConsensusControlOperationSchema;
    #validateHtlcClaimOperationSchema;
    #validateHtlcLockOperationSchema;
    #validateHtlcRefundOperationSchema;
    #config;

    /**
     * @param {Config} config
     **/
    constructor(config) {
        this.#config = config;

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
            },
        });

        registerStrictTypeRules(this.#validator);
        this.#validator.add('buffer', bufferRule);
        this.#validator.add('buffer_max_length', bufferMaxLengthRule);
        this.#validator.add('buffer_amount', bufferAmountRule);
        this.#validator.add('proof_data', createProofDataRule(config.addressLength));
        this.#validator.add('proof_proposal_approval', createProofProposalApprovalRule(config.addressLength));

        this.#validateCoreAdminOperationSchema = this.#compileCoreAdminOperationSchema();
        this.#validateAdminControlOperationSchema = this.#compileAdminControlOperationSchema();
        this.#validateRoleAccessOperationSchema = this.#compileRoleAccessOperationSchema();
        this.#validateBootstrapDeploymentSchema = this.#compileBootstrapDeploymentSchema();
        this.#validateTransactionOperationSchema = this.#compileTransactionOperationSchema();
        this.#validateTransferOperationSchema = this.#compileTransferOperationSchema();
        this.#validateBalanceInitializationSchema = this.#compileBalanceInitializationSchema();
        this.#validateSetEpochOperationSchema = this.#compileSetEpochOperationSchema();
        this.#validateEpochProofV1Schema = this.#compileEpochProofV1Schema();
        this.#validateConsensusControlOperationSchema = this.#compileConsensusControlOperationSchema();
        this.#validateHtlcClaimOperationSchema = this.#compileHtlcClaimOperationSchema();
        this.#validateHtlcLockOperationSchema = this.#compileHtlcLockOperationSchema();
        this.#validateHtlcRefundOperationSchema = this.#compileHtlcRefundOperationSchema();
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
                if (typeof value !== 'number') return value;
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
                    sv: {
                        type: 'buffer',
                        length: CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH,
                        required: true
                    },
                    data: {
                        type: 'buffer_max_length',
                        maxLength: SET_EPOCH_DATA_MAX_SIZE,
                        required: true
                    }
                },
            }
        };
        return this.#validator.compile(schema);
    }

    validateSetEpochOperation(op) {
        return this.#validateSetEpochOperationSchema(op) === true;
    }

    #compileEpochProofV1Schema() {
        const schema = {
            $$strict: true,
            pd: {type: 'proof_data', required: true},
            app: {
                type: 'array',
                required: true,
                items: {type: 'proof_proposal_approval'}
            }
        };
        return this.#validator.compile(schema);
    }

    validateEpochProofV1(epochProof) {
        return this.#validateEpochProofV1Schema(epochProof) === true;
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

    #compileHtlcClaimOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.HTLC_CLAIM),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            hco: {
                strict: true,
                type: 'object',
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    li: {type: 'buffer', length: HTLC_LOCK_ID_BYTE_LENGTH, required: true},
                    pi: {type: 'buffer', length: HTLC_PREIMAGE_BYTE_LENGTH, required: true},
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}
                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;
                    const {va, vn, vs} = value;
                    const count = [va, vn, vs].filter(field => field !== undefined).length;
                    if (count !== 0 && count !== 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'hco',
                            message: 'Fields "va", "vn", and "vs" must all be present if any one is provided'
                        });
                    }
                    if (va === null || vn === null || vs === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'hco',
                            message: 'Validator fields cannot be null'
                        });
                    }
                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateHtlcClaimOperation(op) {
        return this.#validateHtlcClaimOperationSchema(op) === true;
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
                    ca: {type: 'buffer', length: this.#config.addressLength, required: true},
                    ra: {type: 'buffer', length: this.#config.addressLength, required: true},
                    am: {type: 'buffer', length: AMOUNT_BYTE_LENGTH, required: true},
                    fa: {type: 'buffer_amount', length: AMOUNT_BYTE_LENGTH, required: true},
                    fr: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    hl: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    re: {type: 'buffer', length: EPOCH_BYTE_LENGTH, required: true},
                    md: {type: 'buffer_max_length', maxLength: HTLC_METADATA_MAX_BYTE_LENGTH, optional: true},
                    ss: boundedHtlcBufferArray(1, HTLC_MAX_SIGNERS, PUBLIC_KEY_LENGTH),
                    th: {type: 'buffer', length: HTLC_THRESHOLD_BYTE_LENGTH, required: true},
                    cs: boundedHtlcBufferArray(0, HTLC_MAX_SIGNERS - 1, SIGNATURE_BYTE_LENGTH),
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}
                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;

                    const {fa, fr, md, ss, th, cs, va, vn, vs} = value;
                    if (fr === null || md === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'hlo',
                            message: 'Optional HTLC lock fields must be a Buffer or undefined'
                        });
                    }

                    if (b4a.isBuffer(fa) && fa.length === AMOUNT_BYTE_LENGTH) {
                        const feeIsZero = fa.every(byte => byte === 0);
                        if (feeIsZero === (fr !== undefined)) {
                            errors.push({
                                type: 'conditionalDependency',
                                field: 'hlo.fr',
                                message: 'Fee recipient must be present exactly when the HTLC fee amount is non-zero'
                            });
                        }
                    }

                    if (Array.isArray(ss) && ss.length <= HTLC_MAX_SIGNERS) {
                        const uniqueSignerKeys = new Set();
                        for (let index = 0; index < ss.length; index++) {
                            const signer = ss[index];
                            if (!b4a.isBuffer(signer) || signer.length !== PUBLIC_KEY_LENGTH) continue;

                            const signerHex = b4a.toString(signer, 'hex');
                            if (uniqueSignerKeys.has(signerHex)) {
                                errors.push({
                                    type: 'duplicateSigner',
                                    field: 'hlo.ss',
                                    message: 'HTLC signer set must not contain duplicate public keys'
                                });
                                break;
                            }
                            uniqueSignerKeys.add(signerHex);

                            if (
                                index > 1 &&
                                b4a.isBuffer(ss[index - 1]) &&
                                ss[index - 1].length === PUBLIC_KEY_LENGTH &&
                                b4a.compare(ss[index - 1], signer) >= 0
                            ) {
                                errors.push({
                                    type: 'signerOrder',
                                    field: 'hlo.ss',
                                    message: 'HTLC cosigner public keys must be sorted by raw bytes'
                                });
                                break;
                            }
                        }
                    }

                    if (b4a.isBuffer(th) && th.length === HTLC_THRESHOLD_BYTE_LENGTH && Array.isArray(ss)) {
                        const threshold = th[0];
                        if (threshold < 1 || threshold > ss.length) {
                            errors.push({
                                type: 'threshold',
                                field: 'hlo.th',
                                message: 'HTLC threshold must be between one and the signer-set size'
                            });
                        } else if (Array.isArray(cs) && 1 + cs.length < threshold) {
                            errors.push({
                                type: 'threshold',
                                field: 'hlo.cs',
                                message: 'HTLC signatures do not satisfy the declared threshold'
                            });
                        }
                    }

                    if (Array.isArray(cs) && Array.isArray(ss) && cs.length > ss.length - 1) {
                        errors.push({
                            type: 'signatureCount',
                            field: 'hlo.cs',
                            message: 'HTLC cosigner signatures cannot outnumber the cosigner keys'
                        });
                    }

                    const validatorFieldsPresent = [va, vn, vs].filter(field => field !== undefined).length;
                    if (validatorFieldsPresent > 0 && validatorFieldsPresent < 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'hlo',
                            message: 'Fields "va", "vn", and "vs" must all be present if any one is provided'
                        });
                    }
                    if (va === null || vn === null || vs === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'hlo',
                            message: 'Validator fields cannot be null, must be a Buffer or undefined'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateHtlcLockOperation(op) {
        return this.#validateHtlcLockOperationSchema(op) === true;
    }

    #compileHtlcRefundOperationSchema() {
        const schema = {
            $$strict: true,
            type: this.#operationTypeDomain(OperationType.HTLC_REFUND),
            address: {type: 'buffer', length: this.#config.addressLength, required: true},
            hro: {
                strict: true,
                type: 'object',
                required: true,
                props: {
                    tx: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    txv: {type: 'buffer', length: HASH_BYTE_LENGTH, required: true},
                    li: {type: 'buffer', length: HTLC_LOCK_ID_BYTE_LENGTH, required: true},
                    in: {type: 'buffer', length: NONCE_BYTE_LENGTH, required: true},
                    is: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, required: true},
                    va: {type: 'buffer', length: this.#config.addressLength, optional: true},
                    vn: {type: 'buffer', length: NONCE_BYTE_LENGTH, optional: true},
                    vs: {type: 'buffer', length: SIGNATURE_BYTE_LENGTH, optional: true}
                },
                custom: (value, errors) => {
                    if (!value || typeof value !== 'object') return value;

                    const {va, vn, vs} = value;
                    const count = [va, vn, vs].filter(field => field !== undefined).length;
                    if (count !== 0 && count !== 3) {
                        errors.push({
                            type: 'conditionalDependency',
                            field: 'hro',
                            message: 'Fields "va", "vn", and "vs" must all be present if any one is provided'
                        });
                    }
                    if (va === null || vn === null || vs === null) {
                        errors.push({
                            type: 'buffer',
                            field: 'hro',
                            message: 'Validator fields cannot be null'
                        });
                    }

                    return value;
                }
            }
        };
        return this.#validator.compile(schema);
    }

    validateHtlcRefundOperation(op) {
        return this.#validateHtlcRefundOperationSchema(op) === true;
    }

}

export default StateValidationSchema;
