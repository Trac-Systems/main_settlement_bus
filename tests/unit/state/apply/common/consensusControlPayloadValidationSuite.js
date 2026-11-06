import test from 'brittle';
import b4a from 'b4a';

import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { BATCH_SIZE } from '../../../../../src/utils/constants.js';
import { MAXIMUM_OPERATION_PAYLOAD_SIZE } from '../../../../../src/core/state/utils/transaction.js';

const REQUIRED_CONSENSUS_CONTROL_PATHS = Object.freeze([
    ['address'],
    ['cco'],
    ['cco', 'tx'],
    ['cco', 'txv'],
    ['cco', 'cc'],
    ['cco', 'cc', 'sv'],
    ['cco', 'cc', 'cd'],
    ['cco', 'in'],
    ['cco', 'is']
]);

const NON_ZERO_CONSENSUS_CONTROL_PATHS = Object.freeze([
    ['address'],
    ['cco', 'tx'],
    ['cco', 'txv'],
    ['cco', 'in'],
    ['cco', 'is']
]);

/**
 * Registers apply-level adversarial tests shared by genesis initialization and
 * consensus config updates. Every payload is appended through a real Autobase
 * instance; StateValidationSchema and the apply handlers are not mocked.
 */
export function registerConsensusControlPayloadValidationSuite({
    operationName,
    setupScenario,
    buildValidPayload,
    buildSemanticAttackPayloads,
    appendAndUpdate,
    appendBatchAndUpdate,
    assertStateBeforeOperation,
    assertAppliedAndReplicated
}) {
    test(`State.apply ${operationName} survives protobuf decoder bombs and remains live`, async t => {
        const context = await setupScenario(t);
        const validPayload = await buildValidPayload(context);
        const hostilePayloads = buildHostileRawPayloads(validPayload);
        const stateBeforeAttack = await snapshotState(context.adminBootstrap.base);

        t.is(hostilePayloads.length, BATCH_SIZE - 1, 'hostile corpus fills a bounded batch');

        await captureConsole(() =>
            appendBatchAndDrain(context.adminBootstrap.base, hostilePayloads)
        );
        await assertStateBeforeOperation(t, context, validPayload);
        t.alike(
            await snapshotState(context.adminBootstrap.base),
            stateBeforeAttack,
            'hostile batch leaves the complete materialized state unchanged'
        );

        const logs = await captureConsole(() =>
            appendBatchAndDrain(
                context.adminBootstrap.base,
                [...hostilePayloads, validPayload]
            )
        );

        t.ok(
            logs.some(message => message.includes('Failed to decode operation.')),
            'malformed protobuf reaches the safe decoder rejection path'
        );
        t.ok(
            logs.some(message => message.includes('payload exceeds the maximum')),
            'oversized payload is rejected before protobuf decoding'
        );
        await captureConsole(() =>
            assertAppliedAndReplicated(t, context, validPayload)
        );
    });

    test(`State.apply ${operationName} rejects every missing required wire field without poisoning its batch`, async t => {
        const context = await setupScenario(t);
        const validPayload = await buildValidPayload(context);
        const missingFieldPayloads = buildMissingFieldPayloads(t, validPayload);

        t.is(
            missingFieldPayloads.length,
            BATCH_SIZE - 1,
            'all required consensus-control fields fit beside one valid operation'
        );

        const logs = await captureConsole(() =>
            appendBatchAndDrain(
                context.adminBootstrap.base,
                [...missingFieldPayloads, validPayload]
            )
        );
        const schemaRejections = logs.filter(
            message => message.includes('Contract schema validation failed.')
        );

        t.is(
            schemaRejections.length,
            missingFieldPayloads.length,
            'StateValidationSchema rejects every decoded payload with a missing field'
        );
        await captureConsole(() =>
            assertAppliedAndReplicated(t, context, validPayload)
        );
    });

    test(`State.apply ${operationName} rejects every semantics-changing single-bit mutation and recovers`, async t => {
        const context = await setupScenario(t);
        const validPayload = await buildValidPayload(context);
        const allMutations = buildSingleBitMutations(validPayload);
        let mutations;
        await captureConsole(() => {
            mutations = allMutations.filter(payload =>
                !hasEquivalentDecodedOperation(payload, validPayload)
            );
        });
        const stateBeforeAttack = await snapshotState(context.adminBootstrap.base);

        t.is(
            allMutations.length,
            validPayload.length * 8,
            'each bit of the canonical wire payload is mutated exactly once'
        );
        t.ok(
            mutations.length > 0,
            'the corpus contains semantics-changing mutations'
        );

        await captureConsole(async () => {
            for (const payloads of chunk(mutations, BATCH_SIZE)) {
                await appendBatchAndDrain(context.adminBootstrap.base, payloads);
            }
        });

        await assertStateBeforeOperation(t, context, validPayload);
        t.alike(
            await snapshotState(context.adminBootstrap.base),
            stateBeforeAttack,
            'all rejected mutations leave the complete materialized state unchanged'
        );
        await appendAndUpdate(context.adminBootstrap.base, validPayload);
        await context.adminBootstrap.base.view.update();
        await captureConsole(() =>
            assertAppliedAndReplicated(t, context, validPayload)
        );
    });

    test(`State.apply ${operationName} accepts protobuf-equivalent alternate wire payloads`, async t => {
        for (let variantIndex = 0; variantIndex < 3; variantIndex++) {
            const context = await setupScenario(t);
            const validPayload = await buildValidPayload(context);
            const equivalentPayloads = buildProtobufEquivalentPayloads(t, validPayload);
            const payload = equivalentPayloads[variantIndex];

            await appendAndUpdate(context.adminBootstrap.base, payload);
            await context.adminBootstrap.base.view.update();
            await captureConsole(() =>
                assertAppliedAndReplicated(t, context, payload)
            );
        }
    });

    test(`State.apply ${operationName} rejects exact-width zero-filled security fields`, async t => {
        const context = await setupScenario(t);
        const validPayload = await buildValidPayload(context);
        const zeroFilledPayloads = buildZeroFilledFieldPayloads(t, validPayload);

        const logs = await captureConsole(() =>
            appendBatchAndDrain(
                context.adminBootstrap.base,
                [...zeroFilledPayloads, validPayload]
            )
        );
        const schemaRejections = logs.filter(
            message => message.includes('Contract schema validation failed.')
        );

        t.is(
            schemaRejections.length,
            zeroFilledPayloads.length,
            'every exact-width zero-filled field is rejected by StateValidationSchema'
        );
        await captureConsole(() =>
            assertAppliedAndReplicated(t, context, validPayload)
        );
    });

    test(`State.apply ${operationName} isolates schema-valid hostile configs from a valid operation`, async t => {
        const context = await setupScenario(t);
        const validPayload = await buildValidPayload(context);
        const hostilePayloads = await buildSemanticAttackPayloads(context);

        t.ok(hostilePayloads.length >= BATCH_SIZE - 1, 'semantic attack corpus is broad');

        const tailSize = Math.min(hostilePayloads.length, BATCH_SIZE - 1);
        const attackOnlyPayloads = hostilePayloads.slice(0, -tailSize);
        const mixedBatchPayloads = hostilePayloads.slice(-tailSize);
        const logs = await captureConsole(async () => {
            for (const payloads of chunk(attackOnlyPayloads, BATCH_SIZE)) {
                await appendBatchAndDrain(context.adminBootstrap.base, payloads);
            }
            await appendBatchAndDrain(
                context.adminBootstrap.base,
                [...mixedBatchPayloads, validPayload]
            );
        });
        const semanticRejections = logs.filter(
            message => message.includes('Consensus config validation failed.')
        );

        t.is(
            semanticRejections.length,
            hostilePayloads.length,
            'every schema-valid hostile config reaches and fails domain validation'
        );
        await captureConsole(() =>
            assertAppliedAndReplicated(t, context, validPayload)
        );
    });

    async function appendBatchAndDrain(base, payloads) {
        await appendBatchAndUpdate(base, payloads);
        await base.view.update();
    }
}

function buildHostileRawPayloads(validPayload) {
    const declaredLengthPastEnd = b4a.from([
        0x5a,
        0xff, 0xff, 0xff, 0xff, 0x07
    ]);
    const overflowingVarint = b4a.from([
        0x08,
        0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff,
        0x01
    ]);

    return [
        b4a.alloc(0),
        b4a.from([0x80]),
        declaredLengthPastEnd,
        overflowingVarint,
        validPayload.subarray(0, 1),
        validPayload.subarray(0, Math.floor(validPayload.length / 2)),
        b4a.concat([validPayload, b4a.from([0x80])]),
        b4a.alloc(MAXIMUM_OPERATION_PAYLOAD_SIZE, 0xff),
        b4a.alloc(MAXIMUM_OPERATION_PAYLOAD_SIZE + 1, 0xff)
    ];
}

function buildMissingFieldPayloads(t, validPayload) {
    return REQUIRED_CONSENSUS_CONTROL_PATHS.map(path => {
        const operation = safeDecodeApplyOperation(validPayload);
        t.ok(operation, `valid fixture decodes before deleting ${path.join('.')}`);

        let parent = operation;
        for (const field of path.slice(0, -1)) {
            parent = parent?.[field];
        }
        t.ok(parent, `parent exists for required field ${path.join('.')}`);
        delete parent[path[path.length - 1]];

        const encoded = safeEncodeApplyOperation(operation);
        t.ok(encoded.length > 0, `payload without ${path.join('.')} still encodes`);
        return encoded;
    });
}

function buildSingleBitMutations(validPayload) {
    const mutations = [];
    for (let byteIndex = 0; byteIndex < validPayload.length; byteIndex++) {
        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
            const mutation = b4a.from(validPayload);
            mutation[byteIndex] ^= 1 << bitIndex;
            mutations.push(mutation);
        }
    }
    return mutations;
}

function hasEquivalentDecodedOperation(payload, canonicalPayload) {
    const operation = safeDecodeApplyOperation(payload);
    if (!operation) {
        return false;
    }

    return b4a.equals(
        safeEncodeApplyOperation(operation),
        canonicalPayload
    );
}

function buildProtobufEquivalentPayloads(t, validPayload) {
    const operation = safeDecodeApplyOperation(validPayload);
    t.ok(operation, 'canonical payload decodes before wire-format variations');
    t.is(validPayload[0], 0x08, 'operation type is the first protobuf field');
    t.is(validPayload[1], operation.type, 'operation type uses a one-byte varint');

    const payloads = [
        b4a.concat([validPayload, b4a.from([0x78, 0x01])]),
        b4a.concat([validPayload, b4a.from([0x08, operation.type])]),
        b4a.concat([
            validPayload.subarray(0, 1),
            b4a.from([operation.type | 0x80, 0x00]),
            validPayload.subarray(2)
        ])
    ];

    for (const payload of payloads) {
        const decoded = safeDecodeApplyOperation(payload);
        t.alike(decoded, operation, 'alternate wire payload decodes to identical semantics');
        t.absent(
            b4a.equals(payload, safeEncodeApplyOperation(decoded)),
            'alternate wire payload differs from canonical encoding'
        );
    }

    return payloads;
}

function buildZeroFilledFieldPayloads(t, validPayload) {
    return NON_ZERO_CONSENSUS_CONTROL_PATHS.map(path => {
        const operation = safeDecodeApplyOperation(validPayload);
        t.ok(operation, `valid fixture decodes before zeroing ${path.join('.')}`);

        let parent = operation;
        for (const field of path.slice(0, -1)) {
            parent = parent?.[field];
        }
        const field = path[path.length - 1];
        const originalValue = parent?.[field];
        t.ok(b4a.isBuffer(originalValue), `${path.join('.')} is a buffer`);
        parent[field] = b4a.alloc(originalValue.length);

        const encoded = safeEncodeApplyOperation(operation);
        t.ok(encoded.length > 0, `zero-filled ${path.join('.')} still encodes`);
        return encoded;
    });
}

function chunk(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

async function captureConsole(callback) {
    const messages = [];
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
    const capture = (...args) => {
        messages.push(args.map(value => String(value)).join(' '));
    };

    console.error = capture;
    console.log = capture;
    try {
        await callback();
    } finally {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    }

    return messages;
}

async function snapshotState(base) {
    const entries = [];
    for await (const entry of base.view.createReadStream()) {
        const key = b4a.isBuffer(entry.key) ? entry.key.toString('hex') : String(entry.key);
        const value = b4a.isBuffer(entry.value)
            ? entry.value.toString('hex')
            : String(entry.value);
        entries.push([key, value]);
    }
    return entries;
}
