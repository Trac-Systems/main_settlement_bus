/** Build a signed-context fixture with matching member and writer lists. */
export function createSelectionContext(memberCount) {
    const members = Array.from({ length: memberCount }, (_, index) => ({
        writerKey: selectionKey(index + 10),
        publicKey: selectionKey(index + 1),
    }));
    return {
        networkId: 1,
        bootstrap: selectionKey(100),
        targetEpoch: '7',
        parentHash: selectionKey(101),
        membershipContext: selectionKey(102),
        configHash: selectionKey(103),
        members,
        currentWriterKeys: members.map(member => member.writerKey),
    };
}

/** The caller owns the append; the selector authorizes it inside the writer queue. */
export async function appendSelected(selector, requestId, append) {
    const payload = await selector.getSelectedEpochPayload(requestId);
    return append(payload, location => selector.authorizeEpochAppend(requestId, location));
}

/** Deterministic 32-byte keys for selector fixtures that do not exercise signatures. */
export function selectionKey(index) {
    return index.toString(16).padStart(64, '0');
}
