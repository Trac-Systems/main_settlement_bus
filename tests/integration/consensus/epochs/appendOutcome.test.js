import {
    EpochAppenderSelectionPhase,
    EpochAppendOutcome,
} from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';
import test from 'brittle';
import Corestore from 'corestore';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { readEpochAppendOutcome } from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionLedgerReader.js';
import { EntryType } from '../../../../src/utils/constants.js';
import { uint64ToBuffer } from '../../../../src/utils/buffer.js';
import { EpochAppenderSelector } from '../../../../src/core/consensus/epochAppenderSelection/EpochAppenderSelector.js';
import { encodeSelectionState, decodeSelectionState } from '../../../../src/core/consensus/epochAppenderSelection/epochAppenderSelectionStorage.js';
import { appendSelected } from '../../../helpers/epochAppenderSelection.js';

test('signed writer clock proves a no-op was processed without advancing the view, including after restart', async t => {
    const directory = await t.tmp();
    let store;
    let base;
    async function open() {
        store = new Corestore(directory);
        base = new Autobase(store, {
            valueEncoding: 'binary',
            open: viewStore => new Hyperbee(viewStore.get('test'), {
                keyEncoding: 'utf-8', valueEncoding: 'binary',
            }),
            async apply(nodes, view) {
                for (const { value } of nodes) {
                    if (b4a.toString(value) === 'genesis') {
                        await view.put(EntryType.EPOCH_CURRENT, uint64ToBuffer(0n));
                    }
                    if (b4a.toString(value) === 'accepted') {
                        await view.put(EntryType.EPOCH_CURRENT, uint64ToBuffer(1n));
                    }
                }
            },
        });
        await base.ready();
    }
    t.teardown(async () => {
        await base?.close();
        await store?.close();
    });
    await open();
    await base.append(b4a.from('genesis'));
    const viewLength = base.view.core.signedLength;
    const payload = b4a.from('rejected');
    const publication = {
        writerKey: base.local.key.toString('hex'),
        from: base.local.length,
        payloadHash: b4a.toString(await tracCryptoApi.hash.blake3(payload), 'hex'),
        targetEpoch: '1',
    };
    t.alike(await readEpochAppendOutcome(base, publication), { status: EpochAppendOutcome.UNKNOWN });
    await base.append(payload);
    t.is(base.view.core.signedLength, viewLength, 'the no-op has no application-view block');
    t.alike(await readEpochAppendOutcome(base, publication), { status: EpochAppendOutcome.REJECTED });
    await base.close();
    await store.close();
    await open();
    t.alike(await readEpochAppendOutcome(base, publication), { status: EpochAppendOutcome.REJECTED }, 'outcome is reconstructed without an event');

    const accepted = {
        ...publication,
        from: base.local.length,
        payloadHash: b4a.toString(await tracCryptoApi.hash.blake3(b4a.from('accepted')), 'hex'),
    };
    await base.append(b4a.from('accepted'));
    t.alike(await readEpochAppendOutcome(base, accepted), { status: EpochAppendOutcome.EPOCH_ADVANCED });
    t.alike(await readEpochAppendOutcome(base, { ...accepted, payloadHash: '00'.repeat(32) }), { status: EpochAppendOutcome.EPOCH_ADVANCED },
        'a signed successor epoch resolves an old selection even when its local write is missing');
    t.alike(await readEpochAppendOutcome(base, { ...accepted, targetEpoch: '2', payloadHash: '00'.repeat(32) }), { status: EpochAppendOutcome.UNKNOWN });

    const publicKey = '11'.repeat(32);
    const operations = {
        async load() {
            const value = await base.getUserData('test/append-coordination-state');
            return value && decodeSelectionState(value);
        },
        save: selectionState => base.setUserData('test/append-coordination-state', encodeSelectionState(selectionState)),
        readOutcome: record => readEpochAppendOutcome(base, record),
    };
    let append = async (value, authorizeEpochAppend) => {
        await authorizeEpochAppend({ writerKey: base.local.key.toString('hex'), from: base.local.length });
        await base.append(value);
    };
    const context = {
        networkId: 1, bootstrap: '01'.repeat(32), targetEpoch: '2', parentHash: '02'.repeat(32),
        membershipContext: '03'.repeat(32), configHash: '04'.repeat(32),
        members: [{ publicKey: publicKey, writerKey: base.local.key.toString('hex') }],
    };
    let selector = new EpochAppenderSelector(publicKey, operations);
    t.teardown(() => selector.close());
    const request = await selector.createSelectionRequest(context, b4a.from('rejected-after-restart'));
    await appendSelected(selector, request.requestId, append);
    t.is(selector.activeReservation.phase, EpochAppenderSelectionPhase.PUBLISHING);
    await selector.close();
    await base.close();
    await store.close();
    await open();
    selector = new EpochAppenderSelector(publicKey, operations);
    await selector.open();
    t.is(selector.activeReservation.request.requestId, request.requestId, 'real storage preserves the publication identity');
    t.alike(await selector.refreshAppendOutcome(), { status: EpochAppendOutcome.REJECTED });
    t.absent(selector.activeReservation, 'restart releases only after verifying the signed writer clock');

    append = async (_value, authorizeEpochAppend) => {
        await authorizeEpochAppend({ writerKey: base.local.key.toString('hex'), from: base.local.length });
        throw new Error('process interrupted before local write');
    };
    const interrupted = await selector.createSelectionRequest(context, b4a.from('unknown-after-restart'));
    await t.exception(() => appendSelected(selector, interrupted.requestId, append));
    await selector.close();
    await base.close();
    await store.close();
    await open();
    selector = new EpochAppenderSelector(publicKey, operations);
    await selector.open();
    t.alike(await selector.refreshAppendOutcome(), { status: EpochAppendOutcome.UNKNOWN });
    t.is(await selector.cancel(interrupted.requestId), false, 'a missing publication is not inferred to be cancelled');
});
