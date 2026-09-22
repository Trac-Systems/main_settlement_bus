import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import applyOperationsGenerated from '../../../src/codecs/apply/applyOperations.generated.cjs';
import {
    decodeEpochRecord,
    encodeApplyOperation,
    encodeEpochRecord,
    safeDecodeApplyOperation,
    safeDecodeEpochRecord,
    safeEncodeEpochRecord,
} from '../../../src/codecs/apply/applyOperationCodec.js';
import { OperationType } from '../../../src/utils/constants.js';

const { SetEpochOperation } = applyOperationsGenerated.apply.operations;

test('Epoch record codec uses the existing SetEpochOperation wire format', t => {
    const record = { sv: b4a.from([1]), data: b4a.from([0xff, 0, 0x7f]) };
    const encoded = encodeEpochRecord(record);
    const generated = b4a.from(SetEpochOperation.encode(record).finish());

    t.alike(encoded, generated);
    t.is(encoded.toString('hex'), '0a01011203ff007f', 'the envelope has only version and data');
    t.alike(decodeEpochRecord(generated), record);
    t.alike(SetEpochOperation.toObject(SetEpochOperation.decode(encoded), { bytes: Buffer }), record);
});

test('Epoch record codec shares the seo payload with the full apply operation', t => {
    const record = { sv: b4a.from([1]), data: b4a.from([0xff]) };
    const operation = {
        type: OperationType.SET_EPOCH,
        address: b4a.alloc(32, 1),
        seo: record,
    };
    const decodedOperation = safeDecodeApplyOperation(encodeApplyOperation(operation));

    t.alike(decodedOperation.seo, record);
    t.alike(encodeEpochRecord(decodedOperation.seo), encodeEpochRecord(record));
    t.alike(decodeEpochRecord(encodeEpochRecord(record)), decodedOperation.seo);
});

test('Epoch record codec roundtrips all non-zero byte versions without decoding opaque data', t => {
    for (let version = 1; version <= 255; version++) {
        const record = { sv: b4a.from([version]), data: b4a.from([0xff, 0, 0x80]) };
        t.alike(safeDecodeEpochRecord(safeEncodeEpochRecord(record)), record, `version ${version}`);
    }
});

test('Epoch record codec does not apply the incoming operation data size limit', t => {
    const record = { sv: b4a.from([2]), data: b4a.alloc(4096, 0x7f) };
    t.alike(decodeEpochRecord(encodeEpochRecord(record)), record);
});

test('Epoch record encoding is canonical regardless of decoded protobuf field order', t => {
    const reordered = b4a.from('1203ff007f0a0101', 'hex');
    const record = decodeEpochRecord(reordered);

    t.alike(record, { sv: b4a.from([1]), data: b4a.from([0xff, 0, 0x7f]) });
    t.is(encodeEpochRecord(record).toString('hex'), '0a01011203ff007f');
});

test('Epoch record encoding rejects invalid or missing envelope fields', async t => {
    const sv = b4a.from([1]);
    const data = b4a.from([0xff]);
    const invalidRecords = [
        null, undefined, [], b4a.alloc(0), 'record', {},
        { sv }, { data },
        { sv: 1, data }, { sv: '01', data }, { sv: [1], data },
        { sv: b4a.alloc(0), data }, { sv: b4a.from([0]), data },
        { sv: b4a.from([1, 0]), data },
        { sv, data: null }, { sv, data: [] }, { sv, data: 'ff' },
        { sv, data: b4a.alloc(0) },
    ];

    for (const record of invalidRecords) {
        await t.exception.all(() => encodeEpochRecord(record));
        t.alike(safeEncodeEpochRecord(record), b4a.alloc(0));
    }
});

test('Epoch record decoding rejects malformed wire bytes and invalid envelope fields', async t => {
    const invalidRecords = [
        {},
        { sv: b4a.from([1]) },
        { data: b4a.from([0xff]) },
        { sv: b4a.alloc(0), data: b4a.from([0xff]) },
        { sv: b4a.from([0]), data: b4a.from([0xff]) },
        { sv: b4a.from([1, 0]), data: b4a.from([0xff]) },
        { sv: b4a.from([1]), data: b4a.alloc(0) },
    ];
    const invalidEncodedValues = [
        null, undefined, {}, [], 'encoded', b4a.alloc(0),
        b4a.from([0xff]),
        b4a.from('0a01011202ff', 'hex'),
        ...invalidRecords.map(record => b4a.from(SetEpochOperation.encode(record).finish())),
    ];

    for (const encoded of invalidEncodedValues) {
        await t.exception.all(() => decodeEpochRecord(encoded));
        t.is(safeDecodeEpochRecord(encoded), null);
    }
});

test('Epoch record hash includes the version even when data is unchanged', async t => {
    const data = b4a.from([0xff, 0, 0x80]);
    const encodedV1 = encodeEpochRecord({ sv: b4a.from([1]), data });
    const encodedV2 = encodeEpochRecord({ sv: b4a.from([2]), data });
    const hashV1 = await tracCryptoApi.hash.blake3(encodedV1);
    const hashV2 = await tracCryptoApi.hash.blake3(encodedV2);

    t.absent(b4a.equals(encodedV1, encodedV2));
    t.absent(b4a.equals(hashV1, hashV2));
    t.alike(decodeEpochRecord(encodedV1).data, decodeEpochRecord(encodedV2).data);
});

test('Historical epoch records keep their own version without an active config dependency', t => {
    const historical = { sv: b4a.from([1]), data: b4a.from([0xff]) };
    const encodedHistorical = encodeEpochRecord(historical);
    const newer = { sv: b4a.from([255]), data: b4a.from([0x80]) };

    t.alike(decodeEpochRecord(encodeEpochRecord(newer)), newer);
    t.alike(decodeEpochRecord(encodedHistorical), historical);
    t.alike(safeDecodeEpochRecord(encodedHistorical), historical);
});
