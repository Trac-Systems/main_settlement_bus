import { test } from 'brittle';
import b4a from 'b4a';
import { EntryType } from '../../../../../src/utils/constants.js';
import { uint16ToBuffer, uint8ToBuffer } from '../../../../../src/utils/buffer.js';
import { config } from '../../../../helpers/config.js';
import {
    buildSetEpochPayload,
    setupSetEpochScenario
} from './setEpochScenarioHelpers.js';
import {
    applyWithEntryOverridesAndTrackEpochWrites,
    assertEpochStateUnchanged,
    assertSubsequentValidEpochAppend,
    buildConsensusConfigRecord,
    captureEpochState,
    mutateProofProposal
} from './setEpochPersistedStateScenarioHelpers.js';

const CURRENT_EPOCH_KEY = EntryType.EPOCH_CURRENT;
const CURRENT_EPOCH_HASH_KEY = EntryType.EPOCH + '0';
const CONFIG_POINTER_KEY = EntryType.CONSENSUS_CONFIG_CURRENT;
const CONFIG_RECORD_KEY = EntryType.CONSENSUS_CONFIG_RECORD + '0';

const persistedStateCases = [
    {
        name: 'rejects a missing current epoch pointer',
        overrides: new Map([[CURRENT_EPOCH_KEY, null]])
    },
    {
        name: 'rejects a current epoch pointer shorter than 8 bytes',
        overrides: new Map([[CURRENT_EPOCH_KEY, b4a.alloc(7)]])
    },
    {
        name: 'rejects a current epoch pointer longer than 8 bytes',
        overrides: new Map([[CURRENT_EPOCH_KEY, b4a.alloc(9)]])
    },
    {
        name: 'rejects a missing current epoch hash',
        overrides: new Map([[CURRENT_EPOCH_HASH_KEY, null]])
    },
    {
        name: 'rejects a current epoch hash shorter than the proposal hash',
        overrides: new Map([[CURRENT_EPOCH_HASH_KEY, b4a.alloc(31)]])
    },
    {
        name: 'rejects a current epoch hash longer than the proposal hash',
        overrides: new Map([[CURRENT_EPOCH_HASH_KEY, b4a.alloc(33)]])
    },
    {
        name: 'rejects a missing consensus-config pointer',
        overrides: new Map([[CONFIG_POINTER_KEY, null]])
    },
    {
        name: 'rejects a consensus-config pointer shorter than 4 bytes',
        overrides: new Map([[CONFIG_POINTER_KEY, b4a.alloc(3)]])
    },
    {
        name: 'rejects a consensus-config pointer longer than 4 bytes',
        overrides: new Map([[CONFIG_POINTER_KEY, b4a.alloc(5)]])
    },
    {
        name: 'rejects a missing consensus-config record',
        overrides: new Map([[CONFIG_RECORD_KEY, null]])
    },
    {
        name: 'rejects a corrupt consensus-config record',
        overrides: new Map([[CONFIG_RECORD_KEY, b4a.from([0xff])]])
    },
    {
        name: 'rejects an unsupported consensus-config schema version',
        overrides: new Map([[
            CONFIG_RECORD_KEY,
            buildConsensusConfigRecord({ schemaVersion: 2 })
        ]])
    },
    {
        name: 'rejects structurally invalid VDF config data',
        overrides: new Map([[
            CONFIG_RECORD_KEY,
            buildConsensusConfigRecord({ configData: b4a.from([0x01]) })
        ]])
    }
];

for (const testCase of persistedStateCases) {
    test(`State.apply SET_EPOCH persisted state: ${testCase.name}`, async t => {
        await runRejectedSetEpochCase(t, { overrides: testCase.overrides });
    });
}

test('State.apply SET_EPOCH proposal context: rejects an unsupported protocol version', async t => {
    await runRejectedSetEpochCase(t, {
        mutatePayload: payload => mutateProofProposal(payload, proofProposal => {
            proofProposal.protocol_version = uint8ToBuffer(0xff);
        })
    });
});

test('State.apply SET_EPOCH proposal context: rejects a different network id', async t => {
    const differentNetworkId = config.networkId === 0xffff
        ? config.networkId - 1
        : config.networkId + 1;

    await runRejectedSetEpochCase(t, {
        mutatePayload: payload => mutateProofProposal(payload, proofProposal => {
            proofProposal.network_id = uint16ToBuffer(differentNetworkId);
        })
    });
});

test('State.apply SET_EPOCH proposal context: rejects a VDF parameters hash mismatch', async t => {
    await runRejectedSetEpochCase(t, {
        mutatePayload: payload => mutateProofProposal(payload, proofProposal => {
            proofProposal.vdf_parameters_hash = b4a.alloc(32, 0xff);
        })
    });
});

async function runRejectedSetEpochCase(t, {
    overrides = new Map(),
    mutatePayload = payload => payload
} = {}) {
    const context = await setupSetEpochScenario(t);
    const base = context.adminBootstrap.base;
    const validPayload = await buildSetEpochPayload(context, {
        epoch: 1n,
        approverNodes: []
    });
    const rejectedPayload = mutatePayload(validPayload);
    const before = await captureEpochState(base);

    const epochWrites = await applyWithEntryOverridesAndTrackEpochWrites(
        base,
        rejectedPayload,
        overrides
    );

    await assertEpochStateUnchanged(t, base, before, epochWrites);
    await assertSubsequentValidEpochAppend(t, base, validPayload);
}
