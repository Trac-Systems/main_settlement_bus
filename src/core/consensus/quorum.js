/** Returns the required number of signatures, including the proposer's signature. */
export function calculateQuorum(indexerCount) {
    return indexerCount <= 2 ? 1 : Math.floor(indexerCount / 2) + 1;
}
