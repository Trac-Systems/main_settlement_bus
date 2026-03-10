import { test } from 'brittle';
import b4a from 'b4a';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';
import { sleep } from '../../../../src/utils/helpers.js';
import { bufferToAddress } from '../../../../src/core/state/utils/address.js';
import PeerWallet from 'trac-wallet';

// --- Mocks & Helpers ---
const originalDecode = PeerWallet.decodeBech32m;
const restoreMock = () => {
    Object.defineProperty(PeerWallet, 'decodeBech32m', { value: originalDecode, configurable: true });
};
const setupMock = () => {
    Object.defineProperty(PeerWallet, 'decodeBech32m', {
        value: () => b4a.alloc(32, 1),
        configurable: true
    });
};

class MockState {
    constructor() {
        this.writers = [b4a.alloc(32, 1), b4a.alloc(32, 2)];
        this.base = {
            system: {
                list: async function* () {
                    for (const w of this.writers) {
                        yield { key: w, value: { isRemoved: false, isIndexer: false } };
                    }
                }.bind(this)
            }
        };
    }
    async getNodeEntry() { return { isWriter: true, isIndexer: false }; }
    async getAdminEntry() { return { address: 'admin' }; }
}

class MockNetwork {
    constructor() {
        this.connectionAttempts = 0;
        this.validatorConnectionManager = {
            maxConnectionsReached: () => false,
            exists: () => false
        };
    }
    isConnectionPending() { return false; }
    tryConnect() { this.connectionAttempts++; }
}

const config = { 
    enableValidatorObserver: true, 
    addressPrefix: 'trac', 
    pollInterval: 100,
    maxWritersForAdminIndexerConnection: 10
};

// --- Tests ---

test('ValidatorObserverService - Basic connection cycle', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self_addr', config);

    await service.start();
    await sleep(250); 

    t.ok(mockNetwork.connectionAttempts > 0, 'Should attempt connections');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Filters removed nodes natively', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    mockState.base.system.list = async function* () {
        yield { key: b4a.alloc(32, 2), value: { isRemoved: true, isIndexer: false } };
    };

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    await service.start();
    await sleep(200);

    t.is(mockNetwork.connectionAttempts, 0, 'Should ignore removed nodes');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Max connections limit reached', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.validatorConnectionManager.maxConnectionsReached = () => true;

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    await service.start();
    await sleep(200);

    t.is(mockNetwork.connectionAttempts, 0, 'Should not attempt connection if manager is full');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Handle Autobase iteration error', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    mockState.base.system.list = async function* () { throw new Error('Core Iteration Failure'); };

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    
    await service.start();
    await sleep(200);

    t.pass('Should catch and log error without crashing the worker');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Admin Rule: Connects in small network', async t => {
    setupMock(); t.teardown(restoreMock);
    const adminKey = b4a.alloc(32, 1);
    const adminAddr = bufferToAddress(adminKey, config.addressPrefix);
    
    const mockState = new MockState();
    mockState.writers = [adminKey]; 
    mockState.getAdminEntry = async () => ({ address: adminAddr });

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'other', config);
    
    await service.start();
    await sleep(150);
    await service.stopValidatorObserver(true);
    
    t.ok(mockNetwork.connectionAttempts > 0, 'Should connect to admin when writers < 10');
});

test('ValidatorObserverService - Admin Rule: Skips in large network', async t => {
    setupMock(); t.teardown(restoreMock);
    const adminKey = b4a.alloc(32, 1);
    const adminAddr = bufferToAddress(adminKey, config.addressPrefix);
    
    const mockState = new MockState();
    mockState.getAdminEntry = async () => ({ address: adminAddr });
    
    mockState.base.system.list = async function* () {
        for (let i = 0; i < 11; i++) {
            yield { 
                key: i === 0 ? adminKey : b4a.alloc(32, i + 10), 
                value: { isRemoved: false, isIndexer: false } 
            };
        }
    };

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'other', { ...config, pollInterval: 150 });
    
    await service.start();
    await sleep(200);
    await service.stopValidatorObserver(true);
    
    t.is(mockNetwork.connectionAttempts, 0, 'Should skip admin connection when writers >= 10');
});

test('ValidatorObserverService - Skips connection if already exists or pending', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.validatorConnectionManager.exists = () => true;
    
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    await service.start();
    await sleep(200);

    t.is(mockNetwork.connectionAttempts, 0, 'Should skip if connection manager already has the peer');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Skips if node is no longer a writer in DB', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    mockState.getNodeEntry = async () => ({ isWriter: false });

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    
    await service.start();
    await sleep(200);

    t.is(mockNetwork.connectionAttempts, 0, 'Should skip if final DB check fails');
    await service.stopValidatorObserver(true);
});

test('ValidatorObserverService - Stop during iteration', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    
    mockState.base.system.list = async function* () {
        while(true) {
            yield { key: b4a.alloc(32), value: { isRemoved: false, isIndexer: false } };
            await sleep(10);
        }
    };

    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);
    
    service.start();
    await sleep(50);
    await service.stopValidatorObserver(true);
    
    t.pass('Should break iteration loop gracefully when service stops');
});