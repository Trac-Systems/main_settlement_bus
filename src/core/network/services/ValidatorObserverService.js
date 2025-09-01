import Wallet from "trac-wallet"
import { TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';
import b4a from "b4a";

import { bufferToAddress } from '../../state/utils/address.js';
import { sleep } from '../../../utils/helpers.js';

class ValidatorObserverService {
    #enable_validator_observer;
    #enable_wallet;
    #state;
    #network;

    constructor(network, state, options = {}) {
        this.#enable_validator_observer = false;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#network = network;
        this.#state = state;
    }

    get state() {
        return this.#state;
    }

    get enable_validator_observer() {
        return this.#enable_validator_observer;
    }

    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    async validatorObserver(address) {
        try {
            while (this.#enable_validator_observer && this.#enable_wallet) {
                if (this.#network.validator_stream !== null) {
                    await sleep(1000);
                    continue;
                }

                const lengthEntry = await this.state.getWriterLength();
                const length = Number.isInteger(lengthEntry) && lengthEntry > 0 ? lengthEntry : 0;

                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(this.#findValidator(address, length));
                    await sleep(250);
                }
                await Promise.all(promises);
                await sleep(1000);
            }
        } catch (error) {
            console.log('ValidatorObserverService:', error);
        }
    }

    async #findValidator(address, length) {
        if (this.#network.validator_stream !== null) return;

        const rndIndex = Math.floor(Math.random() * length);
        const validatorAddressBuffer = await this.state.getWriterIndex(rndIndex);

        if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== TRAC_ADDRESS_SIZE) return;

        const validatorAddress = bufferToAddress(validatorAddressBuffer);
        if (validatorAddress === address) return;

        const validatorPubKey = Wallet.decodeBech32m(validatorAddress).toString('hex');
        const validatorEntry = await this.state.getNodeEntry(validatorAddress);
        const adminEntry = await this.state.getAdminEntry();

        if (
            this.#network.validator_stream !== null ||
            this.#network.validator !== null ||
            validatorEntry === null ||
            !validatorEntry.isWriter ||
            (rndIndex >= 25 && validatorEntry.isIndexer) ||
            (rndIndex < 25 && validatorEntry.isIndexer && (!adminEntry || validatorAddress !== adminEntry.address))
        ) {
            return;
        }

        await this.#network.tryConnect(validatorPubKey, 'validator');
    };

    startValidatorObserver() {
        this.#enable_validator_observer = true;
    }

    stopValidatorObserver() {
        this.#enable_validator_observer = false;
    }
}

export default ValidatorObserverService;
