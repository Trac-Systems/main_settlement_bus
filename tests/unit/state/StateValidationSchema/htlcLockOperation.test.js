import test from 'brittle';
import b4a from 'b4a';

import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import {config} from '../../../helpers/config.js';
import {HTLC_MAX_SIGNERS} from '../../../../src/utils/constants.js';

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

test('validateHtlcLockOperation counts the maker in a maker-only threshold', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.ss = [operation.hlo.ss[0]];
    operation.hlo.th = b4a.from([1]);
    operation.hlo.cs = [];

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.th = b4a.from([0]);
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'zero does not count the mandatory maker');
});

test('validateHtlcLockOperation requires explicit lock fields', t => {
    const requiredFields = [
        'tx', 'txv', 'ca', 'ra', 'am', 'fa', 'hl', 're', 'ss', 'th', 'cs', 'in', 'is'
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

test('validateHtlcLockOperation rejects duplicate keys across byte representations', t => {
    for (const makerIsUint8Array of [false, true]) {
        const operation = makeValidOperation({complete: false});
        const maker = operation.hlo.ss[0];
        operation.hlo.ss = makerIsUint8Array
            ? [new Uint8Array(maker), b4a.from(maker)]
            : [b4a.from(maker), new Uint8Array(maker)];
        operation.hlo.th = b4a.from([1]);
        operation.hlo.cs = [];

        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'identical bytes are duplicate keys');
    }

    const distinctSigners = makeValidOperation({complete: false});
    distinctSigners.hlo.ss[1] = new Uint8Array(distinctSigners.hlo.ss[1]);
    t.ok(stateValidationSchema.validateHtlcLockOperation(distinctSigners), 'distinct keys may use mixed representations');
});

test('validateHtlcLockOperation handles Buffer and Uint8Array thresholds consistently', t => {
    for (const threshold of [1, 2]) {
        for (const asUint8Array of [false, true]) {
            const operation = makeValidOperation({complete: false});
            operation.hlo.th = asUint8Array ? new Uint8Array([threshold]) : b4a.from([threshold]);
            t.ok(stateValidationSchema.validateHtlcLockOperation(operation), `threshold ${threshold} is accepted`);
        }
    }

    for (const bytes of [[0], [3], [255], [], [1, 0]]) {
        for (const asUint8Array of [false, true]) {
            const operation = makeValidOperation({complete: false});
            operation.hlo.th = asUint8Array ? new Uint8Array(bytes) : b4a.from(bytes);
            t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'invalid thresholds are rejected without throwing');
        }
    }
});

test('validateHtlcLockOperation rejects oversized arrays without visiting entries', t => {
    for (const [field, maximum] of [['ss', HTLC_MAX_SIGNERS], ['cs', HTLC_MAX_SIGNERS - 1]]) {
        const operation = makeValidOperation({complete: false});
        const value = operation.hlo[field][0];
        const entries = Array(maximum + 1).fill(value);
        let entryReads = 0;
        Object.defineProperty(entries, 0, {
            get() {
                entryReads++;
                return value;
            },
            set(_value) {},
            enumerable: true,
            configurable: true
        });
        operation.hlo[field] = entries;

        t.absent(stateValidationSchema.validateHtlcLockOperation(operation), `${field} exceeds its limit`);
        t.is(entryReads, 0, `${field} entries are not inspected`);
    }
});

test('validateHtlcLockOperation accepts maximum-sized authorization arrays', t => {
    const operation = makeValidOperation({complete: false});
    operation.hlo.ss = [
        operation.hlo.ss[0],
        ...Array.from({length: HTLC_MAX_SIGNERS - 1}, (_, index) => b4a.alloc(32, index + 1))
    ];
    operation.hlo.th = b4a.from([HTLC_MAX_SIGNERS]);
    operation.hlo.cs = Array(HTLC_MAX_SIGNERS - 1).fill(operation.hlo.cs[0]);

    t.ok(stateValidationSchema.validateHtlcLockOperation(operation));

    operation.hlo.ss = [];
    operation.hlo.cs = [];
    t.absent(stateValidationSchema.validateHtlcLockOperation(operation), 'an empty signer set is rejected');
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

    const removedField = makeValidOperation({complete: false});
    removedField.hlo.cc = b4a.alloc(32, 1);
    t.absent(stateValidationSchema.validateHtlcLockOperation(removedField), 'the removed field is not accepted');
});
