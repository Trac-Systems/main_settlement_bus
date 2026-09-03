import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import {
    encodeProofProposal,
    encodeProofProposalApproval
} from '../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import {
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    NETWORK_ID_BYTE_LENGTH,
    PROTOCOL_VERSION_BYTE_LENGTH,
    SIGNATURE_BYTE_LENGTH,
    SET_EPOCH_DATA_MAX_SIZE,
    VDF_DIFFICULTY_SIZE,
    VDF_DISCRIMINANT_SIZE,
    VDF_PROOF_BYTE_LENGTHS
} from '../../../../src/utils/constants.js';
import {uint16ToBuffer} from '../../../../src/utils/buffer.js';
import { SEO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, addressBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';
import consensusFixtures from '../../../fixtures/consensusV1Operation.fixtures.js';

const stateValidationSchema = new StateValidationSchema(config);
const UNKNOWN_PROTOBUF_FIELD = b4a.from([0x9a, 0x06, 0x01, 0xff]);

const PROOF_DATA_FIELD_RULES = Object.freeze([
    {name: 'protocol_version', length: PROTOCOL_VERSION_BYTE_LENGTH},
    {name: 'network_id', length: NETWORK_ID_BYTE_LENGTH},
    {name: 'epoch', length: EPOCH_BYTE_LENGTH},
    {name: 'previous_epoch_record_hash', length: HASH_BYTE_LENGTH},
    {name: 'proposer', length: config.addressLength},
    {name: 'difficulty', length: VDF_DIFFICULTY_SIZE},
    {name: 'discriminant_bit_size', length: VDF_DISCRIMINANT_SIZE},
    {name: 'proof', length: VDF_PROOF_BYTE_LENGTHS[2048]},
    {name: 'signature', length: SIGNATURE_BYTE_LENGTH}
]);

const APPROVAL_FIELD_RULES = Object.freeze([
    {name: 'approver', length: config.addressLength},
    {name: 'approval_sig', length: SIGNATURE_BYTE_LENGTH}
]);

const proofDataPayload = overrides => ({
    ...consensusFixtures.proofProposal,
    ...overrides
});

const encodedProofData = overrides => encodeProofProposal({
    ...proofDataPayload(overrides)
});

const encodedProofDataWithoutField = fieldName => {
    const payload = proofDataPayload();
    delete payload[fieldName];
    return encodeProofProposal(payload);
};

const encodedProofDataSingleField = (fieldName, value) => encodeProofProposal({
    [fieldName]: value
});

const encodedProofDataInReverseFieldOrder = () => b4a.concat(
    [...PROOF_DATA_FIELD_RULES]
        .reverse()
        .map(({name}) => encodedProofDataSingleField(name, consensusFixtures.proofProposal[name]))
);

const approvalPayload = overrides => ({
    ...consensusFixtures.proofProposalApproval,
    ...overrides
});

const encodedApprovalWithOverrides = overrides => encodeProofProposalApproval(approvalPayload(overrides));

const encodedApprovalWithoutField = fieldName => {
    const payload = approvalPayload();
    delete payload[fieldName];
    return encodeProofProposalApproval(payload);
};

const encodedApprovalSingleField = (fieldName, value) => encodeProofProposalApproval({
    [fieldName]: value
});

const encodedApprovalInReverseFieldOrder = () => b4a.concat([
    encodedApprovalSingleField('approval_sig', consensusFixtures.proofProposalApproval.approval_sig),
    encodedApprovalSingleField('approver', consensusFixtures.proofProposalApproval.approver)
]);

const cloneSetEpochOperation = () => ({
    ...SEO.valid_set_epoch_operation,
    seo: {
        sv: b4a.from(SEO.valid_set_epoch_operation.seo.sv),
        data: b4a.from(SEO.valid_set_epoch_operation.seo.data)
    }
});

const cloneEpochProofV1 = () => ({
    pd: b4a.from(SEO.valid_epoch_proof_v1.pd),
    app: SEO.valid_epoch_proof_v1.app.map(approval => b4a.from(approval))
});

const withProofData = proofData => {
    const epochProof = cloneEpochProofV1();
    epochProof.pd = proofData;
    return epochProof;
};

const withApprovals = approvals => {
    const epochProof = cloneEpochProofV1();
    epochProof.app = approvals;
    return epochProof;
};

test('validateSetEpochOperation - happy path', t => {
    t.ok(stateValidationSchema.validateSetEpochOperation(cloneSetEpochOperation()), 'Valid data for set epoch operation should pass the validation')
})

test('validateSetEpochOperation - type level validation (seo)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateSetEpochOperation.bind(stateValidationSchema),
        SEO.valid_set_epoch_operation,
        'seo',
        not_allowed_data_types,
        SEO.top_fields_set_epoch
    );
});

test('validateSetEpochOperation - requires schema version and data', t => {
    for (const field of SEO.set_epoch_value_fields) {
        const operation = cloneSetEpochOperation();
        delete operation.seo[field];
        t.absent(stateValidationSchema.validateSetEpochOperation(operation), `Missing seo.${field} should fail`);
    }
});

test('validateSetEpochOperation - schema version validation (seo.sv)', t => {
    for (const value of not_allowed_data_types) {
        const operation = cloneSetEpochOperation();
        operation.seo.sv = value;
        t.absent(stateValidationSchema.validateSetEpochOperation(operation), `Invalid schema version should fail: ${String(value)}`);
    }

    for (const value of [b4a.alloc(0), b4a.from([0x00]), b4a.from([0x01, 0x02])]) {
        const operation = cloneSetEpochOperation();
        operation.seo.sv = value;
        t.absent(stateValidationSchema.validateSetEpochOperation(operation), `Invalid schema version length/value should fail`);
    }

    const operation = cloneSetEpochOperation();
    operation.seo.sv = b4a.from([0xff]);
    t.ok(stateValidationSchema.validateSetEpochOperation(operation), 'Unknown non-zero schema version should pass structural validation');
});

test('validateSetEpochOperation - data validation (seo.data)', t => {
    for (const value of not_allowed_data_types.filter(value => !b4a.isBuffer(value))) {
        const operation = cloneSetEpochOperation();
        operation.seo.data = value;
        t.absent(stateValidationSchema.validateSetEpochOperation(operation), `Invalid data should fail: ${String(value)}`);
    }

    const emptyDataOperation = cloneSetEpochOperation();
    emptyDataOperation.seo.data = b4a.alloc(0);
    t.absent(stateValidationSchema.validateSetEpochOperation(emptyDataOperation), 'Empty data should fail');

    const opaqueDataOperation = cloneSetEpochOperation();
    opaqueDataOperation.seo.data = b4a.alloc(32);
    t.ok(stateValidationSchema.validateSetEpochOperation(opaqueDataOperation), 'Opaque non-empty data should pass structural validation');

    const maximumDataOperation = cloneSetEpochOperation();
    maximumDataOperation.seo.data = b4a.alloc(SET_EPOCH_DATA_MAX_SIZE);
    t.ok(stateValidationSchema.validateSetEpochOperation(maximumDataOperation), 'Data at the 3 KiB limit should pass');

    const oversizedDataOperation = cloneSetEpochOperation();
    oversizedDataOperation.seo.data = b4a.alloc(SET_EPOCH_DATA_MAX_SIZE + 1);
    t.absent(stateValidationSchema.validateSetEpochOperation(oversizedDataOperation), 'Data above the 3 KiB limit should fail');
});

test('validateSetEpochOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateSetEpochOperation.bind(stateValidationSchema),
        SEO.valid_set_epoch_operation,
    );
});

test('validateEpochProofV1 - structure validation', t => {
    t.ok(stateValidationSchema.validateEpochProofV1(cloneEpochProofV1()), 'Valid EpochProofV1 should pass');

    for (const value of not_allowed_data_types) {
        t.absent(stateValidationSchema.validateEpochProofV1(value), `Invalid EpochProofV1 should fail: ${String(value)}`);
    }

    for (const field of ['pd', 'app']) {
        const epochProof = cloneEpochProofV1();
        delete epochProof[field];
        t.absent(stateValidationSchema.validateEpochProofV1(epochProof), `Missing ${field} should fail`);
    }

    const epochProofWithExtraField = {
        ...cloneEpochProofV1(),
        extra: b4a.from([0x01])
    };
    t.absent(stateValidationSchema.validateEpochProofV1(epochProofWithExtraField), 'Unknown fields should fail');
});

test('validateEpochProofV1 - proof data validation (pd)', t => {
    for (const invalidProofData of not_allowed_data_types) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(invalidProofData)),
            `proof data with invalid data type should fail: ${String(invalidProofData)} (${typeof invalidProofData})`
        );
    }

    t.absent(
        stateValidationSchema.validateEpochProofV1(withProofData(b4a.alloc(32, 0x15))),
        'proof data with invalid encoding should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withProofData(
            b4a.concat([b4a.from(SEO.valid_epoch_proof_v1.pd), UNKNOWN_PROTOBUF_FIELD])
        )),
        'proof data with unknown protobuf field should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withProofData(encodedProofDataInReverseFieldOrder())),
        'proof data encoded in unexpected field order should fail'
    );

    for (const {name} of PROOF_DATA_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(encodedProofDataWithoutField(name))),
            `proof data without ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(
                b4a.concat([
                    b4a.from(SEO.valid_epoch_proof_v1.pd),
                    encodedProofDataSingleField(name, consensusFixtures.proofProposal[name])
                ])
            )),
            `proof data with duplicate ${name} field should fail`
        );
    }

    for (const {name, length} of PROOF_DATA_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(encodedProofData({
                [name]: b4a.alloc(0)
            }))),
            `proof data with empty ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(encodedProofData({
                [name]: b4a.alloc(length - 1, 0x15)
            }))),
            `proof data with ${name} one byte too short should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withProofData(encodedProofData({
                [name]: b4a.alloc(length + 1, 0x15)
            }))),
            `proof data with ${name} one byte too long should fail`
        );

        const proofDataWithZeroField = withProofData(encodedProofData({
            [name]: b4a.alloc(length)
        }));

        t.absent(
            stateValidationSchema.validateEpochProofV1(proofDataWithZeroField),
            `proof data with zero-filled ${name} should fail`
        );
    }
});

test('validateEpochProofV1 - proof length depends on discriminant bit size', t => {
    for (const [discriminantBitSize, proofLength] of Object.entries(VDF_PROOF_BYTE_LENGTHS)) {
        const overrides = {
            discriminant_bit_size: uint16ToBuffer(Number(discriminantBitSize)),
            proof: b4a.alloc(proofLength, 0x15)
        };

        t.ok(
            stateValidationSchema.validateEpochProofV1(
                withProofData(encodedProofData(overrides))
            ),
            `${discriminantBitSize}-bit discriminant should accept a ${proofLength}-byte proof`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(
                withProofData(encodedProofData({
                    ...overrides,
                    proof: b4a.alloc(proofLength + 1, 0x15)
                }))
            ),
            `${discriminantBitSize}-bit discriminant should reject a proof with the wrong length`
        );
    }

    t.absent(
        stateValidationSchema.validateEpochProofV1(
            withProofData(encodedProofData({
                discriminant_bit_size: uint16ToBuffer(3072),
                proof: b4a.alloc(VDF_PROOF_BYTE_LENGTHS[2048], 0x15)
            }))
        ),
        'unsupported discriminant bit size should fail'
    );
});

test('validateEpochProofV1 - approvals validation (app)', t => {
    t.ok(stateValidationSchema.validateEpochProofV1(cloneEpochProofV1()), 'valid epoch proof should pass');

    t.ok(stateValidationSchema.validateEpochProofV1(withApprovals([])), 'empty approvals should pass schema validation');

    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals([b4a.alloc(0)])),
        'empty approval value should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals(b4a.alloc(64, 0x15))),
        'single approval buffer should fail'
    );

    for (const invalidItem of not_allowed_data_types) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([
                b4a.from(SEO.valid_epoch_proof_v1.app[0]),
                invalidItem
            ])),
            `invalid approval item data type should fail: ${String(invalidItem)} (${typeof invalidItem})`
        );
    }

    const sparseApprovals = [b4a.from(SEO.valid_epoch_proof_v1.app[0])];
    sparseApprovals.length = 2;
    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals(sparseApprovals)),
        'sparse approvals array should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals([b4a.alloc(32, 0x15)])),
        'approval item with invalid encoding should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals([
            b4a.concat([b4a.from(SEO.valid_epoch_proof_v1.app[0]), UNKNOWN_PROTOBUF_FIELD])
        ])),
        'approval item with unknown protobuf field should fail'
    );

    t.absent(
        stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalInReverseFieldOrder()])),
        'approval item encoded in unexpected field order should fail'
    );

    for (const {name} of APPROVAL_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalWithoutField(name)])),
            `approval without ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([
                b4a.concat([
                    b4a.from(SEO.valid_epoch_proof_v1.app[0]),
                    encodedApprovalSingleField(name, consensusFixtures.proofProposalApproval[name])
                ])
            ])),
            `approval with duplicate ${name} field should fail`
        );
    }

    for (const {name, length} of APPROVAL_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(0)
            })])),
            `approval with empty ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length - 1, 0x15)
            })])),
            `approval with ${name} one byte too short should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length + 1, 0x15)
            })])),
            `approval with ${name} one byte too long should fail`
        );

        t.absent(
            stateValidationSchema.validateEpochProofV1(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length)
            })])),
            `approval with zero-filled ${name} should fail`
        );
    }
});
