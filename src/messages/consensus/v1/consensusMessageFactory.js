import ConsensusMessageDirector from "./ConsensusMessageDirector.js";
import ConsensusMessageBuilder from "./ConsensusMessageBuilder.js";

/**
 * Factory helper to create a director with a fresh builder instance.
 * @param {IWallet} wallet
 * @param {object} config
 * @returns {ConsensusMessageDirector}
 */
export const consensusMessageFactory = (wallet, config) => {
    return new ConsensusMessageDirector(new ConsensusMessageBuilder(wallet, config))
}
