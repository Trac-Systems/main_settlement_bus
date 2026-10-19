import b4a from 'b4a';
import {OperationType, CONSENSUS_CONFIG_DATA_MAX_SIZE} from '../../../../src/utils/constants.js';
import {safeEncodeApplyOperation, safeDecodeApplyOperation} from '../../../../src/codecs/apply/applyOperationCodec.js';
import {sanitizeDecodedPartialTransaction} from '../../../../src/core/network/protocols/v1/handlers/broadcastTransaction/BroadcastTransactionPayloadUtils.js';
import {config} from '../../../helpers/config.js';
import fixtures from '../../../fixtures/applyOperation.fixtures.js';
import * as checkFixtures from '../../../fixtures/check.fixtures.js';

// Existing valid fixtures supply foreign payloads for substitution tests.
// Expected types, fields and byte widths are passed explicitly by each test.
const payloadExamples = Object.fromEntries(
    [fixtures, ...Object.values(checkFixtures)]
        .flatMap(group => Object.entries(group))
        .filter(([name]) => name.startsWith('valid'))
        .flatMap(([, operation]) => Object.entries(operation).filter(([key]) => key !== 'type' && key !== 'address'))
);

const metadataFields = ['va', 'vn', 'vs'];
const invalidScalars = [
    ['null', null], ['undefined', undefined], ['boolean', false], ['number', 1],
    ['NaN', NaN], ['Infinity', Infinity], ['bigint', 1n], ['symbol', Symbol('invalid')],
    ['string', '01'], ['object', {}], ['array', []], ['function', () => {}],
    ['date', new Date(0)], ['map', new Map()], ['set', new Set()]
];

function parentAt(operation, path) {
    const parts = path.split('.');
    const field = parts.pop();
    return [parts.reduce((object, part) => object[part], operation), field];
}

function assignAt(operation, path, value) {
    const [parent, field] = parentAt(operation, path);
    parent[field] = value;
    return operation;
}

// A throw is a failure, not an alternative form of rejection. Retaining the error in
// the assertion lets the remaining independent cases run and report their failures.
function resultOf(validate, operation) {
    try { return validate(operation); }
    catch (error) { return `threw ${error.name}: ${error.message}`; }
}

export function operationContractTests(
    t,
    validateFn,
    fixture,
    key,
    types,
    bytes = {},
    partial = false,
    zeroAllowed = [],
    optionalFields = [],
    otherRequiredFields = [],
    objectFields = [],
    zeroPolicyUnspecified = [],
    decodedNullMetadata = false
) {
    const validate = operation => resultOf(validateFn, operation);
    const makeOperation = (type = types[0]) => ({...structuredClone(fixture), type});
    const byteFields = {address: config.addressLength};
    for (const [field, length] of Object.entries(bytes)) byteFields[`${key}.${field}`] = length;
    const objects = ['', key, ...objectFields.map(field => `${key}.${field}`)];
    const otherRequired = otherRequiredFields.map(field => `${key}.${field}`);
    const fields = [...new Set(['type', ...Object.keys(byteFields), ...objects.slice(1), ...otherRequired])];

    t.test(`${key} contract: exact operation-type domain, without coercion`, t => {
        for (const type of Object.values(OperationType)) {
            t.is(validate(makeOperation(type)), types.includes(type), `type ${type}`);
        }
        for (const [label, type] of [...invalidScalars.filter(([, value]) => value !== 1),
            ['zero', 0], ['negative', -1], ['fraction', types[0] + 0.5], ['unknown', 999],
            ['numeric string', String(types[0])], ['boxed number', Object(types[0])]]) {
            t.is(validate({...makeOperation(), type}), false, label);
        }
    });

    for (const type of types) {
        t.test(`${key} type ${type}: each required field must be present; invalid values are rejected`, t => {
            t.is(validate(makeOperation(type)), true, 'positive control');
            for (const path of fields) {
                const optional = optionalFields.includes(path.slice(key.length + 1));
                const missing = makeOperation(type);
                const [parent, field] = parentAt(missing, path);
                delete parent[field];
                t.is(validate(missing), !!optional, `${path}: omitted`);
                for (const [label, invalid] of invalidScalars) {
                    // 1 is a valid ADD_ADMIN type and [] is a valid approval list.
                    if (path === 'type' && types.includes(invalid)) continue;
                    if (path === 'seo.app' && Array.isArray(invalid)) continue;
                    t.is(validate(assignAt(makeOperation(type), path, invalid)),
                        !!optional && invalid === undefined, `${path}: ${label}`);
                }
            }
        });

        t.test(`${key} type ${type}: strict fields and oneof payloads at every object level`, t => {
            for (const path of objects) {
                for (const extra of ['extra', '__proto__', 'constructor', 'prototype', ...Object.keys(payloadExamples)]) {
                    if (!path && extra === key) continue;
                    for (const value of [undefined, null, false, {}]) {
                        const operation = makeOperation(type);
                        const target = path ? path.split('.').reduce((o, part) => o[part], operation) : operation;
                        Object.defineProperty(target, extra, {value, enumerable: true, configurable: true});
                        t.is(validate(operation), false, `${path || 'root'}: extra ${extra} = ${String(value)}`);
                    }
                }
            }
            for (const [otherKey, payload] of Object.entries(payloadExamples)) {
                if (otherKey === key) continue;
                const operation = makeOperation(type);
                delete operation[key];
                operation[otherKey] = structuredClone(payload);
                t.is(validate(operation), false, `rejects substituted ${otherKey} payload`);
            }
        });
    }

    t.test(`${key} contract: rejects invalid root values`, t => {
        for (const [label, invalid] of invalidScalars) t.is(validate(invalid), false, `root: ${label}`);
    });

    t.test(`${key} contract: byte widths and zero rules independent of fixture lengths`, t => {
        for (const [path, length] of Object.entries(byteFields)) {
            for (const width of new Set([0, 1, length - 1, length + 1, length * 2])) {
                if (width === length) continue;
                for (const value of [b4a.alloc(width, 1), new Uint8Array(width).fill(1)]) {
                    t.is(validate(assignAt(makeOperation(), path, value)), false, `${path}: length ${width}`);
                }
            }
            const field = path.slice(key.length + 1);
            if (!zeroPolicyUnspecified.includes(field)) {
                const zero = assignAt(makeOperation(), path, b4a.alloc(length));
                if (path === 'hlo.fa') delete zero.hlo.fr;
                t.is(validate(zero), !!zeroAllowed.includes(field), `${path}: all zero`);
            }
            for (const position of [0, length - 1]) {
                for (const asUint8Array of [false, true]) {
                    const value = asUint8Array ? new Uint8Array(length) : b4a.alloc(length);
                    value[position] = 1;
                    t.is(validate(assignAt(makeOperation(), path, value)), true, `${path}: non-zero at ${position}`);
                }
            }
        }
    });

    t.test(`${key} contract: rejects non-byte-buffer values`, t => {
        const paths = [...Object.keys(byteFields), ...otherRequired.filter(path => ['seo.pd', 'cco.cc.cd'].includes(path))];
        for (const path of paths) {
            const length = byteFields[path] ?? 32;
            for (const value of [
                new Int8Array(length), new Uint8ClampedArray(length), new Uint16Array(length),
                new DataView(new ArrayBuffer(length)), new ArrayBuffer(length),
                Array(length).fill(1), {type: 'Buffer', data: Array(length).fill(1)}, '01'.repeat(length)]) {
                t.is(validate(assignAt(makeOperation(), path, value)), false, `${path}: rejects non-byte-buffer`);
            }
        }
    });

    t.test(`${key} contract: protocol constraints after protobuf decoding`, t => {
        const checkDecoded = (operation, expected, label) => {
            const encoded = safeEncodeApplyOperation(operation);
            t.ok(encoded.length > 0, `${label}: encodes to protobuf bytes`);
            const decoded = safeDecodeApplyOperation(encoded);
            t.ok(decoded, `${label}: decodes to an operation`);
            t.is(validate(decoded), expected, `${label}: schema result`);
        };

        for (const type of types) {
            checkDecoded(makeOperation(type), true, `type ${type}: positive control`);
            for (const path of fields) {
                const operation = makeOperation(type);
                const [parent, field] = parentAt(operation, path);
                delete parent[field];
                const optional = optionalFields.includes(path.slice(key.length + 1));
                // Protobuf represents absent repeated fields as empty arrays.
                // No cosignatures are needed only when the invoker meets the threshold alone.
                const emptyListAllowed = path === 'seo.app' || (path === 'hlo.cs' && fixture.hlo.th[0] === 1);
                checkDecoded(operation, optional || emptyListAllowed, `type ${type}, ${path}: omitted`);
            }
            for (const [path, length] of Object.entries(byteFields)) {
                for (const width of new Set([0, length - 1, length + 1])) {
                    checkDecoded(assignAt(makeOperation(type), path, b4a.alloc(width, 1)), false,
                        `type ${type}, ${path}: length ${width}`);
                }

                const field = path.slice(key.length + 1);
                if (zeroPolicyUnspecified.includes(field)) continue;
                const zero = assignAt(makeOperation(type), path, b4a.alloc(length));
                if (path === 'hlo.fa') delete zero.hlo.fr;
                checkDecoded(zero, !!zeroAllowed.includes(field),
                    `type ${type}, ${path}: all zero`);
            }
        }
        for (const type of Object.values(OperationType)) {
            checkDecoded(makeOperation(type), types.includes(type), `decoded operation type ${type}`);
        }
        for (const [otherKey, payload] of Object.entries(payloadExamples)) {
            if (otherKey === key) continue;
            const operation = makeOperation();
            delete operation[key];
            operation[otherKey] = structuredClone(payload);
            checkDecoded(operation, false, `substituted ${otherKey} payload`);
        }
    });

    t.test(`${key} contract: codec output validates and validation does not mutate its input`, t => {
        for (const type of types) {
            const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(makeOperation(type)));
            t.ok(decoded, 'valid fixture survives protobuf');
            const before = structuredClone(decoded);
            for (const path of [...objects].reverse()) {
                Object.freeze(path ? path.split('.').reduce((o, part) => o[part], decoded) : decoded);
            }
            t.is(validate(decoded), true, 'decoded and frozen operation validates');
            t.alike(structuredClone(decoded), before, 'valid input unchanged');
            const invalid = makeOperation(type);
            invalid.address = '01'.repeat(config.addressLength);
            const beforeInvalid = structuredClone(invalid);
            t.is(validate(invalid), false, 'no string-to-buffer coercion');
            t.alike(invalid, beforeInvalid, 'invalid input unchanged');
        }
    });

    if (!partial) return;

    t.test(`${key} contract: validator identity, nonce and signature form one complete group`, t => {
        for (const va of ['omitted', 'undefined', 'null', 'buffer']) {
            for (const vn of ['omitted', 'undefined', 'null', 'buffer']) {
                for (const vs of ['omitted', 'undefined', 'null', 'buffer']) {
                    const operation = makeOperation();
                    const states = [va, vn, vs];
                    states.forEach((state, index) => {
                        const field = metadataFields[index];
                        if (state === 'omitted') delete operation[key][field];
                        if (state === 'undefined') operation[key][field] = undefined;
                        if (state === 'null') operation[key][field] = null;
                    });
                    const partial = states.every(state => ['omitted', 'undefined'].includes(state));
                    const complete = states.every(state => state === 'buffer');
                    const decodedPartial = decodedNullMetadata && states.every(state => state === 'null');
                    t.is(validate(operation), !!(partial || complete || decodedPartial), states.join('/'));
                }
            }
        }
        const partial = makeOperation();
        for (const field of metadataFields) delete partial[key][field];
        const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(partial));
        sanitizeDecodedPartialTransaction(decoded);
        t.is(validate(decoded), true, 'partial decoded and sanitized as on the broadcast path');
        for (const field of metadataFields) {
            const incomplete = safeDecodeApplyOperation(safeEncodeApplyOperation(partial));
            incomplete[key][field] = fixture[key][field];
            sanitizeDecodedPartialTransaction(incomplete);
            t.is(validate(incomplete), false, `${field} alone cannot become a complete operation`);
        }
    });
}

export function consensusConfigDataTests(t, validateFn, fixture, types) {
    for (const type of types) {
        for (const [length, expected] of [[0, false], [1, true], [CONSENSUS_CONFIG_DATA_MAX_SIZE, true], [CONSENSUS_CONFIG_DATA_MAX_SIZE + 1, false]]) {
            for (const byte of [0, 1, 255]) {
                const operation = {...structuredClone(fixture), type};
                operation.cco.cc.cd = b4a.alloc(length, byte);
                t.is(validateFn(operation), expected, `type ${type}, length ${length}, byte ${byte}`);
            }
        }
    }
}
