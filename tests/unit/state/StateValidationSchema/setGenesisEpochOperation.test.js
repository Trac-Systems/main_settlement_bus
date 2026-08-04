import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import { CONSENSUS_CONFIG_DATA_MAX_SIZE } from '../../../../src/utils/constants.js';
import { SGO, not_allowed_data_types } from '../../../fixtures/check.fixtures.js';
import { topLevelValidationTests, valueLevelValidationTest, addressBufferLengthTest, fieldsBufferLengthTest } from './common.test.js';
import { config } from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);

test('validateSetGenesisEpochOperation - happy path', t => {
    t.ok(
        stateValidationSchema.validateSetGenesisEpochOperation(SGO.valid_set_genesis_epoch_operation),
        'Valid data for set genesis epoch operation should pass the validation'
    );
});

test('validateSetGenesisEpochOperation - type level validation (sgo)', t => {
    topLevelValidationTests(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        not_allowed_data_types,
        SGO.top_fields_set_genesis_epoch
    );
});

test('validateSetGenesisEpochOperation - value level validation (sgo)', t => {
    valueLevelValidationTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        SGO.set_genesis_epoch_value_fields,
        not_allowed_data_types
    );
});

test('validateSetGenesisEpochOperation - address buffer length validation - TOP LEVEL', t => {
    addressBufferLengthTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
    );
});

test('validateSetGenesisEpochOperation - fields buffer length validation - VALUE LEVEL (sgo)', t => {
    fieldsBufferLengthTest(
        t,
        stateValidationSchema.validateSetGenesisEpochOperation.bind(stateValidationSchema),
        SGO.valid_set_genesis_epoch_operation,
        'sgo',
        SGO.required_length_of_fields_for_set_genesis_epoch
    );
});

test('validateSetGenesisEpochOperation - consensus config value level validation (sgo.cc)', t => {
    const validOperation = SGO.valid_set_genesis_epoch_operation;
    const validateConsensusConfig = fixture =>
        stateValidationSchema.validateSetGenesisEpochOperation({
            ...validOperation,
            sgo: {
                ...validOperation.sgo,
                cc: fixture.cc
            }
        });
    const invalidDataTypes = not_allowed_data_types.filter(value => !b4a.isBuffer(value));

    valueLevelValidationTest(
        t,
        validateConsensusConfig,
        {cc: validOperation.sgo.cc},
        'cc',
        SGO.consensus_config_fields,
        invalidDataTypes
    );
});

test('validateSetGenesisEpochOperation - config data buffer size validation (sgo.cc.cd)', t => {
    const validOperation = SGO.valid_set_genesis_epoch_operation;
    const validateConfigData = cd =>
        stateValidationSchema.validateSetGenesisEpochOperation({
            ...validOperation,
            sgo: {
                ...validOperation.sgo,
                cc: {
                    ...validOperation.sgo.cc,
                    cd
                }
            }
        });

    t.absent(validateConfigData(b4a.alloc(0)), 'Empty config data buffer should fail');
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

test('validateSetGenesisEpochOperation - schema version uint8 validation (sgo.cc.sv)', t => {
    const validOperation = SGO.valid_set_genesis_epoch_operation;
    const validateSchemaVersion = sv =>
        stateValidationSchema.validateSetGenesisEpochOperation({
            ...validOperation,
            sgo: {
                ...validOperation.sgo,
                cc: {
                    ...validOperation.sgo.cc,
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
