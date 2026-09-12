import test from 'brittle';
import tracCryptoApi from 'trac-crypto-api';
import { EntryType } from '../../../../../src/utils/constants.js';
import { decodeEpochRecord } from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    appendAndUpdate,
    assertCurrentConfigId,
    assertOperationRecorded,
    assertSetConsensusConfigFailureState,
    assertVdfConfigRecord,
    buildSetConsensusConfigPayload,
    setupSetConsensusConfigScenario,
    UPDATED_DIFFICULTY,
    UPDATED_DISCRIMINANT_BIT_SIZE,
} from './setConsensusConfigScenarioHelpers.js';
import {
    assertGenesisInitialized,
    assertSetGenesisEpochFailureState,
    buildSetGenesisEpochPayload,
} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';
import { snapshotView } from '../setEpoch/setEpochHandlerBranchTestHelpers.js';

async function mockOffchainConsensusUtils(mockUtility) {
    const { default: esmock } = await import('esmock');
    // Global mocks catch indirect imports from on-chain helpers as well.
    return esmock('../../../../../src/core/state/State.js', {}, {
        '../../../../../src/utils/consensusConfig.js': {
            validateConsensusConfig: mockUtility,
            decodeVersionedConsensusConfig: mockUtility,
            safeDecodeVersionedConsensusConfig: mockUtility,
        },
    });
}

// Change only off-chain src/utils helpers. State.apply and all on-chain
// state/utils validation, transitions and genesis generation remain real.
// Read the view directly: signed config getters intentionally use these utilities
// outside apply and are not part of this isolation boundary.
if (typeof globalThis.Bare !== 'undefined') {
    test('State.apply consensus validation isolation requires Node module mocking', t => {
        t.pass('the real config validation cases also run in Bare');
    });
} else {
    test('State.apply accepts valid genesis and V1 parameter updates without off-chain consensus utilities', async t => {
        let offchainCalls = 0;
        const stateClass = await mockOffchainConsensusUtils(() => {
            offchainCalls++;
            throw new Error('Off-chain consensus utilities must not run in apply.');
        });
        const context = await setupSetConsensusConfigScenario(t, {
            stateClass,
            initializeGenesis: false,
        });
        const base = context.adminBootstrap.base;
        const genesis = await buildSetGenesisEpochPayload(context);

        await appendAndUpdate(base, genesis);
        await assertGenesisInitialized(t, base, genesis);
        // Baseline VDF encoding: network 918, bootstrap mnemonic fixture,
        // difficulty 55,000,000 and 2048-bit discriminant. Do not derive this
        // expected hash through a genesis generator during the test. The inner
        // proof stays unchanged; the epoch hash now includes its version envelope.
        const genesisHash = 'f5b9f177a3eba84e5f6cd203c244cef9de11d6e15c1ad746ba77c652852b494c';
        t.is((await base.view.get(EntryType.EPOCH + '0'))?.value.toString('hex'), genesisHash,
            'apply hashes the canonical versioned VDF genesis record');
        const genesisEntry = await base.view.get(EntryType.EPOCH_HASH + genesisHash);
        t.is(genesisEntry?.value.length, 717, 'apply stores the canonical VDF genesis record length');
        const genesisRecord = decodeEpochRecord(genesisEntry.value);
        t.is(genesisRecord.sv[0], 1, 'the stored genesis identifies its VDF V1 format');
        t.is(genesisRecord.data.length, 711, 'the inner VDF genesis length stays unchanged');
        t.is((await tracCryptoApi.hash.blake3(genesisRecord.data)).toString('hex'),
            '85783ed15286fbff54bfb29a328401899009f32fc1cfe3c2bd4ee0e141202273',
            'the inner VDF genesis bytes stay unchanged');
        await context.sync();
        await assertGenesisInitialized(t, context.peers[1].base, genesis);

        const update = await buildSetConsensusConfigPayload(context);
        await appendAndUpdate(base, update);
        await context.sync();

        for (const peer of context.peers) {
            t.is((await peer.base.view.get(EntryType.EPOCH + '0'))?.value.toString('hex'), genesisHash,
                'parameter updates and replay preserve the baseline genesis hash');
            await assertCurrentConfigId(t, peer.base, 1);
            await assertVdfConfigRecord(t, peer.base, 1, UPDATED_DIFFICULTY, UPDATED_DISCRIMINANT_BIT_SIZE);
            await assertOperationRecorded(t, peer.base, update, true);
        }
        t.is(offchainCalls, 0, 'genesis, config updates and replay do not call off-chain consensus utilities');

        // Positive control: the off-chain signed getter must reach the mock.
        await t.exception(stateClass.prototype.getSignedConsensusConfig.call({
            getSigned: async key => (await base.view.get(key))?.value ?? null,
        }), /Off-chain consensus utilities must not run in apply/);
        t.is(offchainCalls, 1, 'the mock intercepts off-chain decoding but not apply');
    });

    test('State.apply rejects invalid genesis configs even when off-chain validation accepts everything', async t => {
        let offchainCalls = 0;
        const stateClass = await mockOffchainConsensusUtils(() => {
            offchainCalls++;
            return true;
        });
        const context = await setupSetConsensusConfigScenario(t, {
            stateClass,
            initializeGenesis: false,
        });
        const base = context.adminBootstrap.base;
        const before = await snapshotView(base);

        for (const options of [{ difficulty: 0 }, { schemaVersion: 2 }]) {
            const payload = await buildSetGenesisEpochPayload(context, options);
            await appendAndUpdate(base, payload);
            await assertSetGenesisEpochFailureState(t, context, payload);
            t.alike(await snapshotView(base), before, 'rejected genesis leaves the whole view unchanged');
            t.alike(await snapshotView(context.peers[1].base), before, 'replay leaves the whole view unchanged');
        }
        t.is(offchainCalls, 0, 'genesis rejection is independent of off-chain consensus utilities');
    });

    test('State.apply rejects invalid config updates even when off-chain validation accepts everything', async t => {
        let offchainCalls = 0;
        const stateClass = await mockOffchainConsensusUtils(() => {
            offchainCalls++;
            return true;
        });
        const context = await setupSetConsensusConfigScenario(t, { stateClass });
        const base = context.adminBootstrap.base;
        const before = await snapshotView(base);

        for (const options of [{ difficulty: 0 }, { schemaVersion: 2 }]) {
            const payload = await buildSetConsensusConfigPayload(context, options);
            await appendAndUpdate(base, payload);
            await assertSetConsensusConfigFailureState(t, context, payload);
            t.alike(await snapshotView(base), before, 'rejected config leaves the whole view unchanged');
            t.alike(await snapshotView(context.peers[1].base), before, 'replay leaves the whole view unchanged');
        }
        t.is(offchainCalls, 0, 'config rejection is independent of off-chain consensus utilities');
    });
}
