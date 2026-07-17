import test from 'brittle';
import b4a from 'b4a';

import {requireProofOfTimeConsensusConfig} from '../../../src/core/consensus/requireProofOfTimeConsensusConfig.js';
import {PROOF_OF_TIME_SCHEMA_ID} from '../../../src/core/ledger-config/index.js';

const createActiveConfig = ({schemaId = PROOF_OF_TIME_SCHEMA_ID} = {}) => ({
    descriptor: {
        schemaId,
        configId: b4a.alloc(32, 1)
    },
    adapterConfig: {
        vdfDifficulty: 2,
        vdfDiscriminantSize: 2048
    }
});

test('requireProofOfTimeConsensusConfig returns one coherent active config and adapter view', async t => {
    const activeConfig = createActiveConfig();
    const state = {
        requireLedgerConfigConsensusReady: async () => activeConfig
    };

    const result = await requireProofOfTimeConsensusConfig(state);

    t.is(result.activeConfig, activeConfig);
    t.is(result.vdfParams, activeConfig.adapterConfig);
});

test('requireProofOfTimeConsensusConfig rejects legacy consensus without an active config', async t => {
    await t.exception(
        () => requireProofOfTimeConsensusConfig({
            requireLedgerConfigConsensusReady: async () => null
        }),
        /requires an active ledger config/
    );
});

test('requireProofOfTimeConsensusConfig rejects a different consensus schema', async t => {
    await t.exception(
        () => requireProofOfTimeConsensusConfig({
            requireLedgerConfigConsensusReady: async () => createActiveConfig({schemaId: 'test/other/v1'})
        }),
        /schema is not Proof-of-Time/
    );
});

test('requireProofOfTimeConsensusConfig requires adapter parameters', async t => {
    const activeConfig = createActiveConfig();
    activeConfig.adapterConfig = null;

    await t.exception(
        () => requireProofOfTimeConsensusConfig({
            requireLedgerConfigConsensusReady: async () => activeConfig
        }),
        /has no adapter configuration/
    );
});

test('requireProofOfTimeConsensusConfig rejects malformed config ids and VDF parameters', async t => {
    const invalidId = createActiveConfig();
    invalidId.descriptor.configId = b4a.alloc(31, 1);
    const invalidParams = createActiveConfig();
    invalidParams.adapterConfig.vdfDifficulty = 0;

    await t.exception(
        () => requireProofOfTimeConsensusConfig({
            requireLedgerConfigConsensusReady: async () => invalidId
        }),
        /invalid config id/
    );
    await t.exception(
        () => requireProofOfTimeConsensusConfig({
            requireLedgerConfigConsensusReady: async () => invalidParams
        }),
        /invalid VDF parameters/
    );
});
