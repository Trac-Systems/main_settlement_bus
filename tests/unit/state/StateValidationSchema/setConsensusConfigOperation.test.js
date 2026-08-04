import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { CONSENSUS_CONFIG_DATA_MAX_SIZE } from '../../../../src/utils/constants.js';
import { CCO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import {
    topLevelValidationTests,
    valueLevelValidationTest,
    addressBufferLengthTest,
    fieldsBufferLengthTest
} from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);

test('validateConsensusControlOperation - config update happy path', t => {
    t.ok(
        stateValidationSchema.validateConsensusControlOperation(CCO.valid_set_consensus_config_operation),
        'Valid data for set consensus config operation should pass the validation'
    );
});

test('validateConsensusControlOperation - config update type level validation (cco)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateConsensusControlOperation.bind(stateValidationSchema),
        CCO.valid_set_consensus_config_operation,
        'cco',
        not_allowed_data_types,
        CCO.top_fields_set_consensus_config
    );
});

test('validateConsensusControlOperation - config update value level validation (cco)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateConsensusControlOperation.bind(stateValidationSchema),
        CCO.valid_set_consensus_config_operation,
        'cco',
        CCO.set_consensus_config_value_fields,
        not_allowed_data_types
    );
});

test('validateConsensusControlOperation - config update address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateConsensusControlOperation.bind(stateValidationSchema),
        CCO.valid_set_consensus_config_operation,
    );
});

test('validateConsensusControlOperation - config update fields buffer length validation - VALUE LEVEL (cco)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateConsensusControlOperation.bind(stateValidationSchema),
        CCO.valid_set_consensus_config_operation,
        'cco',
        CCO.required_length_of_fields_for_set_consensus_config
    );
});

test('validateConsensusControlOperation - config update value level validation (cco.cc)', t => {
    const validOperation = CCO.valid_set_consensus_config_operation;
    const validateConsensusConfig = fixture =>
        stateValidationSchema.validateConsensusControlOperation({
            ...validOperation,
            cco: {
                ...validOperation.cco,
                cc: fixture.cc
            }
        });
    const invalidDataTypes = not_allowed_data_types.filter(value => !b4a.isBuffer(value));

    valueLevelValidationTest(
        t,
        validateConsensusConfig,
        {cc: validOperation.cco.cc},
        'cc',
        CCO.consensus_config_fields,
        invalidDataTypes
    );
});

test('validateConsensusControlOperation - config update data buffer size validation (cco.cc.cd)', t => {
    const validOperation = CCO.valid_set_consensus_config_operation;
    const validateConfigData = cd =>
        stateValidationSchema.validateConsensusControlOperation({
            ...validOperation,
            cco: {
                ...validOperation.cco,
                cc: {
                    ...validOperation.cco.cc,
                    cd
                }
            }
        });

    t.absent(validateConfigData(b4a.alloc(0)), 'Empty config data buffer should fail');
    // `cd` is opaque binary data, so zero bytes are valid; only an empty buffer is forbidden.
    t.ok(validateConfigData(b4a.from([0x00])), 'Config data containing a zero byte should pass');
    t.ok(validateConfigData(b4a.alloc(1, 0x01)), 'One-byte config data buffer should pass');
    t.ok(
        validateConfigData(b4a.alloc(CONSENSUS_CONFIG_DATA_MAX_SIZE, 0x01)),
        `Config data buffer at the ${CONSENSUS_CONFIG_DATA_MAX_SIZE}-byte limit should pass`
    );
    t.absent(
        validateConfigData(b4a.alloc(CONSENSUS_CONFIG_DATA_MAX_SIZE + 1, 0x01)),
        `Config data buffer above the ${CONSENSUS_CONFIG_DATA_MAX_SIZE}-byte limit should fail`
    );
});

test('validateConsensusControlOperation - config update schema version uint8 validation (cco.cc.sv)', t => {
    const validOperation = CCO.valid_set_consensus_config_operation;
    const validateSchemaVersion = sv =>
        stateValidationSchema.validateConsensusControlOperation({
            ...validOperation,
            cco: {
                ...validOperation.cco,
                cc: {
                    ...validOperation.cco.cc,
                    sv
                }
            }
        });

    t.ok(validateSchemaVersion(b4a.from([0x01])), 'Minimum schema version should pass');
    t.ok(validateSchemaVersion(b4a.from([0xFF])), 'Maximum uint8 schema version should pass');

    t.absent(validateSchemaVersion(b4a.alloc(0)), 'Empty schema version buffer should fail');
    t.absent(validateSchemaVersion(b4a.from([0x00])), 'Zero schema version should fail');
    t.absent(validateSchemaVersion(b4a.from([0x01, 0x00])), 'Two-byte schema version should fail');
});
