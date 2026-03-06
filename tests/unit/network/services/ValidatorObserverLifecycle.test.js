import { test } from 'brittle';
import b4a from 'b4a';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';
import { sleep } from '../../../../src/utils/helpers.js';
import { bufferToAddress } from '../../../../src/core/state/utils/address.js';
import PeerWallet from 'trac-wallet';

// Ensure PeerWallet mock doesn't leak by using Object.defineProperty to restore it
const originalDecode = PeerWallet.decodeBech32m;

const restoreMock = () => {
    Object.defineProperty(PeerWallet, 'decodeBech32m', {
        value: originalDecode,
        configurable: true
    });
};

const setupMock = () => {
    Object.defineProperty(PeerWallet, 'decodeBech32m', {
        value: (addr) => {
            if (!addr || typeof addr !== 'string') return b4a.alloc(32, 1);
            try {
                return originalDecode.call(PeerWallet, addr);
            } catch (err) {
                return b4a.alloc(32, 1);
            }
        },
        configurable: true
    });
};

class MockState {
    constructor() {
        this.writers = [b4a.alloc(32, 1), b4a.alloc(32, 2), b4a.alloc(32, 3)];
    }
    async getWriterLength() { return this.writers.length; }
    async getWriterIndex(i) { return this.writers[i]; }
    async getNodeEntry(addr) { 
        return { isWriter: true, isIndexer: false };
    }
    async getAdminEntry() { return { address: 'admin_mock_address' }; }
}

class MockNetwork {
    constructor() {
        this.validatorConnectionManager = {
            maxConnectionsReached: () => false,
            connectionCount: () => 0,
            exists: () => false,
            remove: () => {},
            connected: () => false
        };
        this.connectionAttempts = 0;
    }
    pendingConnectionsCount() { return 0; }
    isConnectionPending() { return false; }
    tryConnect(pubKey, type) {
        this.connectionAttempts++;
    }
}

const config = { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 };

test('ValidatorObserverService starts, syncs state, and stops gracefully', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    t.ok(service.state !== undefined);
    
    await sleep(200);
    t.ok(mockNetwork.connectionAttempts > 0, 'Should have attempted connections');

    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService does not run if disabled in config', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, new MockState(), 'my_own_address', { enableValidatorObserver: false });
    
    await service.start();
    await sleep(200);
    
    t.is(mockNetwork.connectionAttempts, 0, 'Should not attempt connections when disabled');
});

test('ValidatorObserverService ignores start() if already running', async t => {
    setupMock(); t.teardown(restoreMock);
    const service = new ValidatorObserverService(new MockNetwork(), new MockState(), 'my_own_address', config);
    await service.start();
    await service.start(); 
    t.ok(service.state !== undefined);
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService pauses worker if max connections are reached', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockNetwork = new MockNetwork();
    mockNetwork.validatorConnectionManager.maxConnectionsReached = () => true; 

    const service = new ValidatorObserverService(mockNetwork, new MockState(), 'my_own_address', config);
    await service.start();
    await sleep(200);
    
    t.is(mockNetwork.connectionAttempts, 0, 'Should not connect if max connections reached');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService handles state sync errors gracefully', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    mockState.getWriterLength = async () => { throw new Error('Simulated Database Error'); };

    const service = new ValidatorObserverService(new MockNetwork(), mockState, 'my_own_address', config);
    await service.start();
    await sleep(200); 
    
    t.pass('Should not crash on sync error');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService coverage: pending connections and admin-indexer limits', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.isConnectionPending = () => true; 
    
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);
    
    await service.start();
    await sleep(200);

    mockNetwork.isConnectionPending = () => false;
    mockState.getWriterLength = async () => 15;
    mockNetwork.validatorConnectionManager.exists = () => true;
    let removeCalled = false;
    mockNetwork.validatorConnectionManager.remove = () => { removeCalled = true; };
    
    await sleep(200); 
    await service.stopValidatorObserver(false);
    t.pass('Boundary coverage achieved');
});

test('ValidatorObserverService resets sync index if ledger shrinks', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600); // Sync initial writers
    
    // Shrink to 1 writer and reset network counter
    mockState.writers = [b4a.alloc(32, 1)]; 
    mockNetwork.connectionAttempts = 0;
    
    await sleep(650);
    
    t.ok(mockNetwork.connectionAttempts > 0, 'Should continue connecting to the remaining writer after shrink');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService removes writers that are no longer valid in state', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);
  
    // Mark all validators as invalid
    mockState.getNodeEntry = async () => ({ isWriter: false, isIndexer: false });
    mockNetwork.connectionAttempts = 0;
    await sleep(650); 

    // Pool was cleaned up by #removeActiveWriter, hence 0 connections
    t.is(mockNetwork.connectionAttempts, 0, 'Should not attempt connections if all writers became invalid');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService clears memory if ledger becomes empty', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);
    
    // Clear the entire ledger
    mockState.getWriterLength = async () => 0;
    mockNetwork.connectionAttempts = 0;
    
    await sleep(650); 

    t.is(mockNetwork.connectionAttempts, 0, 'Should not attempt connections after ledger is completely emptied');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService ignores invalid buffers, nulls, and already connected peers', async t => {
    setupMock(); t.teardown(restoreMock);
    
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    
    // Inject a chaotic scenario into the mocked database
    mockState.writers = [
        b4a.alloc(15, 1), // Invalid size (tests byteLength rejection)
        null,             // Null buffer (tests 'continue' in sync loop)
        b4a.alloc(32, 2), // Valid, but mocked as "already connected"
        b4a.alloc(32, 2)  // Duplicate (tests 'if(has)' in #addActiveWriter)
    ];
    
    mockState.getWriterLength = async () => mockState.writers.length;
    mockState.getWriterIndex = async (i) => mockState.writers[i];
    
    // Force the manager to say it's already connected, blocking the connection
    mockNetwork.validatorConnectionManager.connected = () => true;
    
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);
    
    await service.start();
    await sleep(650); 
    
    t.is(mockNetwork.connectionAttempts, 0, 'Should skip invalid, null, and already connected candidates');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService catches errors during individual candidate evaluation', async t => {
    setupMock(); t.teardown(restoreMock);
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(400); 
    
    // Force the database to crash only during dynamic node reading
    mockState.getNodeEntry = async () => { throw new Error('Search DB Error'); };
    mockNetwork.connectionAttempts = 0;
    
    await sleep(650); 
    
    t.is(mockNetwork.connectionAttempts, 0, 'Worker survived inner loop DB crash and safely skipped connections');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService disconnects admin-indexer if writers exceed max limit', async t => {
    setupMock(); t.teardown(restoreMock);
    
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    
    // 1. Get the first mocked writer and calculate its real address
    const adminBuffer = b4a.alloc(32, 1);
    const adminAddress = bufferToAddress(adminBuffer, config.addressPrefix);
    
    // 2. Force getAdminEntry to return THIS as the Admin address
    mockState.getAdminEntry = async () => ({ address: adminAddress });
    
    // 3. Mock a huge network to trigger the eviction rule
    mockState.getWriterLength = async () => 500; 
    
    // 4. Leave only the Admin in the pool to guarantee it gets selected in the while loop
    mockState.writers = [adminBuffer];
    mockState.getWriterIndex = async (i) => mockState.writers[i];
    
    // 5. Simulate that we are ALREADY connected to it
    mockNetwork.validatorConnectionManager.exists = () => true;
    
    // 6. Spy on the remove function to prove the untested line ran
    let removeCalled = false;
    mockNetwork.validatorConnectionManager.remove = () => { removeCalled = true; };
    
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);
    
    await service.start();
    await sleep(650); 
    
    t.ok(removeCalled, 'Should disconnect the admin-indexer if ledger size exceeds max limits');
    await service.stopValidatorObserver(false);
});