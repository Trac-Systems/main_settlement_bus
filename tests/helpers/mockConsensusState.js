import { CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH, ConsensusVersion } from '../../src/utils/constants.js';
import { isBufferValid, safeReadUint8 } from '../../src/utils/buffer.js';

// Simulate future config versions in tests while preserving the production V1 rules.
export async function loadStateWithMockConsensus(mocks, configValidators) {
    const { default: esmock } = await import('esmock');
    const stateUrl = new URL('../../src/core/state/State.js', import.meta.url);
    // Keep dependency mocks active in the original shared methods as well as State.
    const { sharedApply } = await esmock('./contracts/SharedApply.js', stateUrl.href, {}, mocks);

    return esmock('./State.js', stateUrl.href, {}, {
        ...mocks,
        './contracts/SharedApply.js': {
            sharedApply: baseState => class extends sharedApply(baseState) {
                _validateConsensusConfigApply(consensusConfig) {
                    if (!isBufferValid(consensusConfig?.sv, CONSENSUS_CONFIG_SCHEMA_VERSION_BYTE_LENGTH)) {
                        return false;
                    }

                    const version = safeReadUint8(consensusConfig.sv);
                    if (version === ConsensusVersion.VDF_V1 || !Object.hasOwn(configValidators, version)) {
                        return super._validateConsensusConfigApply(consensusConfig);
                    }
                    return configValidators[version](consensusConfig);
                }
            },
        },
    });
}
