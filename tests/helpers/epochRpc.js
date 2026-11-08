import EventEmitter from 'bare-events';
import b4a from 'b4a';
import { handleConfirmedLength, handleTxHashes, handleFetchBulkTxPayloads, handleCurrentEpoch } from '../../rpc/handlers.js';

// Keep the supplied State's reads intact. Only MSB startup, networking and resource ownership
// are replaced, so integration tests can use the State owned by their consensus network.
export async function createEpochReadApi(t, state, config = {}) {
    const { default: esmock } = await import('esmock');
    class ReadState {
        async ready() {}
        async close() {}
        async getAdminEntry() { return null; }
        isWritable() { return false; }
        isIndexer() { return false; }
        getSignedLength() { return state.getSignedLength(); }
        getUnsignedLength() { return state.getUnsignedLength(); }
        getSigned(hash) { return state.getSigned(hash); }
        getEpochProof(hash) { return state.getEpochProof(hash); }
        confirmedTransactionsBetween(start, end) { return state.confirmedTransactionsBetween(start, end); }
        getCurrentEpoch() { return state.getCurrentEpoch(); }
        getCurrentEpochUnsigned() { return state.getCurrentEpochUnsigned(); }
    }
    class NetworkMock {
        async ready() {}
        async close() {}
    }
    class CorestoreMock {
        async close() {}
    }
    const { MainSettlementBus } = await esmock('../../src/index.js', {
        corestore: CorestoreMock,
        '../../src/core/state/State.js': ReadState,
        '../../src/core/network/Network.js': NetworkMock,
        '../../src/utils/helpers.js': { sleep: async () => {} },
    });
    const msb = new MainSettlementBus({
        ...config,
        addressPrefix: config.addressPrefix,
        enableWallet: false,
        enableRoleRequester: false,
    });
    await msb.ready();
    t.teardown(() => msb.close());
    return msb;
}

export function callEpochRpc(msbInstance, url, body) {
    return new Promise((resolve, reject) => {
        const req = new EventEmitter();
        req.url = url;
        req.headers = { host: 'localhost' };
        const readHandlers = {
            '/v1/confirmed-length': handleConfirmedLength,
            '/v1/current-epoch': handleCurrentEpoch,
        };
        const handler = body !== undefined ? handleFetchBulkTxPayloads
            : readHandlers[url.split('?')[0]] ?? handleTxHashes;
        Promise.resolve(handler({
            msbInstance,
            req,
            respond: (status, response) => resolve({ status, body: JSON.parse(JSON.stringify(response)) }),
        })).catch(reject);
        if (body !== undefined) {
            req.emit('data', b4a.from(JSON.stringify(body)));
            req.emit('end');
        }
    });
}
