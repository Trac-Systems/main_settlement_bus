import test from 'brittle';
import b4a from 'b4a';
import { createHash } from '../../src/utils/crypto.js';

test('createHash', async (t) => {
    t.test('sha256', async (k) => {
        const hash = await createHash('sha256', 'test');
        const expectedResult = b4a.from("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", 'hex');
        k.ok(b4a.isBuffer(hash), 'Hash should be a buffer');
        k.ok(hash.length === 32, 'Hash should be 32 bytes long');
        k.ok(hash.equals(expectedResult), 'Hash result should be the expected one');
        k.ok(hash.equals(await createHash('sha256', 'test')), 'Hash should be the same for the same input');
        k.ok(!hash.equals(await createHash('sha256', 'Test')), 'Hash should be different for different inputs');
    });

    // TODO: Uncomment the following tests when the createHash function is fixed to work in the Bare environment

    // t.test('sha1', async (k) => {
    //     const hash = await createHash('sha1', 'test');
    //     const expectedResult = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";
    //     console.log(">>>>>>>>>> hash sha1: ", hash);
    //     k.is(typeof hash, 'string', 'Hash should be a string');
    //     k.ok(hash.length === 40, 'Hash should be 40 characters long');
    //     k.ok(hash.match(/^[a-f0-9]+$/), 'Hash should be a hex string');
    //     k.ok(hash !== await createHash('sha1', 'Test'), 'Hash should be different for different inputs');
    //     k.ok(hash === await createHash('sha1', 'test'), 'Hash should be the same for the same input');
    //     k.ok(hash === expectedResult, 'Hash result should be the expected one')
    // });

    // t.test('sha384', async (k) => {
    //     const hash = await createHash('sha384', 'test');
    //     const expectedResult = "768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9";
    //     k.is(typeof hash, 'string', 'Hash should be a string');
    //     k.ok(hash.length === 96, 'Hash should be 96 characters long');
    //     k.ok(hash.match(/^[a-f0-9]+$/), 'Hash should be a hex string');
    //     k.ok(hash === expectedResult, 'Hash result should be the expected one')
    //     k.ok(hash === await createHash('sha384', 'test'), 'Hash should be the same for the same input');
    //     k.ok(hash !== await createHash('sha384', 'Test'), 'Hash should be different for different inputs');
    // });

    // t.test('sha512', async (k) => {
    //     const hash = await createHash('sha512', 'test');
    //     const expectedResult = "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff";
    //     k.is(typeof hash, 'string', 'Hash should be a string');
    //     k.ok(hash.length === 128, 'Hash should be 128 characters long');
    //     k.ok(hash.match(/^[a-f0-9]+$/), 'Hash should be a hex string');
    //     k.ok(hash === expectedResult, 'Hash result should be the expected one')
    //     k.ok(hash === await createHash('sha512', 'test'), 'Hash should be the same for the same input');
    //     k.ok(hash !== await createHash('sha512', 'Test'), 'Hash should be different for different inputs');
    // });

    t.test('unsupported algorithm', async (k) => {
        try {
            await createHash('unsupported', 'test');
            k.fail('Should throw an error for unsupported algorithm');
        } catch (e) {
            k.pass('Correctly threw an error for unsupported algorithm');
        }
    });
});