import tracCryptoApi from 'trac-crypto-api';

import {createHtlcLockSigningMessage} from '../../src/utils/htlcLock.js';

export async function createHtlcLockTransactionHash(networkId, locker, operation) {
    return tracCryptoApi.hash.blake3(createHtlcLockSigningMessage(networkId, locker, operation));
}
