import SchedulableService from '../../../utils/scheduler/SchedulableService.js';
import { Logger } from '../../../utils/logger.js';
import { createVDFService } from './createVDFService.js';
import { EpochCoordinatorOperations } from './EpochCoordinatorOperations.js';
import { EpochCoordinationRound } from './EpochCoordinationRound.js';

class EpochCoordinatorService extends SchedulableService {
    #state;
    #wallet;
    #config;
    #manager;
    #intervalMs;
    #logger;
    #vdfService;
    #operations;

    /**
     * @param {object} state
     * @param {object} wallet
     * @param {object} config
     * @param {object} manager
     */
    constructor(state, wallet, config, manager) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#manager = manager;
        this.#intervalMs = config.epochInterval;
        this.#logger = new Logger(config);
    }

    async _open() {
        this.#vdfService = await createVDFService();
        await this.#vdfService.ready();

        this.#operations = new EpochCoordinatorOperations(
            this.#state,
            this.#vdfService,
            this.#wallet,
            this.#config,
        );
    }

    async _close() {
        await super._close();
        await this.#vdfService?.close();
    }

    async start() {
        if (this.isSchedulerRunning) return false;
        return super.start(this.#intervalMs);
    }

    getScheduleInterval() {
        return this.#intervalMs;
    }

    async worker(next, hold) {
        if (!await this.#shouldRun()) {
            next(this.#intervalMs);
            return;
        }

        hold();

        const round = new EpochCoordinationRound({
            state: this.#state,
            wallet: this.#wallet,
            config: this.#config,
            manager: this.#manager,
            logger: this.#logger,
            operations: this.#operations,
            intervalMs: this.#intervalMs,
            stopEmitter: this,
        });

        await round.run(next);
    }

    async #shouldRun() {
        const epoch = await this.#state.getCurrentEpoch();
        return epoch !== null && epoch >= 0n && !this.isInterrupted;
    }
}

export default EpochCoordinatorService;
