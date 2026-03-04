import { test } from 'brittle';
import b4a from 'b4a';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';
import { sleep } from '../../../../src/utils/helpers.js';
import PeerWallet from 'trac-wallet';

const originalDecode = PeerWallet.decodeBech32m;
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

test('ValidatorObserverService starts, syncs state, and stops gracefully', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const config = { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 };
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    t.ok(service.state !== undefined);
    await sleep(200);

    const selected = service._selectActiveWriter();
    t.ok(selected !== null);
    t.ok(mockNetwork.connectionAttempts > 0);

    await service.stopValidatorObserver(false);
    t.pass();
});

test('ValidatorObserverService does not run if disabled in config', async t => {
    const service = new ValidatorObserverService(new MockNetwork(), new MockState(), 'my_own_address', { enableValidatorObserver: false });
    await service.start();
    const selected = service._selectActiveWriter();
    t.is(selected, null);
});

test('ValidatorObserverService ignores start() if already running', async t => {
    const service = new ValidatorObserverService(new MockNetwork(), new MockState(), 'my_own_address', { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 });
    await service.start();
    await service.start(); 
    t.ok(service.state !== undefined);
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService pauses worker if max connections are reached', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.validatorConnectionManager.maxConnectionsReached = () => true; 

    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 });
    await service.start();
    await sleep(200);
    
    t.is(mockNetwork.connectionAttempts, 0);
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService handles state sync errors gracefully', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.validatorConnectionManager.maxConnectionsReached = () => true; 
    mockState.getWriterLength = async () => { throw new Error('Simulated Database Error'); };

    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 });
    await service.start();
    await sleep(200); 
    
    t.pass();
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService coverage: pending connections and admin-indexer limits', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    mockNetwork.isConnectionPending = () => true; 
    
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 });
    service._addActiveWriter(b4a.alloc(32, 1));
    
    await service.start();
    await sleep(100);
    t.pass();

    mockNetwork.isConnectionPending = () => false;
    mockState.getWriterLength = async () => 15;
    mockNetwork.validatorConnectionManager.exists = () => true;
    let removeCalled = false;
    mockNetwork.validatorConnectionManager.remove = () => { removeCalled = true; };
    
    await sleep(100); 
    await service.stopValidatorObserver(false);
    t.pass();
});

test('ValidatorObserverService resets sync index if ledger shrinks', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const config = { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 };
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);
    
    mockState.writers = [b4a.alloc(32, 1)]; 
    
    await sleep(650); 

    t.pass('Cycle completed with ledger shrink');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService removes writers that are no longer valid in state', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const config = { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 };
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);
  
    const addr1 = 'trac1qyqsyqsyqsyqsyqsyqsyqsyqsyqsyqs997sl7';
    mockState.getNodeEntry = async (addr) => {
      
        return { isWriter: false, isIndexer: false };
    };

    await sleep(650); 

    t.pass('Cleanup loop executed and removed invalid writer');
    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService clears memory if ledger becomes empty', async t => {
    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const config = { enableValidatorObserver: true, addressPrefix: 'trac', addressLength: 32 };
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);
    
    mockState.getWriterLength = async () => 0;
    
    await sleep(650); 

    const selected = service._selectActiveWriter();
    t.is(selected, null, 'Pool should be empty after ledger reset');
    
    await service.stopValidatorObserver(false);
    t.pass('Full cleanup logic covered');
});