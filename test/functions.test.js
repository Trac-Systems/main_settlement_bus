import test from 'brittle';
import * as functions from '../src/utils/functions.js';

test('isHexString', (t) => {
    // t.ok(functions.isHexString('0x1234567890abcdef'), 'Valid hex string should return true'); // Deactivated. See TODO in functions.js
    t.ok(functions.isHexString('1234567890abcdef'), 'Valid hex string should return true');
    t.ok(functions.isHexString('1234567890xyz') === false, 'Invalid hex string should return false');
    t.ok(functions.isHexString('123456789') === false, 'Invalid size hex string should return false');
    // t.ok(functions.isHexString('') === false, 'Empty string should return false'); // Deactivated. See TODO in functions.js
});

test('createHash', async (t) => {
    // TODO: Add tests for other supported hash types
    t.test('sha256', async (k) => {
        const hash = await functions.createHash('sha256', 'test');
        k.is(typeof hash, 'string', 'Hash should be a string');
        k.ok(hash.length === 64, 'Hash should be 64 characters long');
        k.ok(hash.match(/^[a-f0-9]+$/), 'Hash should be a hex string');
        k.ok(hash !== await functions.createHash('sha256', 'Test'), 'Hash should be different for different inputs');
        k.ok(hash === await functions.createHash('sha256', 'test'), 'Hash should be the same for the same input');
    });
});