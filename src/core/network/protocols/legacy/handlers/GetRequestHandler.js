import { NETWORK_MESSAGE_TYPES } from '../../../../../utils/constants.js';
import PeerWallet from 'trac-wallet';
import b4a from 'b4a';

class GetRequestHandler {
    #wallet;
    #state;

    constructor(wallet, state) {
        this.#wallet = wallet;
        this.#state = state;
    }

    get state() {
        return this.#state;
    }

    async handle(message, messageProtomux, connection, channelString) {
        switch (message) {
            case NETWORK_MESSAGE_TYPES.GET.VALIDATOR:
                await this.handleGetValidatorResponse(messageProtomux, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.GET.ADMIN:
                await this.handleGetAdminRequest(messageProtomux, connection, channelString);
                break;
            case NETWORK_MESSAGE_TYPES.GET.NODE:
                await this.handleCustomNodeRequest(messageProtomux, connection, channelString);
                break;
            default:
                throw new Error(`Unhandled GET type: ${message}`);
        }
    }

    async handleGetValidatorResponse(messageProtomux, connection, channelString) {
        const nonce = PeerWallet.generateNonce().toString('hex');
        const payload = {
            op: 'validatorResponse',
            wk: this.state.writingKey.toString('hex'),
            address: this.#wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };


        const hashInput = b4a.from(JSON.stringify(payload), 'utf8');
        const hash = await PeerWallet.blake3(hashInput);
        const sig = this.#wallet.sign(hash);

        const responseMessage = {
            ...payload,
            sig: sig.toString('hex'),
        };
        messageProtomux.send(responseMessage);
    }

    async handleGetAdminRequest(messageProtomux, connection, channelString) {
        const adminEntry = await this.state.getAdminEntry();
        if (adminEntry === null) {
            throw new Error("Admin entry is null. This is not possible to create admin stream.");
        }

        const adminPublicKey = PeerWallet.decodeBech32m(adminEntry.address);

        if (!b4a.equals(this.#wallet.publicKey, adminPublicKey)) {
            throw new Error("You are not an admin. This is not possible to create admin stream.");
        }

        const nonce = PeerWallet.generateNonce().toString('hex');
        const payload = {
            op: 'adminResponse',
            wk: this.state.writingKey.toString('hex'),
            address: this.#wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };
        const hash = await PeerWallet.blake3(JSON.stringify(payload));
        const sig = this.#wallet.sign(hash);

        const responseMessage = {
            ...payload,
            sig: sig.toString('hex'),
        };
        messageProtomux.send(responseMessage);
    }

    async handleCustomNodeRequest(messageProtomux, connection, channelString) {
        const nonce = PeerWallet.generateNonce().toString('hex');
        const payload = {
            op: 'nodeResponse',
            address: this.#wallet.address,
            nonce: nonce,
            channel: channelString,
            issuer: connection.remotePublicKey.toString('hex'),
            timestamp: Date.now(),
        };
        
        const hash = await PeerWallet.blake3(JSON.stringify(payload));
        const sig = this.#wallet.sign(hash);

        const responseMessage = {
            ...payload,
            sig: sig.toString('hex'),
        };
        messageProtomux.send(responseMessage);

    }
}

export default GetRequestHandler;