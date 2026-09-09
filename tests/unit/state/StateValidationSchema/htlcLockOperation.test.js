import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import {config} from '../../../helpers/config.js';

const stateValidationSchema = new StateValidationSchema(config);

function makeValidOperation({complete = true} = {}) {
    const fixture = fixtures.validHtlcLockOperation;
    const operation = {
        ...fixture,
        hlo: {
            ...fixture.hlo,
            ss: fixture.hlo.ss.map(signer => b4a.from(signer)),
            cs: fixture.hlo.cs.map(signature => b4a.from(signature))
        }
    };

    if (!complete) {
        delete operation.hlo.va;
        delete operation.hlo.vn;
        delete operation.hlo.vs;
    }
    return operation;
}

test('validateHtlcLockOperation accepts complete and partial canonical locks', t => {
    t.ok(stateValidationSchema.validateHtlcLockOperation(makeValidOperation()));
    t.ok(stateValidationSchema.validateHtlcLockOperation(makeValidOperation({complete: false})));
});

test('validateHtlcLockOperation accepts a fee-free lock and optional policy omission', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.fa = b4a.alloc(16);
    delete operation.hlo.fr;
    delete operation.hlo.ph;

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));
});

test('validateHtlcLockOperation requires explicit lock fields', t => {
    const requiredFields = [
        'tx', 'txv', 'ca', 'ra', 'am', 'fa', 'hl', 're', 'cc', 'ss', 'th', 'cs', 'in', 'is'
    ];

    for (const field of requiredFields) {
        const operation = makeValidOperation({complete: false});
        delete operation.hlo[field];
        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), `${field} is required`);
    }
});

test('validateHtlcLockOperation enforces fee and fee-recipient pairing', t => {
    const missingRecipient = makeValidOperation({complete: false});
    delete missingRecipient.hlo.fr;
    t.absent(stateValidationSchema.validateHtlcLockOperation(missingRecipient));

    const recipientWithoutFee = makeValidOperation({complete: false});
    recipientWithoutFee.hlo.fa = b4a.alloc(16);
    t.absent(stateValidationSchema.validateHtlcLockOperation(recipientWithoutFee));

    const nullRecipient = makeValidOperation({complete: false});
    nullRecipient.hlo.fr = null;
    t.absent(stateValidationSchema.validateHtlcLockOperation(nullRecipient));
});

test('validateHtlcLockOperation enforces signer-set and threshold rules', t => {
    const duplicateSigners = makeValidOperation({complete: false});
    duplicateSigners.hlo.ss[1] = b4a.from(duplicateSigners.hlo.ss[0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(duplicateSigners));

    const unsortedSigners = makeValidOperation({complete: false});
    unsortedSigners.hlo.ss = [
        unsortedSigners.hlo.ss[0],
        b4a.alloc(32, 0xbb),
        b4a.alloc(32, 0xaa)
    ];
    unsortedSigners.hlo.th = b4a.from([1]);
    unsortedSigners.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(unsortedSigners));

    const zeroThreshold = makeValidOperation({complete: false});
    zeroThreshold.hlo.th = b4a.from([0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(zeroThreshold));

    const excessiveThreshold = makeValidOperation({complete: false});
    excessiveThreshold.hlo.th = b4a.from([3]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(excessiveThreshold));

    const unsatisfiedThreshold = makeValidOperation({complete: false});
    unsatisfiedThreshold.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(unsatisfiedThreshold));
});

test('validateHtlcLockOperation enforces cosigner signature structure', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.cs = [b4a.alloc(63, 1)];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'signatures must have the canonical length');

    operation.hlo.cs = [b4a.alloc(64, 1), b4a.alloc(64, 2)];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'signatures cannot outnumber cosigners');
});

test('validateHtlcLockOperation requires complete validator metadata as a group', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.va = fixtures.validHtlcLockOperation.hlo.va;
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.va = null;
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation));
});

test('validateHtlcLockOperation rejects malformed and unknown fields', t => {
    const badHashlock = makeValidOperation({complete: false});
    badHashlock.hlo.hl = b4a.alloc(31, 1);
    t.absent(stateValidationSchema.validateHtlcLockOperation(badHashlock));

    const zeroPrincipal = makeValidOperation({complete: false});
    zeroPrincipal.hlo.am = b4a.alloc(16);
    t.absent(stateValidationSchema.validateHtlcLockOperation(zeroPrincipal));

    const unknownField = makeValidOperation({complete: false});
    unknownField.hlo.ordered = true;
    t.absent(stateValidationSchema.validateHtlcLockOperation(unknownField));
});
