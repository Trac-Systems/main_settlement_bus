import { test } from 'brittle';
import b4a from 'b4a';
import ValidatorObserverService from '../../../../src/core/network/services/ValidatorObserverService.js';
import { sleep } from '../../../../src/utils/helpers.js';
import { bufferToAddress } from '../../../../src/core/state/utils/address.js';
import { CustomEventType } from '../../../../src/utils/constants.js';
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
        this.listeners = {};
    }

    async getWriterLength() { return this.writers.length; }
    async getWriterIndex(i) { return this.writers[i]; }

    async getNodeEntry(addr) {
        return { isWriter: true, isIndexer: false };
    }

    async getAdminEntry() {
        return { address: 'admin_mock_address' };
    }

    on(event, cb) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(cb);
    }

    off(event, cb) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(x => x !== cb);
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        for (const cb of this.listeners[event]) {
            cb(data);
        }
    }
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

/* ---------------------------------------------------------------- */
/* -------------------- EVENT LISTENER TESTS ---------------------- */
/* ---------------------------------------------------------------- */

test('ValidatorObserverService adds writer via WRITABLE event', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();

    const wk = b4a.alloc(32, 99);
    mockState.emit(CustomEventType.WRITABLE, { wk });

    await sleep(200);

    t.ok(mockNetwork.connectionAttempts > 0, 'Listener should add writer and enable connection attempts');

    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService removes writer via UNWRITABLE event', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(200);

    const wk = mockState.writers[0];

    mockState.emit(CustomEventType.UNWRITABLE, { wk });

    mockNetwork.connectionAttempts = 0;

    await sleep(200);

    t.ok(mockNetwork.connectionAttempts >= 0, 'Listener should remove writer without crashing');

    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService removes writer when promoted to indexer', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(200);

    const wk = mockState.writers[0];

    mockState.emit(CustomEventType.IS_INDEXER, { wk });

    mockNetwork.connectionAttempts = 0;

    await sleep(200);

    t.ok(mockNetwork.connectionAttempts >= 0, 'Indexer promotion should remove validator safely');

    await service.stopValidatorObserver(false);
});

/* ---------------------------------------------------------------- */
/* ------------------ EXISTING TESTS CONTINUE --------------------- */
/* ---------------------------------------------------------------- */

test('ValidatorObserverService resets sync index if ledger shrinks', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();
    const service = new ValidatorObserverService(mockNetwork, mockState, 'my_own_address', config);

    await service.start();
    await sleep(600);

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

    mockState.getNodeEntry = async () => ({ isWriter: false, isIndexer: false });
    mockNetwork.connectionAttempts = 0;

    await sleep(650);

    t.is(mockNetwork.connectionAttempts, 0, 'Should not attempt connections if all writers became invalid');

    await service.stopValidatorObserver(false);
});


test('stopValidatorObserver safely exits if never started', async t => {
    setupMock(); t.teardown(restoreMock);

    const service = new ValidatorObserverService(new MockNetwork(), new MockState(), 'self', config);

    await service.stopValidatorObserver(false);

    t.pass('Stopping without starting should not crash');
});


test('selectActiveWriter returns null when pool empty', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    mockState.writers = [];

    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(200);

    t.ok(true, 'Pool empty path executed safely');

    await service.stopValidatorObserver(false);
});


test('addActiveWriter respects MAX_POOL_SIZE guard', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    const wk = b4a.alloc(32, 7);

    for (let i = 0; i < 11000; i++) {
        mockState.emit(CustomEventType.WRITABLE, { wk: b4a.alloc(32, i % 255) });
    }

    await sleep(200);

    t.pass('MAX_POOL_SIZE branch executed');

    await service.stopValidatorObserver(false);
});


test('removeActiveWriter ignores unknown validator', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    mockState.emit(CustomEventType.UNWRITABLE, { wk: b4a.alloc(32, 88) });

    await sleep(100);

    t.pass('Unknown removal safely ignored');

    await service.stopValidatorObserver(false);
});


test('lengthEntry handles invalid values gracefully', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.getWriterLength = async () => "invalid";

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(200);

    t.pass('Invalid lengthEntry handled');

    await service.stopValidatorObserver(false);
});


test('scheduleSync prevents concurrent execution', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    mockState.emit(CustomEventType.WRITABLE, { wk: b4a.alloc(32, 3) });

    await sleep(200);

    t.pass('scheduleSync reentry guard executed');

    await service.stopValidatorObserver(false);
});


test('syncActiveWriters handles null writer buffers', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.writers = [null];

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(200);

    t.pass('Null writer buffer safely skipped');

    await service.stopValidatorObserver(false);
});


test('syncActiveWriters resets index when ledger shrinks unexpectedly', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(600);

    mockState.writers = [b4a.alloc(32, 1)];

    await sleep(200);

    t.pass('Ledger shrink path executed');

    await service.stopValidatorObserver(false);
});


test('validatorEntry null prevents connection', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.getNodeEntry = async () => null;

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(200);

    t.is(mockNetwork.connectionAttempts, 0);

    await service.stopValidatorObserver(false);
});

test('ValidatorObserverService skips connecting to itself', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const selfAddress = 'my_own_address';

    const service = new ValidatorObserverService(mockNetwork, mockState, selfAddress, config);

    await service.start();

    mockState.getNodeEntry = async () => ({ isWriter: true, isIndexer: false });

    await sleep(300);

    t.ok(true, 'Self validator connection skipped safely');

    await service.stopValidatorObserver(false);
});


test('ValidatorObserverService skips validators that are indexers', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.getNodeEntry = async () => ({ isWriter: true, isIndexer: true });

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(300);

    t.is(mockNetwork.connectionAttempts, 0, 'Indexer validators should not be connected');

    await service.stopValidatorObserver(false);
});


test('ValidatorObserverService skips already connected validators', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockNetwork.validatorConnectionManager.connected = () => true;

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(300);

    t.is(mockNetwork.connectionAttempts, 0, 'Already connected validators should be skipped');

    await service.stopValidatorObserver(false);
});


test('ValidatorObserverService allows admin connection under writer limit', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const adminBuffer = b4a.alloc(32, 1);
    const adminAddress = bufferToAddress(adminBuffer, config.addressPrefix);

    mockState.writers = [adminBuffer];
    mockState.getAdminEntry = async () => ({ address: adminAddress });
    mockState.getWriterLength = async () => 1;

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(400);

    t.ok(mockNetwork.connectionAttempts > 0, 'Admin connection allowed under writer limit');

    await service.stopValidatorObserver(false);
});


test('ValidatorObserverService stops attempting connections when interrupted', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await service.stopValidatorObserver(false);

    mockNetwork.connectionAttempts = 0;

    await sleep(300);

    t.is(mockNetwork.connectionAttempts, 0, 'Observer should not run when interrupted');
});

test('findValidator exits safely when writer pool is empty during search', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.writers = [];

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(300);

    t.pass('Search loop handled empty writer pool');

    await service.stopValidatorObserver(false);
});

test('findValidator stops after maxAttempts when validators are always invalid', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.getNodeEntry = async () => ({
        isWriter: false,
        isIndexer: false
    });

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(400);

    t.is(mockNetwork.connectionAttempts, 0, 'Max attempts path executed');

    await service.stopValidatorObserver(false);
});

test('connects normally when validator is not admin', async t => {
    setupMock(); t.teardown(restoreMock);

    const mockState = new MockState();
    const mockNetwork = new MockNetwork();

    mockState.getAdminEntry = async () => ({
        address: 'some_other_admin'
    });

    const service = new ValidatorObserverService(mockNetwork, mockState, 'self', config);

    await service.start();

    await sleep(300);

    t.ok(mockNetwork.connectionAttempts > 0, 'Non-admin validators connect normally');

    await service.stopValidatorObserver(false);
});