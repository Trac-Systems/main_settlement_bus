import test from 'brittle';
import b4a from 'b4a';
import runtime from '../../../src/codecs/protobufRuntime.cjs';
import protobuf from 'protobufjs/minimal.js';
import apply from '../../../src/codecs/apply/applyOperations.generated.cjs';
import network from '../../../src/codecs/network/v1/networkV1.generated.cjs';
import consensus from '../../../src/codecs/consensus/v1/consensusV1.generated.cjs';

const cases = [
    ['apply', apply.apply.operations.SetEpochOperation, ['sv', 'data']],
    ['network', network.network.v1.LivenessRequest, ['nonce', 'signature']],
    ['consensus', consensus.consensus.v1.ProofProposalApproval, ['approver', 'approval_sig']]
];

const assertBytes = (t, value, expected) => {
    t.ok(b4a.isBuffer(value), 'bytes satisfy b4a.isBuffer');
    t.is(value.constructor, b4a.alloc(0).constructor, 'bytes use the runtime representation supplied by b4a');
    t.alike(Array.from(value), expected, 'byte contents are preserved');
};

for (const [name, Message, fields] of cases) {
    const [first, second] = fields;
    const payload = { [first]: b4a.from([0, 255]), [second]: b4a.alloc(0) };
    const wire = b4a.from('0a0200ff1200', 'hex');

    test(`${name} generated codec preserves wire bytes and normalizes decode inputs`, async t => {
        assertBytes(t, Message.encode(payload).finish(), [...wire]);
        // A view with a non-zero offset must not expose the surrounding bytes.
        const backing = new Uint8Array([42, ...wire, 43]);
        for (const input of [wire, [...wire], backing.subarray(1, -1), new protobuf.Reader([...wire])]) {
            const decoded = Message.decode(input);
            assertBytes(t, decoded[first], [0, 255]);
            assertBytes(t, decoded[second], []);
        }
        await t.exception.all(() => Message.decode(b4a.from('0a0200', 'hex')), /index out of range/);
        await t.exception.all(() => Message.decode('not a wire buffer'), /illegal buffer/);
    });

    test(`${name} generated codec provides b4a defaults without changing field presence`, t => {
        for (const message of [new Message(), Message.create(), Message.decode(b4a.alloc(0))]) {
            for (const field of fields) assertBytes(t, message[field], []);
            t.alike(Message.toObject(message), {}, 'absent fields stay absent');
            const normalized = Message.fromObject(message);
            assertBytes(t, Message.encode(normalized).finish(), []);
            t.alike(Message.toObject(normalized), {}, 'fromObject preserves absent instance fields');
        }
        const defaults = Message.toObject(Message.create(), { defaults: true });
        for (const field of fields) assertBytes(t, defaults[field], []);
        assertBytes(t, Message.encode({ [first]: b4a.alloc(0) }).finish(), [10, 0]);
    });

    test(`${name} generated codec normalizes fromObject and toObject byte fields`, t => {
        const typed = new Uint8Array([42, 0, 255, 43]).subarray(1, 3);
        for (const input of [b4a.from([0, 255]), [0, 255], typed, 'AP8=']) {
            const message = Message.fromObject({ [first]: input, [second]: [] });
            assertBytes(t, message[first], [0, 255]);
            assertBytes(t, message[second], []);
            assertBytes(t, Message.toObject(message)[first], [0, 255]);
            assertBytes(t, Message.encode({ [first]: input, [second]: [] }).finish(), [...wire]);
        }
        for (const empty of [[], '', b4a.alloc(0), new Uint8Array(0)]) {
            assertBytes(t, Message.fromObject({ [first]: empty })[first], []);
        }
        const instance = Message.create({ [first]: [0, 255] });
        assertBytes(t, Message.fromObject(instance)[first], [0, 255]);
        assertBytes(t, Message.toObject(instance)[first], [0, 255]);
        t.alike(instance[first], [0, 255], 'conversion does not mutate the caller');
    });

    test(`${name} generated codec retains explicit JSON and array conversions`, t => {
        const message = Message.fromObject(payload);
        t.is(Message.toObject(message, { bytes: String })[first], 'AP8=');
        t.alike(Message.toObject(message, { bytes: Array })[first], [0, 255]);
        t.is(message.toJSON()[first], 'AP8=');
        t.is(Message.toObject({}, { defaults: true, bytes: String })[first], '');
        t.alike(Message.toObject({}, { defaults: true, bytes: Array })[first], []);
    });

    test(`${name} generated codec supports delimited data and supplied writers`, t => {
        const delimited = [wire.length, ...wire];
        assertBytes(t, Message.encodeDelimited(payload).finish(), delimited);
        const reader = new protobuf.Reader([...delimited, ...delimited]);
        for (let i = 0; i < 2; i++) {
            assertBytes(t, Message.decodeDelimited(reader)[first], [0, 255]);
        }
        t.is(reader.pos, reader.len, 'the supplied reader advances across both messages');
        assertBytes(t, Message.decodeDelimited(b4a.from(delimited))[second], []);

        for (const writer of [new protobuf.Writer(), protobuf.Writer.create()]) {
            t.is(Message.encode(payload, writer), writer, 'the supplied writer is retained');
            assertBytes(t, writer.finish(), [...wire]);
            writer.reset();
            assertBytes(t, Message.encodeDelimited(payload, writer).finish(), delimited);
        }
    });

    test(`${name} generated codec validates bytes while retaining conversion inputs`, async t => {
        for (const input of [b4a.alloc(0), new Uint8Array(0), [], 'AP8=']) {
            t.is(Message.verify({ [first]: input }), null);
        }
        for (const input of [{ length: 1 }, 42, {}, new Uint16Array([1])]) {
            t.is(Message.verify({ [first]: input }), `${first}: buffer expected`);
            await t.exception.all(() => Message.fromObject({ [first]: input }), /bytes must be/);
        }
    });
}

test('Repeated protobuf bytes normalize each element, including empty values', t => {
    const Message = consensus.common.consensus.EpochProofV1;
    const payload = { pd: [1], app: [[2], '', new Uint8Array([3])] };
    const expectedWire = b4a.from('0a01011201021200120103', 'hex');
    const message = Message.fromObject(payload);
    assertBytes(t, Message.encode(message).finish(), [...expectedWire]);
    for (const value of [message, Message.decode(expectedWire), Message.toObject(message), Message.toObject(payload)]) {
        assertBytes(t, value.pd, [1]);
        value.app.forEach((bytes, i) => assertBytes(t, bytes, [[2], [], [3]][i]));
    }
    t.alike(message.toJSON().app, ['Ag==', '', 'Aw==']);
    t.alike(Message.toObject(message, { bytes: Array }).app, [[2], [], [3]]);
    t.alike(Message.toObject({}, { defaults: true }).app, [], 'the repeated container remains an array');
    t.is(Message.verify({ app: [{ length: 1 }] }), 'app: buffer[] expected');
});

test('Nested messages and reserved property names retain b4a bytes', t => {
    const Message = apply.apply.operations.Operation;
    const input = Message.create({ cao: apply.apply.operations.CoreAdminOperation.create({ in: [255] }) });
    const wire = Message.encode(input).finish();
    for (const value of [Message.fromObject(input), Message.toObject(input), Message.decode(wire)]) {
        assertBytes(t, value.cao.in, [255]);
        t.alike(Message.encode(value).finish(), wire, 'normalization preserves the wire encoding');
    }
});

test('Codec runtime keeps protobufjs factories, utilities and prototypes isolated', t => {
    t.not(runtime.Reader, protobuf.Reader);
    t.not(runtime.Writer, protobuf.Writer);
    t.not(runtime.util.newBuffer, protobuf.util.newBuffer);
    t.is(protobuf.util.bytesFrom, undefined);
    const plain = new protobuf.Writer();
    const originalBytes = protobuf.Writer.prototype.bytes;
    const originalFinish = protobuf.Writer.prototype.finish;
    runtime.Writer.create(new protobuf.Writer());
    t.is(plain.bytes, originalBytes);
    t.is(plain.finish, originalFinish);
    t.is(protobuf.Writer.prototype.bytes, originalBytes);
    t.is(protobuf.Writer.prototype.finish, originalFinish);
});
