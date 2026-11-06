import test from 'brittle';
import b4a from 'b4a';

import {
    decodeV1networkOperation,
    encodeV1networkOperation,
} from '../../../src/codecs/network/v1/networkV1OperationCodec.js';
import networkV1Fixtures from '../../fixtures/networkV1.fixtures.js';

test('Network v1 codec encodes and decodes message headers', t => {
    const payloadsHashMap = new Map([
        ['livenessRequest', networkV1Fixtures.payloadLivenessRequest],
        ['livenessResponse', networkV1Fixtures.payloadLivenessResponse],
        ['broadcastTransactionRequest', networkV1Fixtures.payloadBroadcastTransactionRequest],
        ['broadcastTransactionResponse', networkV1Fixtures.payloadBroadcastTransactionResponse],
    ]);

    for (const [key, payload] of payloadsHashMap) {
        const encoded = encodeV1networkOperation(payload);
        const decoded = decodeV1networkOperation(encoded);

        t.ok(b4a.isBuffer(encoded) && encoded.length > 0, `Payload ${key} encodes to a non-empty buffer`);
        t.alike(decoded, payload, `Payload ${key} decodes back correctly`);
    }
});
