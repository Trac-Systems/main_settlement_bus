import test from 'brittle';
import b4a from 'b4a';

import applyOperations from '../../src/utils/protobuf/applyOperations.cjs';
import fixtures from '../fixtures/protobuf.fixtures.js';

test('Happy path encode/decode roundtrip for protobuf applyOperation payloads', t => {
    const payloadsHashMap = new Map([
        ["tx", fixtures.validPostTx],
        ["addIndexer", fixtures.validAddIndexer],
        ["removeIndexer", fixtures.validRemoveIndexr],
        ["appendWhitelist", fixtures.validAppendWhitelist],
        ["banValidator", fixtures.validBanValidator],
        ["addAdmin", fixtures.validAddAdmin],
        ["addWriter", fixtures.validAddWriter],
        ["removeWriter", fixtures.validRemoveWriter]
    ]);

    for (const [key, value] of payloadsHashMap) {
        console.log(`Testing payload: ${key} ${value}`);
        const encoded = applyOperations.Operation.encode(value);
        const decoded = applyOperations.Operation.decode(encoded);
        t.ok(JSON.stringify(value) === JSON.stringify(decoded), `Payload ${key} encodes and decodes correctly`);
    }
});

test('encode  - throws on multiple oneof fields are set', t => {
    try {
        applyOperations.Operation.encode(fixtures.invalidPayloadWithMultipleOneOfKeys);
        t.fail('encode() should throw due to multiple oneof fields set');
    } catch (err) {
        t.ok(err instanceof Error && err.message.includes('only one of the properties defined in oneof value can be set'), 'Should throw an error about multiple oneof fields'
        );
    }
});

test('encodingLength - throws when multiple oneof fields are set', t => {
    try {
        applyOperations.Operation.encodingLength(fixtures.invalidPayloadWithMultipleOneOfKeys);
        t.fail('Expected encodingLength() to throw due to multiple oneof fields set');
    } catch (err) {
        t.ok(err instanceof Error && err.message.includes('only one of the properties defined in oneof value can be set'), 'Should throw an error about multiple oneof fields');
    }
});

test('Operation.decode throws when end/offset exceeds buffer length', t => {
    const buf = b4a.from([8, 1]); // type =1

    try {
        applyOperations.Operation.decode(buf, 0, buf.length + 1);
        t.fail('Should throw on invalid end parameter');
    } catch (err) {
        t.ok(err instanceof Error && err.message.includes('Decoded message is not valid'), 'Should throw an error when end > buffer length');
    }

    try {
        applyOperations.Operation.decode(buf, buf.length + 1);
        t.fail('Should throw on invalid offset parameter');
    } catch (err) {
        t.ok(err instanceof Error && err.message.includes('Decoded message is not valid'), 'Should throw an error when offset > buffer length')
    }
});

test('Decode throws on buffer with unknown wire type (skip case)', t => {
    // tag = 1, wire type = 7 --> (1 << 3) | 7 = 15 --> 0x0F (invalid: wire type 7 is not defined in Protobuf)
    const bufWithWire7 = b4a.from([0x0F]);
    try {
        applyOperations.Operation.decode(bufWithWire7);
    } catch (err) {
        console.error('Caught error:', err);
        t.ok(err instanceof Error && err.message.includes('Could not decode varint'), 'Should throw an error instance to be thrown for unknown wire type');
    }
});

// We could cover all types of protobuf messages. For now it will be just TX.
// If someone will send to us  shuffled TXO, we should be able to decode it and it will be in correct order.
test('Protobuf encode/decode is order-independent', t => {

    const shuffleObject = (obj) => {
        const keys = Object.keys(obj);
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        const shuffled = {};
        for (const k of keys) shuffled[k] = obj[k];
        return shuffled;
    }

    const shuffledTxo = shuffleObject(fixtures.validPostTx.txo);
    const shuffledPayload = { ...fixtures.validPostTx, txo: shuffledTxo };
    const encoded = applyOperations.Operation.encode(shuffledPayload);
    const decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validPostTx), 'Payload validPostTx encodes and decodes correctly even with shuffled txo fields');
});

