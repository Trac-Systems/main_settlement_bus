import b4a from 'b4a'
import ReadyResource from 'ready-resource'
import { EventEmitter } from 'events'
import { LegacyProtocolEventType } from '../../../utils/constants.js'
import GetRequestHandler from '../protocols/legacy/handlers/GetRequestHandler.js'
import ResponseHandler from '../protocols/legacy/handlers/ResponseHandler.js'
import RoleOperationHandler from '../protocols/shared/handlers/RoleOperationHandler.js'
import SubnetworkOperationHandler from '../protocols/shared/handlers/SubnetworkOperationHandler.js'
import TransferOperationHandler from '../protocols/shared/handlers/TransferOperationHandler.js'
import TransactionRateLimiterService from './TransactionRateLimiterService.js'

class LegacyProtocolProcesser extends EventEmitter {
    #network
    #config
    #handlers

    /**
     * @param {Network} network
     * @param {State} state
     * @param {PeerWallet} wallet
     * @param {object} config
     **/
    constructor(network, state, wallet, rateLimiter, config) {
        super()
        this.#network = network
        this.#config = config
        this.#handlers = {
            get: new GetRequestHandler(wallet, state),
            response: new ResponseHandler(network, state, wallet, config),
            roleTransaction: new RoleOperationHandler(network, state, wallet, rateLimiter, config),
            subNetworkTransaction: new SubnetworkOperationHandler(network, state, wallet, rateLimiter, config),
            tracNetworkTransaction: new TransferOperationHandler(network, state, wallet, rateLimiter, config),
        }

        this.setupListeners()
    }

    // async _open() {
    //     this.#setupListeners()
    // }

    // async _close() {
    //     this.#cleanupListeners()
    // }

    #onGet = async (incomingMessage, connection, protocolSession) => {
        await this.#handlers.get.handle(
            incomingMessage,
            protocolSession,
            connection,
            b4a.toString(this.#config.channel, 'utf8')
        )
    }

    #onResponse = async (incomingMessage, connection) => {
        await this.#handlers.response.handle(
            incomingMessage,
            connection,
            b4a.toString(this.#config.channel, 'utf8')
        )
    }

    #onRoleTransaction = async (incomingMessage, connection) => {
        await this.#handlers.roleTransaction.handle(incomingMessage, connection)
    }

    #onSubNetworkTransaction = async (incomingMessage, connection) => {
        await this.#handlers.subNetworkTransaction.handle(incomingMessage, connection)
    }

    #onTransferTransaction = async (incomingMessage, connection) => {
        await this.#handlers.tracNetworkTransaction.handle(incomingMessage, connection)
    }

    setupListeners() {
        this.#cleanupListeners()

        this.#network.on(LegacyProtocolEventType.GET, this.#onGet)
        this.#network.on(LegacyProtocolEventType.RESPONSE, this.#onResponse)
        this.#network.on(LegacyProtocolEventType.ROLE_TRANSACTION, this.#onRoleTransaction)
        this.#network.on(LegacyProtocolEventType.SUBNETWORK_TRANSACTION, this.#onSubNetworkTransaction)
        this.#network.on(LegacyProtocolEventType.TRANSFER_TRANSACTION, this.#onTransferTransaction)
    }

    #cleanupListeners() {
        this.#network.removeListener(LegacyProtocolEventType.GET, this.#onGet)
        this.#network.removeListener(LegacyProtocolEventType.RESPONSE, this.#onResponse)
        this.#network.removeListener(LegacyProtocolEventType.ROLE_TRANSACTION, this.#onRoleTransaction)
        this.#network.removeListener(LegacyProtocolEventType.SUBNETWORK_TRANSACTION, this.#onSubNetworkTransaction)
        this.#network.removeListener(LegacyProtocolEventType.TRANSFER_TRANSACTION, this.#onTransferTransaction)
    }
}

export default LegacyProtocolProcesser;
