import test from 'brittle';
import b4a from 'b4a';
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import {encodeHtlcLockData} from '../../../../src/codecs/apply/applyOperationCodec.js';
import {OperationType} from '../../../../src/utils/constants.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import {config} from '../../../helpers/config.js';
import {addressToBuffer} from '../../../../src/core/state/utils/address.js';
import {asAddress} from '../../../helpers/address.js';

const stateValidationSchema = new StateValidationSchema(config);

const validOperation = {
    type: OperationType.HTLC_LOCK,
    address: addressToBuffer(asAddress('544514242356432739de9af71deb8d526fb03d6c5c15e0a934d9a20b6710e2fe'), config.addressPrefix),
    hlo: {
        tx: b4a.alloc(32, 1),
        txv: b4a.alloc(32, 2),
        ld: encodeHtlcLockData(fixtures.validHtlcLockData),
        am: b4a.from('00000000000000000000000000000001', 'hex'),
        in: b4a.alloc(32, 3),
        is: b4a.alloc(64, 4)
    }
};

test('validateHtlcLockOperation accepts a valid opaque lock-data payload', t => {
    t.ok(stateValidationSchema.validateHtlcLockOperation(validOperation));
});

test('validateHtlcLockOperation rejects malformed opaque lock-data payloads', t => {
    const malformed = {
        ...validOperation,
        hlo: {
            ...validOperation.hlo,
            ld: encodeHtlcLockData({...fixtures.validHtlcLockData, ee: b4a.alloc(7, 1)})
        }
    };

    t.absent(stateValidationSchema.validateHtlcLockOperation(malformed));
});
