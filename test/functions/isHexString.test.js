import test from 'brittle';
import { isHexString } from '../../src/utils/functions.js';

test('isHexString', (t) => {
    // t.ok(isHexString('0x1234567890abcdef'), 'Valid hex string should return true'); // Deactivated. See TODO in functions.js
    t.ok(isHexString('1234567890abcdef'), 'Valid hex string should return true');
    t.ok(isHexString('1234567890xyz') === false, 'Invalid hex string should return false');
    t.ok(isHexString('123456789') === false, 'Invalid size hex string should return false');
    // t.ok(isHexString('') === false, 'Empty string should return false'); // Deactivated. See TODO in functions.js
});