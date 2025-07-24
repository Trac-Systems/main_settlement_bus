
import Protomux from 'protomux';
import b4a from 'b4a';
import c from 'compact-encoding';
import { MAX_PRE_TX_PAYLOAD_BYTE_SIZE,TRANSACTION_POOL_SIZE } from '../../../utils/constants.js';
import { normalizeBuffer } from '../../../utils/buffer.js';
import PreTransaction from '../validators/PreTransaction.js';
import StateMessageOperations from '../../../messages/stateMessages/StateMessageOperations.js';
import TransactionRateLimiterService from '../services/TransactionRateLimiterService.js';


class NetworkMessages {
    #rateLimiter;

    constructor(network) {
        this.network = network;
        this.#rateLimiter = new TransactionRateLimiterService();
    }

    setupConnection(connection, network, state, wallet, writingKey, handleIncomingEvent) {
        const mux = Protomux.from(connection);
        connection.userData = mux;
        const message_channel = mux.createChannel({
            protocol: b4a.toString(this.network.channel, 'utf8'),
            onopen() { },
            onclose() { }
        });

        message_channel.open();
        const message = message_channel.addMessage({
            encoding: c.json,
            onmessage: async (msg) => {
                try {
                    const channelString = b4a.toString(network.channel, 'utf8');

                    if (msg === 'get_validator') {
                        await network.handleGetValidatorResponse(message, connection, channelString, wallet, writingKey);
                        network.swarm.leavePeer(connection.remotePublicKey)
                    }
                    else if (msg === 'get_admin') {
                        await network.handleGetAdminRequest(message, connection, channelString, wallet, writingKey, state);
                        network.swarm.leavePeer(connection.remotePublicKey)

                    }
                    else if (msg === 'get_node') {
                        await network.handleCustomNodeRequest(message, connection, channelString, wallet, writingKey)
                        network.swarm.leavePeer(connection.remotePublicKey)

                    }
                    // ---------- HANDLING RECEIVED MESSAGES ----------
                    else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'validatorResponse') {
                        await network.handleValidatorResponse(msg, connection, channelString, state, wallet);
                        network.swarm.leavePeer(connection.remotePublicKey);
                    }
                    else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'adminResponse') {

                        await network.handleAdminResponse(msg, connection, channelString, state, wallet);
                        network.swarm.leavePeer(connection.remotePublicKey)
                    }
                    else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'nodeResponse') {

                        await network.handleCustomNodeResponse(msg, connection, channelString, state, wallet);
                        network.swarm.leavePeer(connection.remotePublicKey)
                    }
                    // ---------- HANDLING OPERATIONS ----------
                    else if (msg.message !== undefined && ['addWriter', 'removeWriter', 'addAdmin', 'whitelisted'].includes(msg.op)) {
                        const messageBuffer = normalizeBuffer(msg.message);
                        if (!messageBuffer) {
                            throw new Error(`Invalid operation message from peer by ${b4a.toString(connection.remotePublicKey, 'hex')}`);
                        }
                        await handleIncomingEvent(messageBuffer);
                        network.swarm.leavePeer(connection.remotePublicKey);
                    } else {
                        if (state.isIndexer() || !state.isWritable()) return;

                        if (true !== network.disable_rate_limit) {
                            const shouldDisconnect = this.#rateLimiter.handleRateLimit(connection, network);
                            if (shouldDisconnect) {
                                throw new Error(`Rate limit exceeded for peer ${b4a.toString(connection.remotePublicKey, 'hex')}. Disconnecting...`);
                            }
                        }

                        if (network.poolService.tx_pool.length >= TRANSACTION_POOL_SIZE) {
                            throw new Error("Transaction pool is full, ignoring incoming transaction.");
                        }

                        if (b4a.byteLength(JSON.stringify(msg)) > MAX_PRE_TX_PAYLOAD_BYTE_SIZE) {
                            throw new Error(`Payload size exceeds maximum limit of ${MAX_PRE_TX_PAYLOAD_BYTE_SIZE} bytes by .`);
                        }

                        const parsedPreTx = msg;
                        const validator = new PreTransaction(state, wallet, network);
                        const isValid = await validator.validate(parsedPreTx);

                        if (isValid) {
                            const postTx = await StateMessageOperations.assemblePostTxMessage(
                                wallet,
                                parsedPreTx.va,
                                b4a.from(parsedPreTx.tx, 'hex'),
                                parsedPreTx.ia,
                                b4a.from(parsedPreTx.iw, 'hex'),
                                b4a.from(parsedPreTx.in, 'hex'),
                                b4a.from(parsedPreTx.ch, 'hex'),
                                b4a.from(parsedPreTx.is, 'hex'),
                                b4a.from(parsedPreTx.bs, 'hex'),
                                b4a.from(parsedPreTx.mbs, 'hex')
                            );
                            network.poolService.addTransaction(postTx);
                        }

                        network.swarm.leavePeer(connection.remotePublicKey);
                    }
                } catch (e) {
                    console.error(e);
                }
                finally {
                    // In the future we can send a response to the peer with the status of the operation
                    // For now, we just disconnect the peer if an error occurs
                    network.swarm.leavePeer(connection.remotePublicKey);
                }
            }
        });

        connection.messenger = message;
        return { message_channel, message };
    }
}

export default NetworkMessages;