/**
 * IMPORTANT
 * Manages events created by network contracts in the apply function.
 *
 * When a valid operation creates an event, the event is stored in this queue
 * together with the signed length required to publish it. On every Autobase
 * update, the current signed length is compared with the required signed length.
 * The event is emitted only when the indexers have signed the related state.
 *
 * This makes sure that an event created during apply is not emitted before
 * its state changes are confirmed by the indexers.
 *
 * Currently, only configuration-change events are supported, which is safe
 * with the expected event volume.
 *
 * TODO: Investigate whether other types of events can be safely supported.
 * Verify that bursts or frequent events (for example, many nodes removing a
 * writer at the same time) cann5ot cause excessive memory usage while queued.
 */

export class StateEventQueue {
    #pendingBatches = [];

    /**
     * Adds events created by a successful apply batch.
     *
     * @param {Array<{type: string, args?: unknown[]}>} events events to publish
     * @param {number} requiredSignedLength view length containing the applied changes
     */
    enqueue(events, requiredSignedLength) {
        if (events.length === 0) return;

        const batch = {
            events,
            requiredSignedLength,
        };

        this.#pendingBatches.push(batch);
    }

    /**
     * Publishes batches which are already present in the signed view.
     *
     * @param {number} signedLength current signed view length
     * @param {(type: string, ...args: unknown[]) => void} emit event emitter
     */
    flush(signedLength, emit) {
        const waitingBatches = [];

        for (const batch of this.#pendingBatches) {
            if (batch.requiredSignedLength > signedLength) {
                waitingBatches.push(batch);
                continue;
            }

            for (const event of batch.events) {
                const args = event.args || [];
                emit(event.type, ...args);
            }
        }

        this.#pendingBatches = waitingBatches;
    }

    /** Removes events which have not been published yet. */
    clear() {
        this.#pendingBatches = [];
    }
}
