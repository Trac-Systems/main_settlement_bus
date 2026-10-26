import test from 'brittle';
import esmock from 'esmock';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { EntryType } from '../../../../src/utils/constants.js';
import { uint32ToBuffer, uint64ToBuffer } from '../../../../src/utils/buffer.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import {
    EpochAppenderSelectionErrorCode,
} from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelectionError.js';
import compatibility from '../../../fixtures/epochAppendCompatibility.js';

async function fixture(options = {}) {
    const closed = [];
    const request = compatibility.request;
    const currentView = { key: b4a.alloc(32, 8), length: 31 };
    const systemCore = { key: b4a.alloc(32, 10), session: () => ({}) };
    const members = request.members;
    const addresses = new Map(members.map(member => {
        const address = tracCryptoApi.address.encode('trac', b4a.from(member.publicKey, 'hex'));
        return [EntryType.WRITER_ADDRESS + member.writerKey, addressToBuffer(address, 'trac')];
    }));
    const viewReads = [];
    class SystemViewMock {
        constructor(_core, checkout) {
            this.views = [currentView];
            this.indexers = [...members].reverse().map(member => ({ key: b4a.from(member.writerKey, 'hex') }));
            this.core = systemCore;
            this.checkout = checkout;
        }
        async ready() {
            if (options.systemReadyError) throw options.systemReadyError;
        }
        async close() {
            closed.push('system');
            if (options.systemCloseError) throw options.systemCloseError;
        }
    }
    class HyperbeeMock {
        constructor(length) {
            this.length = length;
        }
        async ready() {}
        async close() {
            closed.push('view');
            if (options.viewCloseError) throw options.viewCloseError;
        }
        async get(key) {
            viewReads.push({ length: this.length, key });
            if (key.startsWith(EntryType.WRITER_ADDRESS)) {
                const value = addresses.get(key);
                return value ? { value } : null;
            }
            if (key === EntryType.EPOCH_CURRENT) return { seq: 10, value: uint64ToBuffer(6n) };
            if (key === EntryType.EPOCH + '6') return { value: b4a.from(request.parentHash, 'hex') };
            if (key === EntryType.CONSENSUS_CONFIG_CURRENT) return { value: uint32ToBuffer(1) };
            if (key === EntryType.CONSENSUS_CONFIG_RECORD + '1') return { value: b4a.from('signed config') };
            return null;
        }
    }
    const module = await esmock('../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionLedgerReader.js', {
        'autobase/lib/system.js': SystemViewMock,
    });
    const base = {
        system: { core: systemCore, indexers: [] }, core: systemCore,
        signedLength: 20, key: b4a.from(request.bootstrap, 'hex'),
        view: { checkout: length => new HyperbeeMock(length) },
    };
    return { ...module, base, closed, viewReads, config: { networkId: request.networkId, addressPrefix: 'trac' } };
}

test('signed epoch reader closes every resource and preserves the original read failure', async t => {
    const readFailure = new Error('read failure');
    const viewCloseError = new Error('view close failure');
    const systemCloseError = new Error('system close failure');
    const f = await fixture({ viewCloseError, systemCloseError });
    const error = await f.withSignedEpochView(f.base, async () => { throw readFailure; }).catch(error => error);
    t.is(error, readFailure);
    t.alike(error.cleanupErrors, [viewCloseError, systemCloseError]);
    t.alike(f.closed.sort(), ['system', 'view']);
});

test('signed epoch reader closes its checkpoint when readiness fails', async t => {
    const systemReadyError = new Error('checkpoint unavailable');
    const f = await fixture({ systemReadyError });
    const error = await f.withSignedEpochView(f.base, async () => { t.fail('read cannot start'); }).catch(error => error);
    t.is(error, systemReadyError);
    t.alike(f.closed, ['system']);
    f.base.signedLength = 0;
    const missing = await f.withSignedEpochView(f.base, async () => {}).catch(error => error);
    t.is(missing.code, EpochAppenderSelectionErrorCode.SIGNED_CHECKPOINT_UNAVAILABLE);
});

test('voters and identities come from the same signed checkpoint, independently of the live membership', async t => {
    const f = await fixture();
    const context = await f.readEpochAppenderSelectionContext(f.base, f.config);
    t.is(context.targetEpoch, '7');
    t.alike(context.members, compatibility.request.members);
    t.ok(f.viewReads.every(read => read.length === 31), 'all reads use the signed system view length');
    t.alike(f.closed.sort(), ['system', 'view']);
    f.base.signedLength = 25;
    const later = await f.readEpochAppenderSelectionContext(f.base, f.config);
    t.is(later.membershipContext, context.membershipContext, 'unrelated signed system writes do not restart elections');
});
