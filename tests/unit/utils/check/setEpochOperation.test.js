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
    VDF_BLOB_PROOF_SIZE
} from '../../../../src/utils/constants.js';
import { SEO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest } from './common.test.js';
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
    {name: 'config_id', length: HASH_BYTE_LENGTH},
    {name: 'vdf_proof', length: VDF_BLOB_PROOF_SIZE},
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
        pd: b4a.from(SEO.valid_set_epoch_operation.seo.pd),
        app: SEO.valid_set_epoch_operation.seo.app.map(approval => b4a.from(approval))
    }
});

const withSetEpochProofData = proofData => {
    const operation = cloneSetEpochOperation();
    operation.seo.pd = proofData;
    return operation;
};

const withApprovals = approvals => {
    const operation = cloneSetEpochOperation();
    operation.seo.app = approvals;
    return operation;
};

const setEpochValueNotAllowedDataTypes = not_allowed_data_types.filter(value => !Array.isArray(value));

test('validateSetEpochOperation - happy path', t => {
    t.ok(stateValidationSchema.validateSetEpochOperation(SEO.valid_set_epoch_operation), 'Valid data for set epoch operation should pass the validation')
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

test('validateSetEpochOperation - value level validation (seo)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateSetEpochOperation.bind(stateValidationSchema),
        SEO.valid_set_epoch_operation,
        'seo',
        SEO.set_epoch_value_fields,
        setEpochValueNotAllowedDataTypes
    );
});

test('validateSetEpochOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateSetEpochOperation.bind(stateValidationSchema),
        SEO.valid_set_epoch_operation,
    );
});

test('validateSetEpochOperation - proof data validation (seo.pd)', t => {
    for (const invalidProofData of not_allowed_data_types) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(invalidProofData)),
            `proof data with invalid data type should fail: ${String(invalidProofData)} (${typeof invalidProofData})`
        );
    }

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(b4a.alloc(32, 0x15))),
        'proof data with invalid encoding should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(
            b4a.concat([b4a.from(SEO.valid_set_epoch_operation.seo.pd), UNKNOWN_PROTOBUF_FIELD])
        )),
        'proof data with unknown protobuf field should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(encodedProofDataInReverseFieldOrder())),
        'proof data encoded in unexpected field order should fail'
    );

    for (const {name} of PROOF_DATA_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(encodedProofDataWithoutField(name))),
            `proof data without ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(
                b4a.concat([
                    b4a.from(SEO.valid_set_epoch_operation.seo.pd),
                    encodedProofDataSingleField(name, consensusFixtures.proofProposal[name])
                ])
            )),
            `proof data with duplicate ${name} field should fail`
        );
    }

    for (const {name, length} of PROOF_DATA_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(encodedProofData({
                [name]: b4a.alloc(0)
            }))),
            `proof data with empty ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(encodedProofData({
                [name]: b4a.alloc(length - 1, 0x15)
            }))),
            `proof data with ${name} one byte too short should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withSetEpochProofData(encodedProofData({
                [name]: b4a.alloc(length + 1, 0x15)
            }))),
            `proof data with ${name} one byte too long should fail`
        );

        const proofDataWithZeroField = withSetEpochProofData(encodedProofData({
            [name]: b4a.alloc(length)
        }));

        t.absent(
            stateValidationSchema.validateSetEpochOperation(proofDataWithZeroField),
            `proof data with zero-filled ${name} should fail`
        );
    }
});

test('validateSetEpochOperation - approvals validation (seo.app)', t => {
    t.ok(stateValidationSchema.validateSetEpochOperation(cloneSetEpochOperation()), 'valid set epoch operation should pass');

    t.ok(stateValidationSchema.validateSetEpochOperation(withApprovals([])), 'empty approvals should pass schema validation');

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals([b4a.alloc(0)])),
        'empty approval value should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals(b4a.alloc(64, 0x15))),
        'single approval buffer should fail'
    );

    for (const invalidItem of not_allowed_data_types) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([
                b4a.from(SEO.valid_set_epoch_operation.seo.app[0]),
                invalidItem
            ])),
            `invalid approval item data type should fail: ${String(invalidItem)} (${typeof invalidItem})`
        );
    }

    const sparseApprovals = [b4a.from(SEO.valid_set_epoch_operation.seo.app[0])];
    sparseApprovals.length = 2;
    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals(sparseApprovals)),
        'sparse approvals array should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals([b4a.alloc(32, 0x15)])),
        'approval item with invalid encoding should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals([
            b4a.concat([b4a.from(SEO.valid_set_epoch_operation.seo.app[0]), UNKNOWN_PROTOBUF_FIELD])
        ])),
        'approval item with unknown protobuf field should fail'
    );

    t.absent(
        stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalInReverseFieldOrder()])),
        'approval item encoded in unexpected field order should fail'
    );

    for (const {name} of APPROVAL_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalWithoutField(name)])),
            `approval without ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([
                b4a.concat([
                    b4a.from(SEO.valid_set_epoch_operation.seo.app[0]),
                    encodedApprovalSingleField(name, consensusFixtures.proofProposalApproval[name])
                ])
            ])),
            `approval with duplicate ${name} field should fail`
        );
    }

    for (const {name, length} of APPROVAL_FIELD_RULES) {
        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(0)
            })])),
            `approval with empty ${name} should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length - 1, 0x15)
            })])),
            `approval with ${name} one byte too short should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length + 1, 0x15)
            })])),
            `approval with ${name} one byte too long should fail`
        );

        t.absent(
            stateValidationSchema.validateSetEpochOperation(withApprovals([encodedApprovalWithOverrides({
                [name]: b4a.alloc(length)
            })])),
            `approval with zero-filled ${name} should fail`
        );
    }
});
