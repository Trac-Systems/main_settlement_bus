import b4a from 'b4a'
import { isDefined } from '../utils/type.js'
import { isHexString } from '../utils/helpers.js'
import _ from 'lodash'

export class Config {
    #options
    #config
    #bootstrap
    #channel

    constructor(options = {}, config = {}) {
        const normalized = this.#validate(options, config)
        this.#options = options
        this.#config = config
        this.#bootstrap = normalized.bootstrap
        this.#channel = normalized.channel
    }

    get addressLength() {
        return this.#config.addressLength
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

    get bootstrap() {
        return this.#bootstrap
    }

    get channel() {
        return this.#channel
    }

    get dhtBootstrap() {
        if (this.#isOverriden('dhtBootstrap')) return this.#options.dhtBootstrap
        return this.#config.dhtBootstrap
    }

    get disableRateLimit() {
        if (this.#isOverriden('disableRateLimit')) return !!this.#options.disableRateLimit
        return !!this.#config.disableRateLimit
    }

    get enableErrorApplyLogs() {
        if (this.#isOverriden('enableErrorApplyLogs')) return !!this.#options.enableErrorApplyLogs
        return !!this.#config.enableErrorApplyLogs
    }

    get enableInteractiveMode() {
        if (this.#isOverriden('enableInteractiveMode')) return this.#options.enableInteractiveMode !== false
        return !!this.#config.enableInteractiveMode
    }

    get enableRoleRequester() {
        if (this.#isOverriden('enableRoleRequester')) return !!this.#options.enableRoleRequester
        return !!this.#config.enableRoleRequester
    }

    get enableValidatorObserver() {
        if (this.#isOverriden('enableValidatorObserver')) return !!this.#options.enableValidatorObserver
        return !!this.#config.enableValidatorObserver
    }

    get enableTxApplyLogs() {
        if (this.#isOverriden('enableTxApplyLogs')) return !!this.#options.enableTxApplyLogs
        return !!this.#config.enableTxApplyLogs
    }

    get enableWallet() {
        if (this.#isOverriden('enableWallet')) return this.#options.enableWallet !== false
        return !!this.#config.enableWallet
    }

    get isAdminMode() {
        return _.endsWith(this.storesDirectory, '/admin')
    }

    get keyPairDirectoryPath() {
        return `${this.storesFullPath}/db`
    }

    get keyPairPath()  {
        return `${this.keyPairDirectoryPath}/keypair.json`
    }

    get maxRetries() {
        if (this.#isOverriden('maxRetries')) return this.#options.maxRetries
        return this.#config.maxRetries
    }

    get maxValidators() {
        if (this.#isOverriden('maxValidators')) return this.#options.maxValidators
        return this.#config.maxValidators
    }

    get maxPeers() {
        if (this.#isOverriden('maxPeers')) return this.#options.maxPeers
        return this.#config.maxPeers
    }

    get maxParallel() {
        if (this.#isOverriden('maxParallel')) return this.#options.maxParallel
        return this.#config.maxParallel
    }

    get maxServerConnections() {
        if (this.#isOverriden('maxServerConnections')) return this.#options.maxServerConnections
        return this.#config.maxServerConnections
    }

    get maxClientConnections() {
        if (this.#isOverriden('maxClientConnections')) return this.#options.maxClientConnections
        return this.#config.maxClientConnections
    }

    get maxWritersForAdminIndexerConnection() {
        if (this.#isOverriden('maxWritersForAdminIndexerConnection')) return this.#options.maxWritersForAdminIndexerConnection
        return this.#config.maxWritersForAdminIndexerConnection
    }

    get processIntervalMs() {
        if (this.#isOverriden('processIntervalMs')) return this.#options.processIntervalMs
        return this.#config.processIntervalMs
    }

    get transactionPoolSize() {
        if (this.#isOverriden('transactionPoolSize')) return this.#options.transactionPoolSize
        return this.#config.transactionPoolSize
    }

    get networkId() {
        return this.#config.networkId
    }

    get host() {
        if (this.#isOverriden('host')) return this.#options.host
        return this.#config.host
    }

    get port() {
        if (this.#isOverriden('port')) return this.#options.port
        return this.#config.port
    }

    get storesDirectory() {
        const storesDirectory = this.#isOverriden('storesDirectory') ?
            this.#options.storesDirectory : this.#config.storesDirectory

        return _.trimEnd(storesDirectory, '/')
    }

    get storeName() {
        return this.#config.storeName
    }

    get storesFullPath() {
        return `${this.storesDirectory}/${this.storeName}`
    }

    get messageThreshold() {
        return this.#config.messageThreshold
    }

    get messageValidatorRetryDelay() {
        return this.#config.messageValidatorRetryDelay
    }

    get messageValidatorResponseTimeout() {
        return this.#config.messageValidatorResponseTimeout
    }

    get rateLimitCleanupIntervalMs() {
        if (this.#isOverriden('rateLimitCleanupIntervalMs')) return this.#options.rateLimitCleanupIntervalMs
        return this.#config.rateLimitCleanupIntervalMs
    }

    get rateLimitConnectionTimeoutMs() {
        if (this.#isOverriden('rateLimitConnectionTimeoutMs')) return this.#options.rateLimitConnectionTimeoutMs
        return this.#config.rateLimitConnectionTimeoutMs
    }

    get rateLimitMaxTransactionsPerSecond() {
        if (this.#isOverriden('rateLimitMaxTransactionsPerSecond')) return this.#options.rateLimitMaxTransactionsPerSecond
        return this.#config.rateLimitMaxTransactionsPerSecond
    }
    
    get pendingRequestTimeout() {
        return this.#config.pendingRequestTimeout
    }

    get txCommitTimeout() {
        return this.#config.txCommitTimeout
    }

    get txPoolSize() {
        return this.#config.txPoolSize
    }

    get validatorHealthCheckInterval() {
        if (this.#isOverriden('validatorHealthCheckInterval')) return this.#options.validatorHealthCheckInterval
        return this.#config.validatorHealthCheckInterval
    }

    get maxPendingRequestsInPendingRequestsService() {
        return this.#config.maxPendingRequestsInPendingRequestsService
    }

    get debug() {
        return this.#config.debug
    }
    
    get pollInterval() {
        if (this.#isOverriden('pollInterval')) return this.#options.pollInterval
        return this.#config.pollInterval
    }

    get adminCacheTTL() {
        if (this.#isOverriden('adminCacheTTL')) return this.#options.adminCacheTTL
        return this.#config.adminCacheTTL
    }
    
    get bootstrapTimeout() {
        if (this.#isOverriden('bootstrapTimeout')) return this.#options.bootstrapTimeout
        return this.#config.bootstrapTimeout
    }

    get writersShortCacheTTL() {
        if (this.#isOverriden('writersShortCacheTTL')) return this.#options.writersShortCacheTTL
        return this.#config.writersShortCacheTTL
    }

    get writersLongCacheTTL() {
        if (this.#isOverriden('writersLongCacheTTL')) return this.#options.writersLongCacheTTL
        return this.#config.writersLongCacheTTL
    }
    
    get validatorConnectionAttemptDelay() {
        if (this.#isOverriden('validatorConnectionAttemptDelay')) return this.#options.validatorConnectionAttemptDelay
        return this.#config.validatorConnectionAttemptDelay
    }

    #isOverriden(prop) {
        return this.#options.hasOwnProperty(prop) && isDefined(this.#options[prop])
    }

    #resolveValidationValue(options, config, field) {
        if (Object.prototype.hasOwnProperty.call(options, field)) {
            const value = options[field]
            if (value !== undefined && value !== null) return value
        }
        return config[field]
    }

    #throwValidationError(field, message) {
        throw new Error(`MainSettlementBus Config: ${field} ${message}`)
    }

    #normalizeBootstrap(value) {
        if (b4a.isBuffer(value)) {
            if (value.length !== 32) {
                this.#throwValidationError('bootstrap', 'must be a 32-byte Buffer or a 64-character hex string.')
            }
            return b4a.from(value)
        }

        if (typeof value !== 'string') {
            this.#throwValidationError('bootstrap', 'must be a 32-byte Buffer or a 64-character hex string.')
        }

        if (!isHexString(value) || value.length !== 64) {
            this.#throwValidationError('bootstrap', 'must be a 64-character hex string.')
        }

        return b4a.from(value, 'hex')
    }

    #normalizeChannel(value) {
        if (!(typeof value === 'string' || b4a.isBuffer(value))) {
            this.#throwValidationError('channel', 'must be a non-empty string or Buffer with at most 32 bytes.')
        }

        const size = b4a.byteLength(value)
        if (size < 1 || size > 32) {
            this.#throwValidationError('channel', 'must be a non-empty string or Buffer with at most 32 bytes.')
        }

        return b4a.alloc(32).fill(value)
    }

    #validateStringField(field, value) {
        if (typeof value !== 'string' || value.trim() === '') {
            this.#throwValidationError(field, 'must be a non-empty string.')
        }
    }

    #validateIntegerField(field, value, { min = 0 } = {}) {
        if (!Number.isInteger(value) || value < min) {
            this.#throwValidationError(field, `must be an integer greater than or equal to ${min}.`)
        }
    }

    #isValidPort(value) {
        return Number.isInteger(value) && value >= 1 && value <= 65535
    }

    #validatePort(field, value) {
        if (!this.#isValidPort(value)) {
            this.#throwValidationError(field, 'must be an integer between 1 and 65535.')
        }
    }

    #validateDhtBootstrap(value) {
        if (!isDefined(value)) return

        if (!Array.isArray(value)) {
            this.#throwValidationError('dhtBootstrap', 'must be an array of "host:port" strings.')
        }

        for (const entry of value) {
            if (typeof entry !== 'string') {
                this.#throwValidationError('dhtBootstrap', 'must contain only "host:port" strings.')
            }

            const separatorIndex = entry.lastIndexOf(':')
            const host = separatorIndex > 0 ? entry.slice(0, separatorIndex).trim() : ''
            const port = separatorIndex > 0 ? Number.parseInt(entry.slice(separatorIndex + 1), 10) : Number.NaN

            if (host === '' || !this.#isValidPort(port)) {
                this.#throwValidationError('dhtBootstrap', 'must contain only valid "host:port" strings.')
            }
        }
    }

    #validate(options, config) {
        const bootstrapValue = this.#resolveValidationValue(options, config, 'bootstrap')
        const channelValue = this.#resolveValidationValue(options, config, 'channel')

        if (!isDefined(bootstrapValue)) {
            this.#throwValidationError('bootstrap', 'is required.')
        }
        if (!isDefined(channelValue)) {
            this.#throwValidationError('channel', 'is required.')
        }

        const normalized = {
            bootstrap: this.#normalizeBootstrap(bootstrapValue),
            channel: this.#normalizeChannel(channelValue)
        }

        this.#validateIntegerField('addressLength', this.#resolveValidationValue(options, config, 'addressLength'), { min: 1 })
        this.#validateStringField('addressPrefix', this.#resolveValidationValue(options, config, 'addressPrefix'))
        this.#validateIntegerField('bech32mHrpLength', this.#resolveValidationValue(options, config, 'bech32mHrpLength'), { min: 1 })
        this.#validateIntegerField('networkId', this.#resolveValidationValue(options, config, 'networkId'), { min: 1 })

        this.#validateStringField('host', this.#resolveValidationValue(options, config, 'host'))
        this.#validatePort('port', this.#resolveValidationValue(options, config, 'port'))
        this.#validateStringField('storesDirectory', this.#resolveValidationValue(options, config, 'storesDirectory'))
        this.#validateStringField('storeName', this.#resolveValidationValue(options, config, 'storeName'))
        this.#validateDhtBootstrap(this.#resolveValidationValue(options, config, 'dhtBootstrap'))

        this.#validateIntegerField('maxRetries', this.#resolveValidationValue(options, config, 'maxRetries'), { min: 0 })
        this.#validateIntegerField('maxValidators', this.#resolveValidationValue(options, config, 'maxValidators'), { min: 1 })
        this.#validateIntegerField('maxPeers', this.#resolveValidationValue(options, config, 'maxPeers'), { min: 1 })
        this.#validateIntegerField('maxParallel', this.#resolveValidationValue(options, config, 'maxParallel'), { min: 1 })
        this.#validateIntegerField('maxWritersForAdminIndexerConnection', this.#resolveValidationValue(options, config, 'maxWritersForAdminIndexerConnection'), { min: 1 })
        this.#validateIntegerField('messageThreshold', this.#resolveValidationValue(options, config, 'messageThreshold'), { min: 1 })
        this.#validateIntegerField('messageValidatorRetryDelay', this.#resolveValidationValue(options, config, 'messageValidatorRetryDelay'), { min: 1 })
        this.#validateIntegerField('messageValidatorResponseTimeout', this.#resolveValidationValue(options, config, 'messageValidatorResponseTimeout'), { min: 1 })
        this.#validateIntegerField('processIntervalMs', this.#resolveValidationValue(options, config, 'processIntervalMs'), { min: 1 })
        this.#validateIntegerField('transactionPoolSize', this.#resolveValidationValue(options, config, 'transactionPoolSize'), { min: 1 })
        this.#validateIntegerField('rateLimitCleanupIntervalMs', this.#resolveValidationValue(options, config, 'rateLimitCleanupIntervalMs'), { min: 1 })
        this.#validateIntegerField('rateLimitConnectionTimeoutMs', this.#resolveValidationValue(options, config, 'rateLimitConnectionTimeoutMs'), { min: 1 })
        this.#validateIntegerField('rateLimitMaxTransactionsPerSecond', this.#resolveValidationValue(options, config, 'rateLimitMaxTransactionsPerSecond'), { min: 1 })
        this.#validateIntegerField('pendingRequestTimeout', this.#resolveValidationValue(options, config, 'pendingRequestTimeout'), { min: 1 })
        this.#validateIntegerField('txCommitTimeout', this.#resolveValidationValue(options, config, 'txCommitTimeout'), { min: 1 })
        this.#validateIntegerField('txPoolSize', this.#resolveValidationValue(options, config, 'txPoolSize'), { min: 1 })
        this.#validateIntegerField('validatorHealthCheckInterval', this.#resolveValidationValue(options, config, 'validatorHealthCheckInterval'), { min: 1 })
        this.#validateIntegerField('maxPendingRequestsInPendingRequestsService', this.#resolveValidationValue(options, config, 'maxPendingRequestsInPendingRequestsService'), { min: 1 })

        return normalized
    }

}
