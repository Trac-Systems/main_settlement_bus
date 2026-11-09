// Runtime view of the install-time Hypercore patch (scripts/hypercore-stallfix/). It looks at the Replicator class
// of a live core, so it reports the Hypercore copy that is actually loaded, not the one npm resolution suggests.
export const HYPERCORE_STALLFIX_MARKER = 'openmayhem-stallfix-v1';

/**
 * @param {object} core a Hypercore session (for MSB: state.base.core, the system view)
 * @param {object|null} store optional Corestore; when given, request counters are summed over its open cores
 */
export function hypercoreStallfixStatus(core, store = null) {
    const Replicator = core?.core?.replicator?.constructor ?? null;
    const marker = typeof Replicator?.STALLFIX === 'string' ? Replicator.STALLFIX : null;
    const status = {
        patched: marker === HYPERCORE_STALLFIX_MARKER,
        marker,
        expiredRequests: null,
        notAvailableSent: null,
        notAvailableSuppressed: null
    };
    if (marker === null) return status;

    let expired = 0;
    let sent = 0;
    let suppressed = 0;
    const cores = store?.cores?.map;
    const list = cores && typeof cores.values === 'function' ? cores.values() : [core.core];
    for (const c of list) {
        const stats = c?.replicator?._sfStats;
        if (!stats) continue;
        expired += stats.expired;
        sent += stats.notAvailableSent;
        suppressed += stats.notAvailableSuppressed;
    }
    status.expiredRequests = expired;
    status.notAvailableSent = sent;
    status.notAvailableSuppressed = suppressed;
    return status;
}

/** One startup line for logs/alerts. */
export function hypercoreStallfixLine(label, core) {
    const { patched, marker } = hypercoreStallfixStatus(core);
    if (patched) return `[${label}] Hypercore replication stall fix: active (${marker})`;
    return `[${label}] WARNING: Hypercore replication stall fix NOT active in the loaded hypercore` +
        ` (marker: ${marker ?? 'none'}). Reinstall without --ignore-scripts or run scripts/hypercore-stallfix/apply.mjs.`;
}
