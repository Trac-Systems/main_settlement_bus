import test from 'brittle';
import applyOperations from '../../src/utils/protobuf/applyOperations.cjs';
import fixtures from '../fixtures/protobuf.fixtures.js';

const testName = 'Happy path encode/decode roundtrip for protobuf applyOperation payloads';
test(testName, t => {
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
        console.log(`Testing payload: ${key} ${value}`);
        const encoded = applyOperations.Operation.encode(value);
        const decoded = applyOperations.Operation.decode(encoded);
        t.ok(JSON.stringify(value) === JSON.stringify(decoded), `Payload ${key} encodes and decodes correctly`);
    }
});

// TODO: ADD NEGATIVE CASE TESTS 
// SAFE ENCODING AND DECODING 
// TRY TO BREAK IT 

