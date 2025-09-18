import test from 'brittle';
import b4a from 'b4a';

import applyOperations from '../../src/utils/protobuf/applyOperations.cjs';
import fixtures from '../fixtures/protobuf.fixtures.js';

test('Happy path encode/decode roundtrip for protobuf applyOperation payloads', t => {
    const payloadsHashMap = new Map([
        ["txComplete", fixtures.validTransactionOperation],
        ["addIndexer", fixtures.validAddIndexer],
        ["removeIndexer", fixtures.validRemoveIndexer],
        ["appendWhitelist", fixtures.validAppendWhitelist],
        ["banValidator", fixtures.validBanValidator],
        ["addAdmin", fixtures.validAddAdmin],
        ["addWriterComplete", fixtures.validCompleteAddWriter],
        ["addWriterPartial", fixtures.validPartialAddWriter],
        ["removeWriterComplete", fixtures.validCompleteRemoveWriter],
        ["removeWriterPartial", fixtures.validPartialRemoveWriter],
        ["adminRecoveryComplete", fixtures.validCompleteAdminRecovery],
        ["adminRecoveryPartial", fixtures.validPartialAdminRecovery],
        ["transferComplete", fixtures.validTransferOperation]
    ]);

    for (const [key, value] of payloadsHashMap) {
        //console.log(`Testing payload: ${key}`,value);
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

test('Protobuf encode/decode is order-independent for all operation types', t => {
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

    // Test TX operation
    const shuffledTxo = shuffleObject(fixtures.validTransactionOperation.txo);
    const shuffledTx = { ...fixtures.validTransactionOperation, txo: shuffledTxo };
    let encoded = applyOperations.Operation.encode(shuffledTx);
    let decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validTransactionOperation), 'TX operation encodes/decodes correctly with shuffled fields');

    // Test TRANSFER operation
    const shuffledTro = shuffleObject(fixtures.validTransferOperation.tro);
    const shuffledTransfer = { ...fixtures.validTransferOperation, tro: shuffledTro };
    encoded = applyOperations.Operation.encode(shuffledTransfer);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validTransferOperation), 'TRANSFER operation encodes/decodes correctly with shuffled fields');

    // Test ADD_INDEXER operation
    const shuffledAco = shuffleObject(fixtures.validAddIndexer.aco);
    const shuffledAddIndexer = { ...fixtures.validAddIndexer, aco: shuffledAco };
    encoded = applyOperations.Operation.encode(shuffledAddIndexer);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validAddIndexer), 'ADD_INDEXER operation encodes/decodes correctly with shuffled fields');

    // Test REMOVE_INDEXER operation
    const shuffledRemoveIndexerAco = shuffleObject(fixtures.validRemoveIndexer.aco);
    const shuffledRemoveIndexer = { ...fixtures.validRemoveIndexer, aco: shuffledRemoveIndexerAco };
    encoded = applyOperations.Operation.encode(shuffledRemoveIndexer);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validRemoveIndexer), 'REMOVE_INDEXER operation encodes/decodes correctly with shuffled fields');

    // Test APPEND_WHITELIST operation
    const shuffledWhitelistAco = shuffleObject(fixtures.validAppendWhitelist.aco);
    const shuffledWhitelist = { ...fixtures.validAppendWhitelist, aco: shuffledWhitelistAco };
    encoded = applyOperations.Operation.encode(shuffledWhitelist);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validAppendWhitelist), 'APPEND_WHITELIST operation encodes/decodes correctly with shuffled fields');

    // Test BAN_VALIDATOR operation
    const shuffledBanAco = shuffleObject(fixtures.validBanValidator.aco);
    const shuffledBan = { ...fixtures.validBanValidator, aco: shuffledBanAco };
    encoded = applyOperations.Operation.encode(shuffledBan);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validBanValidator), 'BAN_VALIDATOR operation encodes/decodes correctly with shuffled fields');

    // Test ADD_ADMIN operation
    const shuffledCao = shuffleObject(fixtures.validAddAdmin.cao);
    const shuffledAddAdmin = { ...fixtures.validAddAdmin, cao: shuffledCao };
    encoded = applyOperations.Operation.encode(shuffledAddAdmin);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validAddAdmin), 'ADD_ADMIN operation encodes/decodes correctly with shuffled fields');

    // Test ADD_WRITER (complete) operation
    const shuffledCompleteAddWriterRao = shuffleObject(fixtures.validCompleteAddWriter.rao);
    const shuffledCompleteAddWriter = { ...fixtures.validCompleteAddWriter, rao: shuffledCompleteAddWriterRao };
    encoded = applyOperations.Operation.encode(shuffledCompleteAddWriter);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validCompleteAddWriter), 'Complete ADD_WRITER operation encodes/decodes correctly with shuffled fields');

    // Test ADD_WRITER (partial) operation
    const shuffledPartialAddWriterRao = shuffleObject(fixtures.validPartialAddWriter.rao);
    const shuffledPartialAddWriter = { ...fixtures.validPartialAddWriter, rao: shuffledPartialAddWriterRao };
    encoded = applyOperations.Operation.encode(shuffledPartialAddWriter);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validPartialAddWriter), 'Partial ADD_WRITER operation encodes/decodes correctly with shuffled fields');

    // Test REMOVE_WRITER (complete) operation
    const shuffledCompleteRemoveWriterRao = shuffleObject(fixtures.validCompleteRemoveWriter.rao);
    const shuffledCompleteRemoveWriter = { ...fixtures.validCompleteRemoveWriter, rao: shuffledCompleteRemoveWriterRao };
    encoded = applyOperations.Operation.encode(shuffledCompleteRemoveWriter);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validCompleteRemoveWriter), 'Complete REMOVE_WRITER operation encodes/decodes correctly with shuffled fields');

    // Test REMOVE_WRITER (partial) operation
    const shuffledPartialRemoveWriterRao = shuffleObject(fixtures.validPartialRemoveWriter.rao);
    const shuffledPartialRemoveWriter = { ...fixtures.validPartialRemoveWriter, rao: shuffledPartialRemoveWriterRao };
    encoded = applyOperations.Operation.encode(shuffledPartialRemoveWriter);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validPartialRemoveWriter), 'Partial REMOVE_WRITER operation encodes/decodes correctly with shuffled fields');

    // Test ADMIN_RECOVERY (complete) operation
    const shuffledCompleteAdminRecoveryRao = shuffleObject(fixtures.validCompleteAdminRecovery.rao);
    const shuffledCompleteAdminRecovery = { ...fixtures.validCompleteAdminRecovery, rao: shuffledCompleteAdminRecoveryRao };
    encoded = applyOperations.Operation.encode(shuffledCompleteAdminRecovery);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validCompleteAdminRecovery), 'Complete ADMIN_RECOVERY operation encodes/decodes correctly with shuffled fields');

    // Test ADMIN_RECOVERY (partial) operation
    const shuffledPartialAdminRecoveryRao = shuffleObject(fixtures.validPartialAdminRecovery.rao);
    const shuffledPartialAdminRecovery = { ...fixtures.validPartialAdminRecovery, rao: shuffledPartialAdminRecoveryRao };
    encoded = applyOperations.Operation.encode(shuffledPartialAdminRecovery);
    decoded = applyOperations.Operation.decode(encoded);
    t.ok(JSON.stringify(decoded) === JSON.stringify(fixtures.validPartialAdminRecovery), 'Partial ADMIN_RECOVERY operation encodes/decodes correctly with shuffled fields');
});
