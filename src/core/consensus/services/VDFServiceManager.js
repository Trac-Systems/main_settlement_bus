import { createVDFService } from './createVDFService.js';
import { EpochCoordinatorOperations } from './EpochCoordinatorOperations.js';

/**
 * Manages the VDF worker and the epoch operations that use it. Opens, replaces and closes workers one
 * at a time so config changes cannot start overlapping workers.
 */
export class VDFServiceManager {
    #state;
    #wallet;
    #config;
    #vdfService = null;
    #operations = null;
    #lifecycleQueue = Promise.resolve();

    /**
     * Creates the manager. open() starts the first VDF service.
     *
     * @param {import('../../state/State.js').default} state Ledger access used by epoch operations.
     * @param {object} wallet Local proof signing identity.
     * @param {object} config Message and network configuration.
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
     * Returns operations for the current VDF service. Starts a service if needed.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    open() {
        return this.#enqueueLifecycleChange(() => this.#openVdfService());
    }

    /**
     * Closes the current VDF service and starts a new one.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    replace() {
        return this.#enqueueLifecycleChange(async () => {
            await this.#closeVdfService();
            return this.#openVdfService();
        });
    }

    /**
     * Closes the current VDF service. The manager can be opened again later.
     *
     * @returns {Promise<void>}
     */
    close() {
        return this.#enqueueLifecycleChange(() => this.#closeVdfService());
    }

    /**
     * Starts a VDF service and creates the operations that use it. If startup fails, closes the
     * service before returning the error.
     *
     * @returns {Promise<EpochCoordinatorOperations>}
     */
    async #openVdfService() {
        if (this.#operations) return this.#operations;
        if (this.#vdfService) throw new Error('Previous VDF service is still open');

        const vdfService = await createVDFService();

        try {
            await vdfService.ready();
            const epochOperations = new EpochCoordinatorOperations(
                this.#state,
                vdfService,
                this.#wallet,
                this.#config,
            );

            this.#vdfService = vdfService;
            this.#operations = epochOperations;
            return epochOperations;
        } catch (error) {
            await this.#closeUnusedService(vdfService);
            throw error;
        }
    }

    /**
     * Closes the current VDF service. If closing fails, keeps it registered so another worker cannot
     * start while it may still be running.
     *
     * @returns {Promise<void>}
     */
    async #closeVdfService() {
        const vdfService = this.#vdfService;
        if (!vdfService) return;

        this.#operations = null;

        try {
            await vdfService.close();
        } catch {
            throw new Error('Failed to close VDF service');
        }

        if (this.#vdfService === vdfService) this.#vdfService = null;
    }

    /**
     * Closes a service that failed during startup. If closing also fails, keeps the service registered
     * because its worker may still be running.
     *
     * @param {import('./VDFService.js').VDFService} vdfService Service whose startup failed.
     * @returns {Promise<void>}
     */
    async #closeUnusedService(vdfService) {
        try {
            await vdfService.close();
        } catch {
            this.#vdfService = vdfService;
            this.#operations = null;
            throw new Error('Failed to close VDF service');
        }
    }

    /**
     * Runs worker startup, replacement and shutdown one at a time. An error does not block the next
     * operation in the queue.
     *
     * @param {() => Promise<unknown>} lifecycleChange Worker startup, replacement or shutdown to queue.
     * @returns {Promise<unknown>}
     */
    #enqueueLifecycleChange(lifecycleChange) {
        const lifecyclePromise = this.#lifecycleQueue.then(lifecycleChange);

        // Keep the internal queue usable after a failed operation.
        this.#lifecycleQueue = lifecyclePromise.catch(() => {});

        return lifecyclePromise;
    }
}
