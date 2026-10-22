/**
 * Returns the number of proof signatures required for an epoch. The proposer counts as one signer.
 * With one or two indexers, this is enough. Larger groups need a majority. Appender votes are counted
 * separately by calculateAppenderVoteQuorum.
 *
 * @param {number} indexerCount Number of indexers in the membership read for this attempt.
 * @returns {number} Required total signatures, including the local signature.
 */
export function calculateProofSignatureQuorum(indexerCount) {
    return indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
}
