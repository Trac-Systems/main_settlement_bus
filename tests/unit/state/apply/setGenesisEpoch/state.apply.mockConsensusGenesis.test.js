import test from 'brittle';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { setupStateNetwork } from '../../../../helpers/StateNetworkFactory.js';
import { seedBootstrapIndexer } from '../../../../helpers/autobaseTestHelpers.js';
import { config } from '../../../../helpers/config.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';
import { snapshotEpochLedger } from '../setEpoch/setEpochHandlerBranchTestHelpers.js';
import { createGenesisEpochProof } from '../../../../../src/core/state/utils/epochProof.js';
import { validateConsensusConfig } from '../../../../../src/core/state/utils/consensusConfig.js';
import {
    decodeConsensusConfig,
    encodeConsensusConfig,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { EntryType } from '../../../../../src/utils/constants.js';
import { uint16ToBuffer } from '../../../../../src/utils/buffer.js';
import {
    appendAndUpdate,
    assertOperationRecorded,
    buildSetGenesisEpochPayload,
} from './setGenesisEpochScenarioHelpers.js';

if (typeof globalThis.Bare !== 'undefined') {
    test('Synthetic consensus genesis requires Node module mocking', t => {
        t.pass('real VDF genesis tests also run in Bare');
    });
} else {
    test('State.apply initializes and replays an opaque V2 genesis without using VDF', async t => {
        const { default: esmock } = await import('esmock');
        const initialConfig = { sv: b4a.from([2]), cd: b4a.from([2, 42]) };
        const encodedInitialConfig = encodeConsensusConfig(initialConfig);
        const genesisCalls = [];
        let vdfCalls = 0;

        // Only the config format and genesis factory are synthetic. This tests
        // that apply stores opaque genesis bytes, not the production V2 registry.
        // Authorization, signatures, hashing, ledger writes and replay are real.
        const StateWithV2 = await esmock('../../../../../src/core/state/State.js', {
            '../../../../../src/core/state/utils/consensusConfig.js': {
                validateConsensusConfig: value => value.sv[0] === 2
                    ? b4a.equals(value.cd, initialConfig.cd)
                    : validateConsensusConfig(value),
            },
            '../../../../../src/core/state/utils/epochProof.js': {
                createGenesisEpochProof: async (proposerAddress, encodedConfig, networkConfig) => {
                    if (decodeConsensusConfig(encodedConfig).sv[0] !== 2) {
                        vdfCalls++;
                        return createGenesisEpochProof(proposerAddress, encodedConfig, networkConfig);
                    }

                    genesisCalls.push({ proposerAddress, encodedConfig, networkId: networkConfig.networkId });
                    return b4a.concat([
                        b4a.from('mock-consensus-v2:genesis:'),
                        uint16ToBuffer(networkConfig.networkId),
                        b4a.from(proposerAddress),
                        decodeConsensusConfig(encodedConfig).cd,
                    ]);
                },
            },
        });
        const context = await setupStateNetwork({
            nodes: 2,
            stateClass: StateWithV2,
            stateOptions: { enableTxApplyLogs: false },
        });
        t.teardown(() => context.teardown());
        seedBootstrapIndexer(context);

        const { base, wallet } = context.adminBootstrap;
        await appendAndUpdate(base, await buildAddAdminRequesterPayload(context));
        const payload = await buildSetGenesisEpochPayload(context, {
            schemaVersion: 2,
            configData: initialConfig.cd,
        });
        await appendAndUpdate(base, payload);

        const expectedGenesis = b4a.concat([
            b4a.from('mock-consensus-v2:genesis:'),
            uint16ToBuffer(config.networkId),
            b4a.from(wallet.address),
            initialConfig.cd,
        ]);
        const expectedHash = await tracCryptoApi.hash.blake3Safe(expectedGenesis);
        const expectedEpochState = {
            currentEpoch: b4a.alloc(8).toString('hex'),
            targetEpoch: expectedHash.toString('hex'),
            reverseEntries: [[EntryType.EPOCH_HASH + expectedHash.toString('hex'), expectedGenesis.toString('hex')]],
        };

        t.is(genesisCalls.length, 1, 'the bootstrap applies the V2 genesis once');
        t.is(vdfCalls, 0, 'initial V2 config never delegates to the VDF genesis generator');
        t.alike(await snapshotEpochLedger(base, 0n), expectedEpochState,
            'epoch zero stores the distinct V2 bytes under their real content hash');
        t.alike((await base.view.get(EntryType.CONSENSUS_CONFIG_CURRENT))?.value, b4a.alloc(4),
            'the initial V2 config is record zero, not record two');
        t.alike((await base.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 0))?.value, encodedInitialConfig,
            'record zero preserves the initial V2 config envelope');
        await assertOperationRecorded(t, base, payload, true);

        const reader = context.peers[1].base;
        t.is(await reader.view.get(EntryType.EPOCH_CURRENT), null, 'the reader has not replayed genesis yet');
        await context.sync();

        t.is(genesisCalls.length, 2, 'the reader regenerates genesis while replaying the feed');
        t.is(vdfCalls, 0, 'historical V2 replay does not fall back to VDF');
        for (const call of genesisCalls) {
            t.is(call.proposerAddress, wallet.address, 'genesis uses the original proposer on both nodes');
            t.is(call.networkId, config.networkId, 'genesis uses the network id on both nodes');
            t.alike(call.encodedConfig, encodedInitialConfig, 'genesis uses the config carried by the initial operation');
        }
        t.alike(await snapshotEpochLedger(reader, 0n), expectedEpochState,
            'replay reproduces the same opaque genesis, hash and epoch pointer');
        t.alike((await reader.view.get(EntryType.CONSENSUS_CONFIG_CURRENT))?.value, b4a.alloc(4),
            'replay keeps the initial config record active');
        t.alike((await reader.view.get(EntryType.CONSENSUS_CONFIG_RECORD + 0))?.value, encodedInitialConfig,
            'replay preserves the initial V2 config bytes');
        await assertOperationRecorded(t, reader, payload, true);
    });
}
