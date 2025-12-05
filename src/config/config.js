import b4a from 'b4a'

export class Config {
    #options
    #config
    #bootstrap
    #channel

    constructor(options, config) {
        this.#validate(options, config)
        this.#options = options
        this.#config = config
        this.#bootstrap = b4a.from(this.#options.bootstrap || this.#config.bootstrap)
        this.#channel = b4a.alloc(32).fill(options.channel || config.channel);
    }

    get storesDirectory() {
        return this.#options.stores_directory || this.#config.storesDirectory
    }

    get storesFullPath() {
        return `${this.storesDirectory}${this.#options.store_name}`
    }

    get bootstrap() {
        return this.#bootstrap
    }

    get keyPairPath()  {
        return `${this.storesFullPath}/db/keypair.json`
    }

    get enableWallet() {
        return this.#options.enable_wallet !== false
    }

    get enableInteractiveMode() {
        return this.#options.enable_interactive_mode !== false
    }
    get isAdminMode() {
        return this.#options.store_name === 'admin'
    }

    get dhtBootstrap() {
        return this.#options.dhtBootstrap || this.#config.dhtBootstrap
    }

    get networkId() {
        return this.#config.networkId
    }

    get addressPrefix() {
        return this.#config.addressPrefix
    }

    get addressPrefixLength() {
        return this.addressPrefix.length
    }

    get bech32mHrpLength() {
        return this.#config.bech32mHrpLength
    }

    get addressLength() {
        return this.#config.addressLength
    }

    get channel() {
        this.#channel
    }

    get maxRetries() {
        return Number(options.max_retries) ? options.max_retries : MAX_RETRIES
    }

    get enableRoleRequester() {
        return !!this.#options.enable_role_requester
    }

    get enableValidatorObserver() {
        return !!this.#options.enable_validator_observer
    }

    get enableErrorApplyLogs() {
        return !!this.#options.enable_error_apply_logs
    }

    get enableTxApplyLogs() {
        return !!this.#options.enable_tx_apply_logs
    }

    get disableRateLimit() {
        return !!this.#options.disable_rate_limit
    }

    #validate(options, config) {
        if (!options.channel && !config.channel) {
            throw new Error(
                "MainSettlementBus: Channel is required. Application cannot start without channel."
            );
        }
    }
}
