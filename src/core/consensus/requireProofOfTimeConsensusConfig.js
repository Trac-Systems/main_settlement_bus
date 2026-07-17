import b4a from 'b4a';
import {
    LEDGER_CONFIG_HASH_BYTES,
    PROOF_OF_TIME_SCHEMA_ID
} from '../ledger-config/index.js';

/**
 * Requires the signed, locally verified Proof-of-Time ledger configuration.
 *
 * Consensus code must use this boundary instead of reading legacy VDF state.
 * It guarantees that the returned parameters belong to the same active
 * descriptor whose config id is committed to ProofProposal field 6.
 *
 * @param {object} state Ledger state exposing requireLedgerConfigConsensusReady().
 * @returns {Promise<{activeConfig: object, vdfParams: object}>}
 */
export async function requireProofOfTimeConsensusConfig(state) {
    if (typeof state?.requireLedgerConfigConsensusReady !== 'function') {
        throw new Error('Proof-of-Time consensus requires the ledger config readiness guard.');
    }

    const activeConfig = await state.requireLedgerConfigConsensusReady();

    if (!activeConfig) {
        throw new Error('Proof-of-Time consensus requires an active ledger config.');
    }

    const schemaId = activeConfig.descriptor?.schemaId;
    if (schemaId !== PROOF_OF_TIME_SCHEMA_ID) {
        throw new Error(`Active ledger config schema is not Proof-of-Time: ${schemaId ?? 'missing'}`);
    }

    if (!b4a.isBuffer(activeConfig.descriptor.configId)
        || activeConfig.descriptor.configId.length !== LEDGER_CONFIG_HASH_BYTES) {
        throw new Error('Active Proof-of-Time ledger config has an invalid config id.');
    }

    const vdfParams = activeConfig.adapterConfig;
    if (!vdfParams || typeof vdfParams !== 'object') {
        throw new Error('Active Proof-of-Time ledger config has no adapter configuration.');
    }

    if (!Number.isInteger(vdfParams.vdfDifficulty) || vdfParams.vdfDifficulty <= 0
        || !Number.isInteger(vdfParams.vdfDiscriminantSize) || vdfParams.vdfDiscriminantSize <= 0) {
        throw new Error('Active Proof-of-Time ledger config has invalid VDF parameters.');
    }

    return {
        activeConfig,
        vdfParams
    };
}

export default requireProofOfTimeConsensusConfig;
