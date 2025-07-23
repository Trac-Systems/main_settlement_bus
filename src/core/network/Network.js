import w from 'protomux-wakeup';
import b4a from 'b4a';
import Hyperswarm from 'hyperswarm';
import Wallet from 'trac-wallet';
import Protomux from 'protomux'
import c from 'compact-encoding'
import ReadyResource from 'ready-resource';
import { sleep } from '../../utils/helpers.js';
import { normalizeBuffer } from '../../utils/buffer.js';
import PreTransactionValidator from './validators/PreTransactionValidator.js';
import {
    TRAC_NAMESPACE,
    MAX_PEERS,
    MAX_PARALLEL,
    MAX_SERVER_CONNECTIONS,
    MAX_CLIENT_CONNECTIONS,
} from '../../utils/constants.js';
import ApplyOperationEncodings from '../state/ApplyOperationEncodings.js';
import Check from '../../utils/check.js';
import StateMessageOperations from '../../messages/stateMessages/StateMessageOperations.js';
import AdminResponseValidator from './validators/AdminResponseValidator.js';
const wakeup = new w();

class Network extends ReadyResource {
    #shouldStopPool = false;
    #swarm = null;
    #enableValidatorObserver;
    #enable_wallet;
    #disable_rate_limit;
    #channel;
    #dht_bootstrap = ['116.202.214.149:10001', '157.180.12.214:10001', 'node1.hyperdht.org:49737', 'node2.hyperdht.org:49737', 'node3.hyperdht.org:49737'];

    constructor(state, channel, options = {}) {
        super();
        this.#enableValidatorObserver = options.enableValidatorObserver !== undefined ? options.enableValidatorObserver : true;
        this.#enable_wallet = options.enable_wallet !== false;
        this.#disable_rate_limit = options.disable_rate_limit === true;
        this.#channel = channel;
        this.tx_pool = [];
        this.pool(state.append.bind(state));
        this.check = new Check();
        this.admin_stream = null;
        this.admin = null;
        this.validator_stream = null;
        this.validator = null;
        this.custom_stream = null;
        this.custom_node = null;

    }

    get swarm() {
        return this.#swarm;
    }

    get disable_rate_limit() {
        return this.#disable_rate_limit;
    }

    get channel() {
        return this.#channel;
    }

    async _open() { console.log('Network initialization...'); }

    async _close() {
        console.log('Network: closing gracefully...');
        this.stopPool();
        await sleep(100);

        if (this.#enableValidatorObserver) {
            this.stopValidatorObserver();
        }

        await sleep(5_000);

        if (this.#swarm !== null) {
            this.#swarm.destroy();
        }
    }

    async replicate(
        //TODO: we should delete an access to state. We should create a new methods in index.js which will allows access to needed properties and bind them here.
        state,
        writingKey,
        store,
        wallet,
        handleIncomingEvent,
    ) {
        if (!this.#swarm) {
            let keyPair;
            if (!this.#enable_wallet) {
                keyPair = await store.createKeyPair(TRAC_NAMESPACE);
            } else {
                keyPair = {
                    publicKey: b4a.from(wallet.publicKey, 'hex'),
                    secretKey: b4a.from(wallet.secretKey, 'hex')
                };
            }

            let clean = Date.now();
            let conns = {};

            this.#swarm = new Hyperswarm({
                keyPair,
                bootstrap: this.#dht_bootstrap,
                maxPeers: MAX_PEERS,
                maxParallel: MAX_PARALLEL,
                maxServerConnections: MAX_SERVER_CONNECTIONS,
                maxClientConnections: MAX_CLIENT_CONNECTIONS
            });

            console.log(`Channel: ${b4a.toString(this.#channel)}`);
            const network = this;

            this.#swarm.on('connection', async (connection) => {

                const mux = Protomux.from(connection)
                connection.userData = mux

                const message_channel = mux.createChannel({
                    protocol: b4a.toString(this.#channel, 'utf8'),
                    onopen() {
                    },
                    onclose() {
                    }
                })
                message_channel.open()
                const message = message_channel.addMessage({
                    encoding: c.json,
                    //TODO: change it into switch case
                    //TODO: In messages module we can create a new builders for cases like get_validator, get_admin, get_node, etc.
                    //TODO write validators in fastest validator + define protoschemas 
                    async onmessage(msg) {
                        try {
                            const channelString = b4a.toString(network.channel, 'utf8');
                            //TODO fix finding validators and specific node
                            if (msg === 'get_validator') {
                                await network.handleGetValidatorResponse(message, connection, channelString, wallet, writingKey);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg === 'get_admin') {
                                await network.handleGetAdminRequest(message, connection, channelString, wallet, writingKey, state);
                                network.#swarm.leavePeer(connection.remotePublicKey)

                            }
                            else if (msg === 'get_node') {
                                await network.handleCustomNodeRequest(message, connection, channelString, wallet, writingKey)
                                network.#swarm.leavePeer(connection.remotePublicKey)

                            }
                            // ---------- HANDLING RECEIVED MESSAGES ----------
                            else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'validatorResponse') {
                                await network.handleValidatorResponse(msg, connection, channelString, state, wallet);
                                network.#swarm.leavePeer(connection.remotePublicKey);
                            }
                            else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'adminResponse') {

                                await network.handleAdminResponse(msg, connection, channelString, state, wallet);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.response !== undefined && msg.response.op !== undefined && msg.response.op === 'nodeResponse') {

                                await network.handleCustomNodeResponse(msg, connection, channelString, state, wallet);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            // ---------- HANDLING OPERATIONS ----------
                            else if (msg.message !== undefined && msg.op === 'addWriter') {
                                const messageBuffer = normalizeBuffer(msg.message);
                                if (!messageBuffer) {
                                    network.#swarm.leavePeer(connection.remotePublicKey)
                                    throw new Error('Invalid message buffer for addWriter operation');
                                }
                                await handleIncomingEvent(messageBuffer);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.message !== undefined && msg.op === 'removeWriter') {
                                const messageBuffer = normalizeBuffer(msg.message);
                                if (!messageBuffer) {
                                    network.#swarm.leavePeer(connection.remotePublicKey)
                                    throw new Error('Invalid message buffer for removeWriter operation');
                                }
                                await handleIncomingEvent(messageBuffer);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.message !== undefined && msg.op === 'addAdmin') {
                                const messageBuffer = normalizeBuffer(msg.message);
                                if (!messageBuffer) {
                                    network.#swarm.leavePeer(connection.remotePublicKey)
                                    throw new Error('Invalid message buffer for addAdmin operation');
                                }
                                await handleIncomingEvent(messageBuffer);
                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                            else if (msg.message !== undefined && msg.op === 'whitelisted') {
                                const messageBuffer = normalizeBuffer(msg.message);
                                if (!messageBuffer) {
                                    network.#swarm.leavePeer(connection.remotePublicKey);
                                    throw new Error('Invalid message buffer for whitelisted operation');
                                }
                                await handleIncomingEvent(messageBuffer);
                                network.#swarm.leavePeer(connection.remotePublicKey);
                            } else {
                                if (state.isIndexer() || !state.isWritable()) return;

                                if (true !== network.disable_rate_limit) {
                                    const peer = b4a.toString(connection.remotePublicKey, 'hex');
                                    const _now = Date.now();

                                    if (_now - clean >= 120_000) {
                                        clean = _now;
                                        conns = {};
                                    }

                                    if (conns[peer] === undefined) {
                                        conns[peer] = { prev: _now, now: 0, tx_cnt: 0 }
                                    }

                                    conns[peer].now = _now;
                                    conns[peer].tx_cnt += 1;

                                    if (conns[peer].now - conns[peer].prev >= 60_000) {
                                        delete conns[peer];
                                    }

                                    if (conns[peer] !== undefined && conns[peer].now - conns[peer].prev >= 1000 && conns[peer].tx_cnt >= 50) {
                                        network.#swarm.leavePeer(connection.remotePublicKey);
                                        connection.end()
                                    }
                                }

                                if (network.tx_pool.length >= 1000) {
                                    console.log('pool full');
                                    return
                                }

                                if (b4a.byteLength(JSON.stringify(msg)) > 3072) return;

                                const parsedPreTx = msg;
                                const validator = new PreTransactionValidator(state, wallet, network);
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
                                        b4a.from(parsedPreTx.mbs,'hex')
                                    );
                                    network.tx_pool.push(postTx);
                                }

                                network.#swarm.leavePeer(connection.remotePublicKey)
                            }
                        } catch (e) {
                            console.log(e);
                        }
                        finally {
                            network.#swarm.leavePeer(connection.remotePublicKey);
                        }
                    }
                })

                connection.messenger = message;

                connection.on('close', () => {
                    if (this.validator_stream === connection) {
                        this.validator_stream = null;
                        this.validator = null;
                    }
                    if (this.admin_stream === connection) {
                        this.admin_stream = null;
                        this.admin = null;
                    }

                    if (this.custom_stream === connection) {
                        this.custom_stream = null;
                        this.custom_node = null;
                    }

                    message_channel.close()
                });

                // must be called AFTER the protomux init above
                const stream = store.replicate(connection);
                wakeup.addStream(stream);

                connection.on('error', (error) => { });

            });

            this.#swarm.join(this.#channel, { server: true, client: true });
            await this.#swarm.flush();
        }
    }

    async pool(appendState) {
        while (!this.#shouldStopPool) {
            if (this.tx_pool.length > 0) {
                const length = this.tx_pool.length;
                const batch = [];
                for (let i = 0; i < length; i++) {
                    if (i >= 10) break;
                    batch.push(this.tx_pool[i]);
                }
                await appendState(batch);
                this.tx_pool.splice(0, batch.length);
            }
            await sleep(5);
        }
    }

    stopPool() {
        this.#shouldStopPool = true;
    }

    // TODO: AFTER WHILE LOOP SIGNAL TO THE PROCESS THAT VALIDATOR OBSERVER STOPPED OPERATING. 
    // OS CALLS, ACCUMULATORS, MAYBE THIS IS POSSIBLE TO CHECK I/O QUEUE IF IT COINTAIN IT. FOR NOW WE ARE USING SLEEP.
    //TODO fix finding validators and specific node
    async validatorObserver(getWriterLength, getWriterIndex, getNodeEntry, addresss) {
        //TODO: we should throw an error instead of returning null
        try {
            console.log('Validator observer started');
            while (this.#enableValidatorObserver && this.#enable_wallet) {
                if (this.validator_stream !== null) {
                    await sleep(1000);
                    continue;
                }
                const lengthEntry = await getWriterLength();
                const length = lengthEntry ?? 0;

                const findValidator = async () => {
                    if (this.validator_stream !== null) return;
                    const rndIndex = Math.floor(Math.random() * length);
                    const validatorAddressBuffer = await getWriterIndex(rndIndex);

                    if (validatorAddressBuffer === null || b4a.byteLength(validatorAddressBuffer) !== ApplyOperationEncodings.TRAC_ADDRESS_SIZE) return;

                    const validatorAddress = ApplyOperationEncodings.bufferToAddress(validatorAddressBuffer);
                    if (validatorAddress === addresss) return;

                    const validatorPubKey = Wallet.decodeBech32m(validatorAddress).toString('hex');
                    const validatorEntry = await getNodeEntry(validatorAddress);

                    if (
                        this.validator_stream !== null ||
                        this.validator !== null ||
                        validatorEntry === null ||
                        !validatorEntry.isWriter ||
                        validatorEntry.isIndexer
                    ) return;

                    await this.tryConnection(validatorPubKey, 'validator');
                };

                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(findValidator());
                    await sleep(250);
                }
                await Promise.all(promises);
                await sleep(1000);
            }
        } catch (e) {
            console.log('Error in validatorObserver:', e);
        }
    }

    stopValidatorObserver() {
        this.#enableValidatorObserver = false;
    }

    async tryConnection(publicKey, type = null) {
        //TODO: we should throw an error instead of returning null
        if (null === this.#swarm) return null;

        if (this.validator_stream !== null && publicKey !== b4a.toString(this.validator_stream.remotePublicKey, 'hex')) {
            this.#swarm.leavePeer(this.validator_stream.remotePublicKey);
            this.validator_stream = null;
            this.validator = null;
        }
        // trying to join a peer from the global swarm

        if (false === this.#swarm.peers.has(publicKey)) {
            this.#swarm.joinPeer(b4a.from(publicKey, 'hex'));
            let cnt = 0;
            while (false === this.#swarm.peers.has(publicKey)) {
                if (cnt >= 1500) break;
                await sleep(10);
                cnt += 1;
            }
        }

        if (this.#swarm.peers.has(publicKey)) {
            let stream;
            const peerInfo = this.#swarm.peers.get(publicKey)
            stream = this.#swarm._allConnections.get(peerInfo.publicKey)

            if (stream !== undefined && stream.messenger !== undefined) {
                await this.#sendRequestByType(stream, type);
            }
        }
    }

    async #sendRequestByType(stream, type) {
        const waitFor = {
            validator: () => this.validator_stream,
            admin: () => this.admin_stream,
            node: () => this.custom_stream
        }[type];

        if (type === 'validator') {
            await stream.messenger.send('get_validator');
        } else if (type === 'admin') {
            await stream.messenger.send('get_admin');
        } else if (type === 'node') {
            await stream.messenger.send('get_node');
        } else {
            return;
        }
        await this.spinLock(() => !waitFor)
    };

    async spinLock(conditionFn, maxIterations = 1500, intervalMs = 10) {
        let counter = 0;
        while (conditionFn() && counter < maxIterations) {
            await sleep(intervalMs);
            counter++;
        }
    }

    async sendMessageToAdmin(adminEntry, message) {
        try {
            if (!adminEntry || !message) {
                return; //change to throw error because we are not in apply 
            }
            const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr).toString('hex');
            await this.tryConnection(adminPublicKey, 'admin');
            await this.spinLock(() => this.admin_stream === null);
            if (this.admin_stream !== null) {
                await this.admin_stream.messenger.send(message);
            }
        } catch (e) {
            console.log(e)
        }
    }

    async sendMessageToNode(nodePublicKey, message) {
        try {
            if (!nodePublicKey || !message) {
                return;
            }
            await this.tryConnection(nodePublicKey, 'node');

            await this.spinLock(() =>
                this.custom_stream === null ||
                !b4a.equals(this.custom_node, b4a.from(nodePublicKey, 'hex'))
            );
            if (
                this.custom_stream !== null &&
                this.custom_node !== null &&
                b4a.equals(this.custom_node, b4a.from(nodePublicKey, 'hex'))
            ) {
                await this.custom_stream.messenger.send(message);
            } else {

                //Todo: change it to throw error
                console.log(`Failed to send message to node: ${nodePublicKey}`);
            }

        } catch (e) {
            console.log(e)
        }
    }

    //TODO: In the future we will move it to another class to reduce size of this file. It should be moved to a new builder class.
    async handleGetValidatorResponse(message, connection, channelString, wallet, writingKey) {
        const nonce = Wallet.generateNonce().toString('hex');
        const payload = {
            op: 'validatorResponse',
            wk: writingKey.toString('hex'),
            address: wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };
        const hash = await wallet.createHash('sha256', JSON.stringify(payload));
        const sig = wallet.sign(hash);
        message.send({ response: payload, sig: sig.toString('hex') });
    }

    async handleValidatorResponse(msg, connection, channelString, state, wallet) {
        if (!msg.response || !msg.response.wk || !msg.response.address || !msg.response.nonce || !msg.response.channel || !msg.response.issuer || !msg.response.timestamp) {
            console.log("Validator response is missing required fields.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }
        const issuerPublicKey = b4a.from(msg.response.issuer, 'hex');
        if (!b4a.equals(issuerPublicKey, wallet.publicKey)) {
            console.log("Issuer public key does not match wallet public key.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }
        const timestamp = msg.response.timestamp;
        const now = Date.now();
        const fiveSeconds = 5000;

        if (now - timestamp > fiveSeconds) {
            console.log("Validator response is too old, ignoring.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }
        const validatorEntry = await state.getNodeEntry(msg.response.address);
        if (validatorEntry === null || !validatorEntry.isWriter || validatorEntry.isIndexer) {
            console.log("Validator entry is null or not a writer.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }

        const validatorWritingKey = b4a.from(msg.response.wk, 'hex');
        const validatorEntryWritingKey = b4a.from(validatorEntry.wk);
        if (validatorEntry.wk === null || !b4a.equals(validatorEntryWritingKey, validatorWritingKey)) {
            console.log("Validator writing key mismatch in response.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }
        const validatorAddressString = ApplyOperationEncodings.bufferToAddress(msg.response.address);
        const validatorPublicKey = Wallet.decodeBech32m(validatorAddressString);

        const hash = await wallet.createHash('sha256', JSON.stringify(msg.response));
        const signature = b4a.from(msg.sig, 'hex');
        const verified = wallet.verify(signature, hash, validatorPublicKey);

        if (verified && msg.response.channel === channelString) {
            console.log('Validator stream established', validatorAddressString);
            this.validator_stream = connection;
            this.validator = validatorPublicKey;
        }
        else {
            console.log("Validator response verification failed or channel mismatch.");
            this.#swarm.leavePeer(connection.remotePublicKey);
        }
    }
    //TODO: In the future we will move it to another class to reduce size of this file. 
    async handleGetAdminRequest(message, connection, channelString, wallet, writingKey, state) {
        const adminEntry = await state.getAdminEntry();
        if (adminEntry === null) {
            console.log("Admin entry is null. This is not possible to create admin stream.");
            return;
        }

        const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);

        if (!b4a.equals(wallet.publicKey, adminPublicKey)) {
            console.log("You are not an admin. This is not possible to create admin stream.");
            return;
        }

        const nonce = Wallet.generateNonce().toString('hex');
        const payload = {
            op: 'adminResponse',
            wk: writingKey.toString('hex'),
            address: wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };
        const hash = await wallet.createHash('sha256', JSON.stringify(payload));
        const sig = wallet.sign(hash);

        message.send({ response: payload, sig: sig.toString('hex') });
    }

    //TODO: In the future we will move it to another class to reduce size of this file. 
    async handleAdminResponse(message, connection, channelString, state, wallet) {
        const adminResponseValidator = new AdminResponseValidator(this,state, wallet);
        const isValid = await adminResponseValidator.validate(message, channelString);
        if (isValid) {
            const adminEntry = await state.getAdminEntry();
            const adminPublicKey = Wallet.decodeBech32m(adminEntry.tracAddr);
            console.log('Admin stream established:', adminEntry.tracAddr);
            this.admin_stream = connection;
            this.admin = adminPublicKey;
        } else {
            this.#swarm.leavePeer(connection.remotePublicKey);
        }
    }

    async handleCustomNodeRequest(message, connection, channelString, wallet) {
        const nonce = Wallet.generateNonce().toString('hex');
        const payload = {
            op: 'nodeResponse',
            address: wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };
        const hash = await wallet.createHash('sha256', JSON.stringify(payload));
        const sig = wallet.sign(hash);

        console.log('Custom node request sent:', connection.remotePublicKey.toString('hex'));
        message.send({ response: payload, sig: sig.toString('hex') });

    }

    async handleCustomNodeResponse(msg, connection, channelString, state, wallet) {
        if (!msg.response || !msg.response.address || !msg.response.nonce || !msg.response.channel || !msg.response.issuer || !msg.response.timestamp) {
            console.log("Custom node response is missing required fields.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }

        const issuerPublicKey = b4a.from(msg.response.issuer, 'hex');
        if (!b4a.equals(issuerPublicKey, wallet.publicKey)) {
            console.log("Issuer public key does not match wallet public key.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }
        const timestamp = msg.response.timestamp;
        const now = Date.now();
        const fiveSeconds = 5000;

        if (now - timestamp > fiveSeconds) {
            console.log("Custom node response is too old, ignoring.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }

        const customNodeAddressString = msg.response.address;
        const customNodePublicKey = Wallet.decodeBech32m(customNodeAddressString);
        const customNodeEntry = await state.getNodeEntry(customNodeAddressString);

        if (customNodeEntry === null) {
            console.log("Custom node entry is null - entry is not initialized.");
            this.#swarm.leavePeer(connection.remotePublicKey);
            return;
        }

        const hash = await wallet.createHash('sha256', JSON.stringify(msg.response));
        const signature = b4a.from(msg.sig, 'hex');
        const verified = wallet.verify(signature, hash, customNodePublicKey);

        if (verified && msg.response.channel === channelString) {
            console.log('Custom node stream established:', customNodeAddressString);
            this.custom_stream = connection;
            this.custom_node = customNodePublicKey;
        } else {
            console.log("Custom node response verification failed or channel mismatch.");
            this.#swarm.leavePeer(connection.remotePublicKey);
        }
    }

}
export default Network;