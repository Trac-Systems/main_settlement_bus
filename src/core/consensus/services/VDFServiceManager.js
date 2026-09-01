import { createVDFService } from './createVDFService.js';
import { EpochCoordinatorOperations } from './EpochCoordinatorOperations.js';

/** Manages the VDF service used by the epoch coordinator. */
export class VDFServiceManager {
    #state;
    #wallet;
    #config;
    #service = null;
    #operations = null;
    #queue = Promise.resolve();

    /**
     * Creates an empty manager.
     * The first VDF service is opened by {@link open}.
     *
     * @param {object} state
     * @param {object} wallet
     * @param {object} config
     */
    constructor(state, wallet, config) {
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
    }

    /** @returns {EpochCoordinatorOperations|null} operations using the current VDF service */
    get operations() {
        return this.#operations;
    }

    /**
     * Returns current operations.
     * It creates a new VDF service when there is no active service.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    open() {
        return this.#enqueue(() => this.#open());
    }

    /**
     * Closes the current VDF service and creates a new one.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    replace() {
        return this.#enqueue(async () => {
            await this.#close();
            return this.#open();
        });
    }

    /**
     * Closes the current VDF service.
     * The manager can be opened again later.
     *
     * @returns {Promise<void>}
     */
    close() {
        return this.#enqueue(() => this.#close());
    }

    /**
     * Creates a VDF service and its operations.
     * A service which fails during start is closed before the error is returned.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    async #open() {
        if (this.#operations) return this.#operations;
        if (this.#service) throw new Error('Previous VDF service is still open');

        const service = await createVDFService();

        try {
            await service.ready();
            const operations = new EpochCoordinatorOperations(
                this.#state,
                service,
                this.#wallet,
                this.#config,
            );

            this.#service = service;
            this.#operations = operations;
            return operations;
        } catch (error) {
            await this.#closeUnusedService(service);
            throw error;
        }
    }

    /**
     * Closes the current VDF service.
     * When close fails, another VDF worker cannot be started.
     *
     * @returns {Promise<void>}
     */
    async #close() {
        const service = this.#service;
        if (!service) return;

        this.#operations = null;

        try {
            await service.close();
        } catch {
            throw new Error('Failed to close VDF service');
        }

        if (this.#service === service) this.#service = null;
    }

    /**
     * Closes a VDF service which failed before it was used.
     * When close fails, the service is kept to avoid losing a running worker.
     *
     * @param {object} service
     * @returns {Promise<void>}
     */
    async #closeUnusedService(service) {
        try {
            await service.close();
        } catch {
            this.#service = service;
            this.#operations = null;
            throw new Error('Failed to close VDF service');
        }
    }

    /**
     * Runs VDF open, replace, and close operations one by one.
     * A failed operation does not block the next queue item.
     *
     * @param {() => Promise<unknown>} operation
     * @returns {Promise<unknown>}
     */
    #enqueue(operation) {
        const result = this.#queue.then(operation);

        // Keep the internal queue usable after a failed operation.
        this.#queue = result.catch(() => {});

        return result;
    }
}
