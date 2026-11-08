import test from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee';
import { encodeConsensusConfig } from '../../../src/codecs/apply/applyOperationCodec.js';
import { encodeVdfConfig } from '../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { EntryType, UINT32_MAX } from '../../../src/utils/constants.js';
import { uint16ToBuffer, uint32ToBuffer } from '../../../src/utils/buffer.js';
import { config } from '../../helpers/config.js';
import { createEpochReadApi, callEpochRpc } from '../../helpers/epochRpc.js';

const signedConfig = { schemaVersion: 1, configData: { difficulty: 55000000, discriminantBitSize: 2048 } };
const unsignedConfig = { schemaVersion: 1, configData: { difficulty: UINT32_MAX, discriminantBitSize: 4096 } };

function encodeConfig({ schemaVersion, configData }) {
    return encodeConsensusConfig({
        sv: b4a.from([schemaVersion]),
        cd: encodeVdfConfig({
            difficulty: uint32ToBuffer(configData.difficulty),
            discriminantBitSize: uint16ToBuffer(configData.discriminantBitSize),
        }),
    });
}

if (typeof globalThis.Bare !== 'undefined') {
    test('consensus config RPC unit tests use Node module mocks', t => t.pass('Node-only'));
} else {
    async function createState(t) {
        const { default: esmock } = await import('esmock');
        const store = new Corestore(await t.tmp());
        const view = new Hyperbee(store.get({ name: 'config' }), { keyEncoding: 'utf-8', valueEncoding: 'binary' });
        t.teardown(async () => {
            await view.close();
            await store.close();
        });
        await view.ready();
        const State = await esmock('../../../src/core/state/State.js', {
            autobase: class {
                constructor() { return { view }; }
            },
        });
        return { state: new State(null, null, config), view };
    }

    test('consensus config RPC selects signed by default and returns decoded JSON or null', async t => {
        const state = {
            getSignedConsensusConfig: sinon.stub(),
            getUnsignedConsensusConfig: sinon.stub(),
            getSignedLength: () => 1,
            getUnsignedLength: () => 1,
        };
        const msb = await createEpochReadApi(t, state, config);
        for (const initialized of [false, true]) {
            state.getSignedConsensusConfig.resolves(initialized ? signedConfig : null);
            state.getUnsignedConsensusConfig.resolves(initialized ? unsignedConfig : null);
            for (const [query, signed] of [['', true], ['?confirmed=true', true], ['?confirmed=false', false]]) {
                state.getSignedConsensusConfig.resetHistory();
                state.getUnsignedConsensusConfig.resetHistory();
                const response = await callEpochRpc(msb, '/v1/consensus-config' + query);
                t.alike(response, { status: 200, body: initialized ? (signed ? signedConfig : unsignedConfig) : null });
                t.ok((signed ? state.getSignedConsensusConfig : state.getUnsignedConsensusConfig).calledOnce);
                t.absent((signed ? state.getUnsignedConsensusConfig : state.getSignedConsensusConfig).called);
            }
        }
        t.alike(await msb.getConsensusConfig(), signedConfig, 'direct API defaults to signed state');
    });

    test('consensus config RPC rejects invalid confirmed values and propagates read failures', async t => {
        const state = {
            getSignedConsensusConfig: sinon.stub().rejects(new Error('signed read failed')),
            getUnsignedConsensusConfig: sinon.stub().rejects(new Error('unsigned read failed')),
            getSignedLength: () => 1,
            getUnsignedLength: () => 1,
        };
        const msb = await createEpochReadApi(t, state, config);
        for (const value of ['', '1', '0', 'TRUE', 'False', 'maybe']) {
            const response = await callEpochRpc(msb, '/v1/consensus-config?confirmed=' + value);
            t.alike(response, { status: 400, body: { error: 'Parameter "confirmed" must be exactly "true" or "false"' } });
        }
        t.absent(state.getSignedConsensusConfig.called);
        t.absent(state.getUnsignedConsensusConfig.called);
        await t.exception(() => callEpochRpc(msb, '/v1/consensus-config'), /signed read failed/);
        await t.exception(() => callEpochRpc(msb, '/v1/consensus-config?confirmed=false'), /unsigned read failed/);
    });

    test('unsigned consensus config reads stored records and rejects corrupt or unsupported data', async t => {
        const { state, view } = await createState(t);
        const snapshots = sinon.spy(view, 'snapshot');
        const msb = await createEpochReadApi(t, state, config);
        const read = () => callEpochRpc(msb, '/v1/consensus-config?confirmed=false');
        t.alike(await read(), { status: 200, body: null });
        await view.put(EntryType.CONSENSUS_CONFIG_CURRENT, uint32ToBuffer(UINT32_MAX));
        const recordKey = EntryType.CONSENSUS_CONFIG_RECORD + UINT32_MAX;
        await view.put(recordKey, encodeConfig(unsignedConfig));
        t.alike(await read(), { status: 200, body: unsignedConfig }, 'uint32 values retain their precision');

        for (const pointer of [b4a.alloc(0), b4a.alloc(3), b4a.alloc(5)]) {
            await view.put(EntryType.CONSENSUS_CONFIG_CURRENT, pointer);
            await t.exception(read, /Invalid current consensus config pointer/);
        }
        await view.put(EntryType.CONSENSUS_CONFIG_CURRENT, uint32ToBuffer(UINT32_MAX));
        await view.del(recordKey);
        await t.exception(read, /Consensus config record 4294967295 does not exist/);
        for (const encoded of [
            b4a.alloc(0),
            b4a.from([0xff]),
            encodeConsensusConfig({ sv: b4a.from([1]), cd: b4a.alloc(5) }),
            encodeConfig({ ...signedConfig, schemaVersion: 2 }),
        ]) {
            await view.put(recordKey, encoded);
            await t.exception.all(read);
        }
        t.ok(snapshots.returnValues.every(snapshot => snapshot.closed), 'snapshots close on success, absence and decode errors');

        const snapshot = view.snapshot();
        sinon.stub(snapshot, 'get').rejects(new Error('storage read failed'));
        const close = sinon.spy(snapshot, 'close');
        snapshots.restore();
        sinon.stub(view, 'snapshot').returns(snapshot);
        await t.exception(read, /storage read failed/);
        t.ok(close.calledOnce, 'snapshot closes after storage errors');
    });

    test('unsigned consensus config keeps pointer and record in one snapshot during a view change', async t => {
        const { state, view } = await createState(t);
        await view.put(EntryType.CONSENSUS_CONFIG_CURRENT, uint32ToBuffer(0));
        await view.put(EntryType.CONSENSUS_CONFIG_RECORD + '0', encodeConfig(signedConfig));
        const snapshot = view.snapshot();
        const get = snapshot.get.bind(snapshot);
        sinon.stub(snapshot, 'get').callsFake(async key => {
            const result = await get(key);
            if (key === EntryType.CONSENSUS_CONFIG_CURRENT) {
                await view.put(EntryType.CONSENSUS_CONFIG_CURRENT, uint32ToBuffer(1));
                await view.put(EntryType.CONSENSUS_CONFIG_RECORD + '1', encodeConfig(unsignedConfig));
                await view.del(EntryType.CONSENSUS_CONFIG_RECORD + '0');
            }
            return result;
        });
        const stub = sinon.stub(view, 'snapshot').returns(snapshot);
        t.alike(await state.getUnsignedConsensusConfig(), signedConfig, 'concurrent changes cannot mix pointer and record views');
        stub.restore();
        t.alike(await state.getUnsignedConsensusConfig(), unsignedConfig, 'the next read uses the updated view');
    });
}
