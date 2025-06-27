import test from 'brittle';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../src/utils/protobuf/operationHelpers.js';
import b4a from 'b4a';
import fixtures from '../fixtures/protobuf.fixtures.js';

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
        const encoded = safeEncodeApplyOperation(value)
        t.ok(encoded, 'encoded !== null')
        t.ok(encoded instanceof Buffer || b4a.isBuffer(encoded), 'encoded to Buffer')
        const decoded = safeDecodeApplyOperation(encoded)
        t.ok(JSON.stringify(value) === JSON.stringify(decoded), `Payload with ${key} shoukd be endoded and decoded correctly`);
    }
});

test('safeEncodeAppyOperation - handles invalid payloads by returning a Buffer', t => {
    for (const invalidPayload of fixtures.invalidPayloads) {
        const encoded = safeEncodeApplyOperation(invalidPayload)
        t.ok(b4a.isBuffer(encoded), `For payload ${typeof invalidPayload === 'bigint' ? invalidPayload.toString() + 'n' : (() => { try { return JSON.stringify(invalidPayload) } catch { return String(invalidPayload) } })()} should return a Buffer`);
    }
})

test('safeDecodeApplyOperation - handles invalid payloads by returning null or object', t => {
    for (const invalidPayload of fixtures.invalidPayloads) {
        const decoded = safeDecodeApplyOperation(invalidPayload)
        t.ok(decoded === null || typeof decoded === 'object', `should be null or object, we received: ${decoded}`);
    }
})

test('safeEncodeAppyOperation - returns an empty buffer when multiple `oneof` fields are present', t => {
    const encoded = safeEncodeApplyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys)
    console.log('Encoded (oneof conflict):', encoded)
    t.ok(b4a.isBuffer(encoded), 'Should return a Buffer')
    t.ok(encoded.equals(b4a.alloc(0)), 'Should return an empty buffer')
})


test('safeEncodeAppyOperation - when encodingLength throws due to multiple oneof fields, returns an empty buffer safely', t => {
    const encoded = safeEncodeApplyOperation(fixtures.invalidPayloadWithMultipleOneOfKeys);
    t.ok(b4a.isBuffer(encoded), 'returns a Buffer');
    t.is(encoded.length, 0, 'returns empty buffer for multiple oneof fields');
});

test('safeDecodeApplyOperation - handles invalid offset/end parameters gracefully without throwing', t => {
    const buf = b4a.from([8, 1]); // type = 1

    const decodedWithInvalidEnd = safeDecodeApplyOperation(buf, 0, buf.length + 1);
    t.ok(decodedWithInvalidEnd === null || typeof decodedWithInvalidEnd === 'object', 'Should return null or object when end > buffer length');
    const decodedWithInvalidOffset = safeDecodeApplyOperation(buf, buf.length + 1);
    t.ok(decodedWithInvalidOffset === null || typeof decodedWithInvalidOffset === 'object', 'Should return null or object when offset > buffer length');

});

test('safeDecodeApplyOperation - decode calls skip() on unknown wire type, safely returns null or object', t => {
    const bufWithUnknownWire = b4a.from([0x0F]);
    const decoded = safeDecodeApplyOperation(bufWithUnknownWire);
    t.ok(decoded === null || typeof decoded === 'object', 'Should return null or object on unknown wire type');
});



