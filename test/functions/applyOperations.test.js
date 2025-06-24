import test from 'brittle';
import { safeDecodeAppyOperation, safeEncodeAppyOperation } from '../../src/utils/functions.js';
import b4a from 'b4a';
import fixtures from '../fixtures/protobuf.fixtures.js';
import applyOperations from '../../src/utils/protobuf/applyOperations.cjs';

test('Happy path encode/decode roundtrip for protobuf applyOperation payloads', t => {
    const payloadsHashMap = new Map([
        ["post-tx", fixtures.validPostTx],
        ["addIndexer", fixtures.validAddIndexer],
        ["removeIndexer", fixtures.validRemoveIndexr],
        ["appendWhitelist", fixtures.validAppendWhitelist],
        ["banValidator", fixtures.validBanValidator],
        ["addAdmin", fixtures.validAddAdmin],
        ["addWriter", fixtures.validAddWriter],
        ["removeWriter", fixtures.validRemoveWriter]
    ]);


    for (const [key, value] of payloadsHashMap) {
        const encoded = safeEncodeAppyOperation(value)
        t.ok(encoded, 'encoded !== null')
        t.ok(encoded instanceof Buffer || b4a.isBuffer(encoded), 'encoded to Buffer')
        const decoded = safeDecodeAppyOperation(encoded)
        t.ok(JSON.stringify(value) === JSON.stringify(decoded), `Payload with ${key} shoukd be endoded and decoded correctly`);
    }
});

test('safeEncodeAppyOperation – handles invalid payloads by returning a Buffer', t => {
    for (const invalidPayload of fixtures.invalidPayloads) {
        const encoded = safeEncodeAppyOperation(invalidPayload)
        t.ok(b4a.isBuffer(encoded), `For payload ${typeof invalidPayload === 'bigint' ? invalidPayload.toString() + 'n' : (() => { try { return JSON.stringify(invalidPayload) } catch { return String(invalidPayload) } })()} should return a Buffer`);
    }
})

test('safeDecodeAppyOperation – handles invalid payloads by returning null or object', t => {
    for (const invalidPayload of fixtures.invalidPayloads) {
        const decoded = safeDecodeAppyOperation(invalidPayload)
        t.ok(decoded === null || typeof decoded === 'object', `should be null or object, we received: ${decoded}`);
    }
})

test('safeEncodeAppyOperation – returns an empty buffer when multiple `oneof` fields are present', t => {
    const encoded = safeEncodeAppyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys)
    console.log('Encoded (oneof conflict):', encoded)
    t.ok(b4a.isBuffer(encoded), 'Should return a Buffer')
    t.ok(encoded.equals(b4a.alloc(0)), 'Should return an empty buffer')
})


test('safeEncodeAppyOperation – when encodingLength throws due to multiple oneof fields, returns an empty buffer safely', t => {
    const encoded = safeEncodeAppyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys);
    t.ok(b4a.isBuffer(encoded), 'returns a Buffer');
    t.is(encoded.length, 0, 'returns empty buffer for multiple oneof fields');
});

test('safeDecodeAppyOperation – handles invalid offset/end parameters gracefully without throwing', t => {
    const buf = b4a.from([8, 1]); // type = 1

    const decodedWithInvalidEnd = safeDecodeAppyOperation(buf, 0, buf.length + 1);
    t.ok(decodedWithInvalidEnd === null || typeof decodedWithInvalidEnd === 'object', 'Should return null or object when end > buffer length');
    const decodedWithInvalidOffset = safeDecodeAppyOperation(buf, buf.length + 1);
    t.ok(decodedWithInvalidOffset === null || typeof decodedWithInvalidOffset === 'object', 'Should return null or object when offset > buffer length');

});

test('safeDecodeAppyOperation – decode calls skip() on unknown wire type, safely returns null or object', t => {
    const bufWithUnknownWire = b4a.from([0xAA, 0x02]);
    const decoded = safeDecodeAppyOperation(bufWithUnknownWire);
    t.ok(decoded === null || typeof decoded === 'object', 'Should return null or object on unknown wire type');
});



