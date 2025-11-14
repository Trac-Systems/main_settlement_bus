import PeerWallet from 'trac-wallet';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import b4a from 'b4a';

class IdentityProvider {
    #strategy;
    constructor(strategy) {
        this.#strategy = strategy;
    }

    setStrategy(strategy) {
        this.#strategy = strategy;
    }

    get publicKey() {
        return this.#strategy.publicKey;
    }

    get address() {
        return this.#strategy.address;
    }

    sign(message) {
        return this.#strategy.sign(message);
    }

    verify(signature, message, publicKey) {
        return this.#strategy.verify(signature, message, publicKey);
    }

    static fromWallet(wallet) {
        return new IdentityProvider(new PeerWalletStrategy(wallet));
    }

    static fromNetworkKeyPair(keyPair, networkPrefix) {
        return new IdentityProvider(new NetworkWalletStrategy(keyPair, networkPrefix));
    }

}

class PeerWalletStrategy {
    #wallet;

    constructor(wallet) {
        this.#wallet = wallet;
    }

    get publicKey() {
        return this.#wallet.publicKey;
    }

    get address() {
        return this.#wallet.address;
    }

    sign(message) {
        return this.#wallet.sign(message);
    }

    verify(signature, message, publicKey) {
        return this.#wallet.verify(signature, message, publicKey);
    }
}

class NetworkWalletStrategy {
    #publicKey;
    #secretKey;
    #address;

    constructor(keyPair, networkPrefix = TRAC_NETWORK_MSB_MAINNET_PREFIX) {
        
        if (!keyPair?.publicKey || !keyPair?.secretKey) {
            throw new Error('NetworkIdentityProvider: keyPair with publicKey and secretKey is required');
        }
        this.#assertBuffer(keyPair.publicKey, 'publicKey');
        this.#assertBuffer(keyPair.secretKey, 'secretKey');

        const address = PeerWallet.encodeBech32mSafe(networkPrefix, keyPair.publicKey);
        if (!address) {
            throw new Error('NetworkIdentityProvider: failed to derive address from networking key pair');
        }

        this.#publicKey = keyPair.publicKey;
        this.#secretKey = keyPair.secretKey;
        this.#address = address;
    }

    get publicKey() {
        return this.#publicKey;
    }

    get address() {
        return this.#address;
    }

    sign(message) {
        return PeerWallet.sign(message, this.#secretKey);
    }

    verify(signature, message, publicKey = this.#publicKey) {
        return PeerWallet.verify(signature, message, publicKey);
    }

    #assertBuffer(value) {
        if (!b4a.isBuffer(value)) {
            throw new Error(`NetworkIdentityProvider: value must be a Buffer`);
        }
    }
}

export default IdentityProvider;
