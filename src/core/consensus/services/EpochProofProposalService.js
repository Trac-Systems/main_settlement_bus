import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import Scheduler from '../../../utils/Scheduler.js';
import { OperationType } from '../../../utils/constants.js';
import { Logger } from '../../../utils/logger.js';
import _ from 'lodash'
import { safeEncodeApplyOperation } from '../../../utils/protobuf/operationHelpers.js';
import { addressToBuffer } from '../../state/utils/address.js';

class EpochProofProposalService extends ReadyResource {
    #state;
    #wallet;
    #config;
    #intervalMs;
    #scheduler;
    #logger;
    #isInterrupted;

    /**
     * @param {object} state
     * @param {object} connectionManager
     * @param {object} wallet
     * @param {object} config
     */
    constructor(state, connectionManager, wallet, config) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#intervalMs = this.#config.epochInterval
        this.#scheduler = null;
        this.#logger = new Logger(config);
        this.#isInterrupted = false;
    }

    async _open() {
        this.#scheduler = new Scheduler((next) => this.#worker(next), this.#intervalMs);
    }

    async _close() {
        this.#isInterrupted = true;
        await this.#scheduler.stop(true);
    }

    start() {
        if (this.#scheduler.isRunning) {
            return false;
        }

        this.#ensureScheduler();
        return true;
    }

    async stop(waitForCurrent = true) {
        if (!this.#scheduler.isRunning) {
            return false;
        }

        this.#isInterrupted = true;
        await this.#scheduler.stop(waitForCurrent);
        return true;
    }

    #ensureScheduler() {
        if (this.#scheduler.isRunning) return;

        this.#isInterrupted = false;
        this.#scheduler.start(this.#intervalMs);
        this.#logger.debug(`scheduler started with intervalMs ${this.#intervalMs}`);
    }

    async #worker(next) {
        if (!this.#isInterrupted) {            
            const commiteeMembers = [];
            const epoch = await this.#state.lastEpoch()
            let signatures = [] // list of members signatures
            
            commiteeMembers.forEach(member => {
                // check signatures
                // member == leader?
                // member signed? -> append signature to signatures
                
                return this.#appendEpoch(epoch, signatures)
            })
        }

        next(this.#intervalMs);
    }

    async #appendEpoch(epoch, signatures) {
        const payload = {
            type: OperationType.SET_EPOCH,
            address: addressToBuffer(this.#wallet.address, this.#config.addressPrefix),
            seo: {
                pe: epoch,
                ss: signatures.map(({ signature }) => signature),
                pks: signatures.map(({ publicKey }) => b4a.isBuffer(publicKey) ? publicKey : b4a.from(publicKey, 'hex'))
            }
        };

        const encodedPayload = safeEncodeApplyOperation(payload);
        if (!b4a.isBuffer(encodedPayload) || encodedPayload.length === 0) {
            throw new Error(`Failed to encode epoch operation for epoch ${epoch}.`);
        }

        await this.#state.append(encodedPayload);
    }
}

export default EpochProofProposalService;
