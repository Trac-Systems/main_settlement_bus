import { test } from 'brittle';
import sinon from 'sinon';
import b4a from 'b4a';
import EventEmitter from 'bare-events';
import tracCryptoApi from 'trac-crypto-api';
import { WalletProvider } from 'trac-wallet';
import { CONNECTION_STATUS, CustomEventType, ConsensusResultCode } from '../../../src/utils/constants.js';
import { V1ConsensusProtocolError, V1ConsensusPublicKeyMismatchError } from '../../../src/core/consensus/v1/V1ConsensusProtocolError.js';
import ConsensusEpochProofProposalOperationHandler from '../../../src/core/consensus/v1/handlers/ConsesusEpochProofProposalOperationHandler.js';
import { encodeProofProposalApproval } from '../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { createMessage, uint16ToBuffer, uint32ToBuffer } from '../../../src/utils/buffer.js';
import { bufferToAddress } from '../../../src/core/state/utils/address.js';
import consensusFixtures from '../../fixtures/consensusV1Operation.fixtures.js';
import { config as consensusConfig } from '../../helpers/config.js';
import { testKeyPair2 } from '../../fixtures/apply.fixtures.js';

const isBareRuntime = typeof globalThis.Bare !== 'undefined';

function normalizePublicKey(publicKey) {
    if (typeof publicKey === 'string') return publicKey;
    if (b4a.isBuffer(publicKey)) return b4a.toString(publicKey, 'hex');
    return null;
}

function createPeerInfo(publicKey) {
    const peerInfo = { publicKey, banned: false };
    peerInfo.ban = sinon.stub().callsFake(value => { peerInfo.banned = !!value; });
    return peerInfo;
}

async function signedConsensusResponse(wallet, result, approval) {
    const resultCode = uint32ToBuffer(result);
    const data = approval ? createMessage(resultCode, encodeProofProposalApproval(approval)) : resultCode;
    const response = { result, response_sig: wallet.sign(await tracCryptoApi.hash.blake3(data)) };
    if (approval) response.approval = approval;
    return { ...consensusFixtures.proofProposalResponseHeader, proof_proposal_response: response };
}

function createMockConnection(publicKeyHex, { withProtocolSession = true, withConsensusSession = false } = {}) {
    const remotePublicKey = b4a.from(publicKeyHex, 'hex');
    return {
        remotePublicKey,
        protocolSessions: {
            validator: withProtocolSession ? {
                isProbed: () => true,
                probe: sinon.stub().resolves(),
                isHealthCheckSupported: () => false,
                close: sinon.stub(),
            } : null,
            indexers: withConsensusSession ? { close: sinon.stub() } : null,
        },
        on: sinon.stub(),
        destroy: sinon.stub(),
    };
}

async function loadNetwork({ isIndexer = false, currentEpoch = null, indexerCount = 0, walletAddress = 'trac_test' } = {}) {
    const { default: esmock } = await import('esmock');
    let swarmInstance = null;
    let validatorConnectionManagerInstance = null;
    let indexerConnectionManagerInstance = null;
    let epochCoordinatorServiceInstance = null;
    let validatorPendingRequestServiceInstance = null;
    let indexerPendingRequestServiceInstance = null;

    class HyperswarmMock extends EventEmitter {
        constructor(options) {
            super();
            swarmInstance = this;
            this.firewall = options.firewall;
            this.peers = new Map();
            this.connections = new Set();
            this._allConnections = new Map();
            this.joinPeer = sinon.stub().callsFake((target) => {
                const publicKeyHex = b4a.toString(target, 'hex');
                if (!this.peers.has(publicKeyHex)) this.peers.set(publicKeyHex, createPeerInfo(target));
            });
            this.leavePeer = sinon.stub();
            this.join = sinon.stub();
            this.flush = sinon.stub();
            this.destroy = sinon.stub();
        }
    }

    class ValidatorConnectionManagerMock {
        constructor() {
            validatorConnectionManagerInstance = this;
            this.validators = new Set();
            this.removed = [];
        }

        exists(publicKey) {
            return this.validators.has(normalizePublicKey(publicKey));
        }

        remove(publicKey) {
            const publicKeyHex = normalizePublicKey(publicKey);
            this.removed.push({ publicKey: publicKeyHex });
            this.validators.delete(publicKeyHex);
        }

        add(publicKey) {
            this.validators.add(normalizePublicKey(publicKey));
            return true;
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        connectedPeers() {
            return Array.from(this.validators);
        }

        connectionCount() {
            return this.validators.size;
        }

        maxConnectionsReached() {
            return false;
        }

        subscribeToHealthChecks() {}

        ready() {
            return true
        }

        async close() {}
    }

    class TransactionPoolServiceMock {
        start() {}
        async stop() {}
    }

    class ValidatorObserverServiceMock {
        start() {}
        async stop() {}
    }

    class MessageOrchestratorMock {
        setWallet() {}
    }

    class PendingRequestServiceMock {
        constructor() {
            validatorPendingRequestServiceInstance = this;
            this.rejectPendingRequestsForPeer = sinon.stub();
        }
        isProbePending() { return false; }
        close() {}
    }

    class TransactionCommitServiceMock {
        close() {}
    }

    class ValidatorHealthCheckServiceMock extends EventEmitter {
        async ready() {}
        start() {}
        stop() {}
        has() { return false; }
        close() {}
    }

    class EpochCoordinatorServiceMock {
        constructor() {
            epochCoordinatorServiceInstance = this;
            this.start = sinon.stub();
            this.stop = sinon.stub();
        }

        async ready() {}
        async close() {}
    }

    class IndexerConnectionManagerMock {
        constructor() {
            indexerConnectionManagerInstance = this;
            this.indexers = new Set();
            this.add = sinon.stub().callsFake(publicKey => {
                this.indexers.add(normalizePublicKey(publicKey));
            });
            this.remove = sinon.stub();
            this.setMax = sinon.stub();
        }

        exists(publicKey) {
            return this.indexers.has(normalizePublicKey(publicKey));
        }

        connected(publicKey) {
            return this.exists(publicKey);
        }

        async ready() {}
        async close() {}
    }

    class LoggerMock {
        info() {}
        debug() {}
        error() {}
    }

    class NetworkMessagesMock {
        createProtocolSession(connection) {
            return connection.protocolSessions?.validator ?? {
                isProbed: () => true,
                probe: sinon.stub().resolves(),
                isHealthCheckSupported: () => false,
                close: sinon.stub(),
            };
        }

        attachChannel(connection) {
            connection.protocolSessions ??= {};
            connection.protocolSessions.validator = this.createProtocolSession(connection);
        }

        prepareConnection(connection) {
            this.attachChannel(connection);
        }
    }

    class ConsensusMessagesMock {
        constructor(_state, _wallet, _config, pendingRequests) {
            indexerPendingRequestServiceInstance = pendingRequests;
        }
        async setupProtomuxMessages() {}
        prepareConnection() {}
        attachChannel() {}
    }

    class WakeupMock {
        addStream() {}
    }

    class TransactionRateLimiterServiceMock {}

    class CorestoreMock {
        constructor() {
            this.replicate = sinon.stub();
            this.createKeyPair = sinon.stub();
        }
    }

    const NetworkModule = await esmock('../../../src/core/network/Network.js', {
        hyperswarm: HyperswarmMock,
        '../../../src/core/network/services/TransactionPoolService.js': { default: TransactionPoolServiceMock },
        '../../../src/core/network/services/ValidatorObserverService.js': { default: ValidatorObserverServiceMock },
        '../../../src/core/network/services/ValidatorConnectionManager.js': { default: ValidatorConnectionManagerMock },
        '../../../src/core/network/services/MessageOrchestrator.js': { default: MessageOrchestratorMock },
        '../../../src/core/network/services/TransactionRateLimiterService.js': { default: TransactionRateLimiterServiceMock },
        '../../../src/core/network/services/ValidatorPendingRequestService.js': { default: PendingRequestServiceMock },
        '../../../src/core/network/services/TransactionCommitService.js': { default: TransactionCommitServiceMock },
        '../../../src/core/network/services/ValidatorHealthCheckService.js': { default: ValidatorHealthCheckServiceMock },
        '../../../src/core/consensus/services/EpochCoordinatorService.js': { default: EpochCoordinatorServiceMock },
        '../../../src/core/consensus/services/IndexerConnectionManager.js': { default: IndexerConnectionManagerMock },
        '../../../src/core/network/protocols/NetworkMessages.js': { default: NetworkMessagesMock },
        '../../../src/core/consensus/protocols/ConsensusMessages.js': { default: ConsensusMessagesMock },
        'protomux-wakeup': { default: WakeupMock },
        '../../../src/utils/logger.js': { Logger: LoggerMock },
    });

    const Network = NetworkModule.default;
    const config = {
        enableWallet: true,
        addressPrefix: 'trac',
        connectTimeoutMs: 1_000,
        maxPendingConnections: 10,
        maxPendingRequestsInPendingRequestsService: 10,
        indexerPendingRequestTimeout: 5_000,
        maxValidators: 5,
        maxPeers: 5,
        maxParallel: 1,
        maxServerConnections: 5,
        maxClientConnections: 5,
        dhtBootstrap: [],
        channel: b4a.alloc(32, 1),
    };

    const wallet = {
        publicKey: b4a.alloc(32, 2),
        secretKey: b4a.alloc(64, 3),
        address: walletAddress,
    };

    const store = new CorestoreMock();
    const state = new EventEmitter();
    state.isAdmin = async () => false;
    state.isIndexer = () => isIndexer;
    state.indexerCount = async () => indexerCount;
    state.getCurrentEpoch = async () => currentEpoch;
    state.isAdminAddress = async () => false;
    const network = new Network(state, store, config, wallet);
    await network.ready()

    return {
        network,
        store,
        swarmInstance,
        validatorConnectionManagerInstance,
        indexerConnectionManagerInstance,
        epochCoordinatorServiceInstance,
        validatorPendingRequestServiceInstance,
        indexerPendingRequestServiceInstance,
        state
    };
}

if (isBareRuntime) {
    test('Network#disconnectValidatorPeer coverage is Node-only', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('Network does not start the epoch coordinator before genesis initialization', async t => {
        const { network, epochCoordinatorServiceInstance } = await loadNetwork({
            isIndexer: true,
            currentEpoch: null
        });

        t.absent(epochCoordinatorServiceInstance.start.called);
        await network.close();
    });

    test('Network starts the epoch coordinator for an initialized indexer', async t => {
        const { network, epochCoordinatorServiceInstance } = await loadNetwork({
            isIndexer: true,
            currentEpoch: 0n
        });

        t.is(epochCoordinatorServiceInstance.start.callCount, 1);
        await network.close();
    });

    test('Network starts the epoch coordinator when the genesis-epoch event is emitted on an indexer', async t => {
        const { network, epochCoordinatorServiceInstance, state } = await loadNetwork({
            isIndexer: true,
            currentEpoch: null
        });

        state.emit(CustomEventType.GENESIS_EPOCH_CREATED, { epoch: 0n });

        t.is(epochCoordinatorServiceInstance.start.callCount, 1);
        await network.close();
    });

    test('Network ignores genesis-epoch events when this node is not an indexer', async t => {
        const { network, epochCoordinatorServiceInstance, state } = await loadNetwork({
            isIndexer: false,
            currentEpoch: null
        });

        state.emit(CustomEventType.GENESIS_EPOCH_CREATED, { epoch: 0n });

        t.absent(epochCoordinatorServiceInstance.start.called);
        await network.close();
    });

    test('Network does not start the epoch coordinator for a non-indexer with an existing genesis epoch', async t => {
        const { network, epochCoordinatorServiceInstance } = await loadNetwork({
            isIndexer: false,
            currentEpoch: 0n
        });

        t.absent(epochCoordinatorServiceInstance.start.called);
        await network.close();
    });

    test('Network starts the epoch coordinator when the local node is promoted to indexer with an existing genesis epoch', async t => {
        const publicKey = b4a.alloc(32, 2);
        const walletAddress = tracCryptoApi.address.encode('trac', publicKey);
        const { network, epochCoordinatorServiceInstance, state } = await loadNetwork({
            isIndexer: false,
            currentEpoch: 0n,
            indexerCount: 1,
            walletAddress
        });

        state.emit(CustomEventType.IS_INDEXER, publicKey);
        await Promise.resolve(); // IS_INDEXER handlers await indexerCount / getCurrentEpoch.

        t.is(epochCoordinatorServiceInstance.start.callCount, 1, 'local indexer promotion starts the coordinator');
        await network.close();
    });

    test('Network stops the epoch coordinator without refreshing indexer capacity when the local node is demoted', async t => {
        const publicKey = b4a.alloc(32, 2);
        const walletAddress = tracCryptoApi.address.encode('trac', publicKey);
        const { network, epochCoordinatorServiceInstance, indexerConnectionManagerInstance, state } = await loadNetwork({
            isIndexer: true,
            currentEpoch: 0n,
            indexerCount: 3,
            walletAddress
        });

        state.emit(CustomEventType.IS_NON_INDEXER, publicKey);
        await Promise.resolve();

        t.is(epochCoordinatorServiceInstance.stop.callCount, 1, 'local indexer demotion stops the coordinator');
        t.absent(indexerConnectionManagerInstance.setMax.called, 'local indexer demotion does not refresh connection capacity');
        await network.close();
    });

    test('Network#disconnectValidatorPeer clears pending validator attempts', async t => {
        const publicKey = 'a'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection attempt should remain pending');
        t.ok(network.isConnectionPending(publicKey), 'pending connection should be tracked before invalidation');

        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer invalidated by state event');

        t.ok(disconnected, 'disconnect should report work done');
        t.absent(network.isConnectionPending(publicKey), 'pending connection should be cleared');
        t.is(swarmInstance.leavePeer.callCount, 1, 'peer discovery should be cancelled');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectValidatorPeer removes tracked validators from the pool', async t => {
        const publicKey = 'b'.repeat(64);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: b4a.from(publicKey, 'hex') });
        
        const disconnected = network.disconnectValidatorPeer(publicKey, 'peer no longer valid validator');
        
        t.ok(disconnected, 'disconnect should report tracked validator removal');
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'validator should be removed from connection manager');
        t.alike(validatorConnectionManagerInstance.removed, [{ publicKey }], 'tracked validator should be detached without ending the socket');
        t.is(swarmInstance.leavePeer.callCount, 1, 'leavePeer should be called to clear explicit peer tracking without closing the socket');
        t.teardown(async () => await network.close());
    });

    test('Network#disconnectValidatorPeer ignores non-validator pending peers', async t => {
        const publicKey = 'c'.repeat(64);
        const { network, swarmInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'rpc');
        t.is(status, CONNECTION_STATUS.PENDING, 'non-validator connection attempt should be pending');
        t.ok(network.isConnectionPending(publicKey), 'non-validator pending connection should be tracked');

        const disconnected = network.disconnectValidatorPeer(publicKey, 'state event should not affect generic peer');

        t.absent(disconnected, 'non-validator peer should be ignored by validator disconnect helper');
        t.ok(network.isConnectionPending(publicKey), 'non-validator pending connection should remain tracked');
        t.is(swarmInstance.leavePeer.callCount, 0, 'generic peer should not be left');
        t.teardown(async () => await network.close());
    });

    test('Network#tryConnect returns CONNECTED and tracks already-connected validator', async t => {
        const publicKey = 'e'.repeat(64);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready validator peer');
        t.ok(validatorConnectionManagerInstance.exists(publicKey), 'validator was added to connection manager');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network#tryConnect returns CONNECTED and promotes into the network-owned indexer manager', async t => {
        const publicKey = 'f'.repeat(64);
        const { network, swarmInstance, indexerConnectionManagerInstance } = await loadNetwork();

        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });
        swarmInstance._allConnections.set(publicKeyBuffer, connection);

        // Indexer connections are promoted into the single indexer manager Network
        // owns for its lifetime (network.indexerConnectionManager), not a per-call one.
        const status = await network.tryConnect(publicKey, 'indexer');
        t.is(status, CONNECTION_STATUS.CONNECTED, 'returns CONNECTED for ready indexer peer');
        t.ok(indexerConnectionManagerInstance.add.calledWith(publicKeyBuffer, connection), 'connection was promoted into the network-owned indexer manager');
        t.absent(network.isConnectionPending(publicKey), 'pending indexer connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network tryConnect timeout clears pending connection', async t => {
        const publicKey = 'g'.repeat(64);
        const { network } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is initially pending');
        t.ok(network.isConnectionPending(publicKey), 'pending is tracked');

        await new Promise(resolve => setTimeout(resolve, 1_100));

        t.absent(network.isConnectionPending(publicKey), 'pending is cleared after timeout elapses');
        t.teardown(async () => await network.close());
    });

    test('Network swarm connection event promotes pending connection', async t => {
        const publicKey = '12'.repeat(32);
        const { network, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();

        const status = await network.tryConnect(publicKey, 'validator');
        t.is(status, CONNECTION_STATUS.PENDING, 'connection is pending after joinPeer');

        const connection = createMockConnection(publicKey);
        await swarmInstance.emit('connection', connection);

        t.ok(validatorConnectionManagerInstance.exists(publicKey), 'validator was added after swarm connection');
        t.absent(network.isConnectionPending(publicKey), 'pending validator connection was cleared');
        t.teardown(async () => await network.close());
    });

    test('Network disconnects validator peers when state role events invalidate them', async t => {
        const publicKey = 'd'.repeat(64);
        const publicKeyBuffer = b4a.from(publicKey, 'hex');
        const {
            network,
            swarmInstance,
            validatorConnectionManagerInstance,
            indexerConnectionManagerInstance,
            state
        } = await loadNetwork({ indexerCount: 3 });

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.UNWRITABLE, publicKeyBuffer);
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'unwritable peer should be removed from validator pool');
        t.is(swarmInstance.leavePeer.callCount, 1, 'unwritable peer should be removed from explicit peer tracking');

        validatorConnectionManagerInstance.add(publicKey);
        swarmInstance.peers.set(publicKey, { publicKey: publicKeyBuffer });

        state.emit(CustomEventType.IS_INDEXER, publicKeyBuffer);
        await Promise.resolve(); // IS_INDEXER handler awaits indexerCount.
        t.absent(validatorConnectionManagerInstance.exists(publicKey), 'promoted indexer should be removed from validator pool');
        t.ok(indexerConnectionManagerInstance.setMax.calledWith(2), 'promoted indexer excludes itself from the indexer connection limit');
        // Promotion keeps the underlying connection alive (endConnection: false) so it can be
        // reused for the indexer role, so it must NOT leave the peer - unlike a hard disconnect.
        t.is(swarmInstance.leavePeer.callCount, 1, 'promoted indexer should not leave the peer, connection is reused');

        state.emit(CustomEventType.IS_NON_INDEXER, publicKeyBuffer);
        await Promise.resolve(); // IS_NON_INDEXER handler awaits indexerCount for remote peers.
        t.ok(indexerConnectionManagerInstance.remove.calledWith(publicKeyBuffer), 'demoted remote indexer is removed before connection capacity is refreshed');
        t.is(indexerConnectionManagerInstance.setMax.callCount, 2, 'demoted remote indexer refreshes the indexer connection limit');
        t.teardown(async () => await network.close());
    });

    for (const kind of ['proposal', 'approval']) {
        test(`Network bans the transport peer after a real ${kind} identity mismatch`, async t => {
            const context = await loadNetwork();
            const {
                network, state, swarmInstance, indexerPendingRequestServiceInstance,
                validatorPendingRequestServiceInstance, validatorConnectionManagerInstance,
                indexerConnectionManagerInstance,
            } = context;
            t.teardown(() => network.close());
            const wallet = await new WalletProvider(consensusConfig).fromSecretKey(testKeyPair2.secretKey);
            const publicKey = wallet.publicKey.toString('hex');
            const connection = createMockConnection(publicKey);
            await network.tryConnect(publicKey, 'indexer');
            const peerInfo = swarmInstance.peers.get(publicKey);
            validatorConnectionManagerInstance.add(publicKey);
            indexerConnectionManagerInstance.add(publicKey, connection);

            const claimedAddress = consensusFixtures.proofProposal.proposer;
            const claimedKey = tracCryptoApi.address.decode(bufferToAddress(claimedAddress, consensusConfig.addressPrefix));
            const innocentPeer = createPeerInfo(claimedKey);
            swarmInstance.peers.set(claimedKey.toString('hex'), innocentPeer);

            const request = { ...consensusFixtures.proofProposalHeader, session_id: 'banned-peer-request' };
            const pendingResult = indexerPendingRequestServiceInstance.registerPendingRequest(publicKey, request)
                .catch(error => error);
            const otherRequest = { ...request, session_id: 'other-peer-request' };
            indexerPendingRequestServiceInstance.registerPendingRequest(claimedKey.toString('hex'), otherRequest)
                .catch(() => {});
            const handler = new ConsensusEpochProofProposalOperationHandler(state, {}, consensusConfig);
            const session = { sendAndForget: sinon.stub() };

            if (kind === 'proposal') {
                await handler.handleRequest({
                    ...request,
                    proof_proposal: {
                        ...consensusFixtures.proofProposal,
                        network_id: uint16ToBuffer(consensusConfig.networkId),
                    },
                }, connection, session);
            } else {
                const response = await signedConsensusResponse(wallet, ConsensusResultCode.OK, {
                    approver: claimedAddress,
                    approval_sig: b4a.alloc(64, 1),
                });
                const result = await handler.handleApproval(response, connection, session, request.proof_proposal);
                t.is(result.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
            }

            t.ok(peerInfo.ban.calledOnceWithExactly(true), 'Hyperswarm receives an explicit ban');
            t.ok(connection.destroy.calledOnce, 'active transport is destroyed');
            t.absent(innocentPeer.ban.called, 'the identity claimed in the payload is not banned');
            t.absent(session.sendAndForget.called, 'no response is written after the ban');
            t.absent(network.isConnectionPending(publicKey), 'pending connection attempt is cleared');
            const error = await pendingResult;
            t.ok(error instanceof V1ConsensusPublicKeyMismatchError, 'pending consensus request rejects with the local violation');
            t.ok(validatorPendingRequestServiceInstance.rejectPendingRequestsForPeer.calledOnceWithExactly(publicKey, error));
            t.ok(indexerPendingRequestServiceInstance.has(otherRequest.session_id), 'requests to other peers remain pending');
            t.absent(validatorConnectionManagerInstance.exists(publicKey), 'validator connection is removed');
            t.ok(indexerConnectionManagerInstance.remove.calledWith(publicKey), 'indexer connection is removed');
            t.absent(indexerConnectionManagerInstance.setMax.called, 'ban does not change membership capacity');

            for (const role of ['indexer', 'validator']) {
                t.is(await network.tryConnect(publicKey, role), CONNECTION_STATUS.IGNORED, 'banned peer is not reconnected');
            }
            t.is(swarmInstance.joinPeer.callCount, 1, 'no new join attempt is scheduled');
            t.is(network.pendingConnectionsCount(), 0);
        });
    }

    test('Network does not ban a peer for a signed PUBLIC_KEY_MISMATCH rejection', async t => {
        const { network, state, swarmInstance } = await loadNetwork();
        t.teardown(() => network.close());
        const wallet = await new WalletProvider(consensusConfig).fromSecretKey(testKeyPair2.secretKey);
        const connection = createMockConnection(wallet.publicKey.toString('hex'));
        const peerInfo = createPeerInfo(connection.remotePublicKey);
        swarmInstance.peers.set(wallet.publicKey.toString('hex'), peerInfo);
        const handler = new ConsensusEpochProofProposalOperationHandler(state, {}, consensusConfig);
        const response = await signedConsensusResponse(wallet, ConsensusResultCode.PUBLIC_KEY_MISMATCH);

        const result = await handler.handleApproval(response, connection, {}, consensusFixtures.proofProposal);

        t.is(result.resultCode, ConsensusResultCode.PUBLIC_KEY_MISMATCH);
        t.absent(peerInfo.ban.called, 'a remote rejection cannot trigger the local ban policy');
        t.absent(connection.destroy.called);
    });

    test('Network retains a ban when validation finishes after PeerInfo is removed', async t => {
        const { network, state, swarmInstance, store, indexerConnectionManagerInstance } = await loadNetwork();
        t.teardown(() => network.close());
        const publicKey = 'ac'.repeat(32);
        const connection = createMockConnection(publicKey);
        state.emit(CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE, {
            connection,
            error: new V1ConsensusPublicKeyMismatchError(),
        });

        t.ok(connection.destroy.calledOnce);
        t.ok(swarmInstance.firewall(connection.remotePublicKey), 'incoming handshake is blocked even without PeerInfo');
        t.absent(swarmInstance.firewall(b4a.alloc(32, 1)), 'other peers remain allowed');
        t.is(await network.tryConnect(publicKey, 'indexer'), CONNECTION_STATUS.IGNORED);
        t.absent(swarmInstance.joinPeer.called);
        t.is(network.pendingConnectionsCount(), 0);

        const racedConnection = createMockConnection(publicKey);
        swarmInstance.emit('connection', racedConnection);
        await Promise.resolve();
        t.ok(racedConnection.destroy.called, 'a handshake that raced with the ban is also closed');
        t.absent(store.replicate.called, 'a banned connection is not attached to replication');
        t.absent(indexerConnectionManagerInstance.add.called, 'a banned connection is not promoted');
    });

    test('Network destroys a replacement connection when old validation detects an identity mismatch', async t => {
        const { network, state, swarmInstance } = await loadNetwork();
        t.teardown(() => network.close());
        const publicKey = 'ad'.repeat(32);
        const oldConnection = createMockConnection(publicKey);
        const replacementConnection = createMockConnection(publicKey);
        const otherConnection = createMockConnection('ae'.repeat(32));
        const peerInfo = createPeerInfo(replacementConnection.remotePublicKey);
        swarmInstance.peers.set(publicKey, peerInfo);
        swarmInstance.connections.add(replacementConnection);
        swarmInstance.connections.add(otherConnection);

        state.emit(CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE, {
            connection: oldConnection,
            error: new V1ConsensusPublicKeyMismatchError(),
        });

        t.ok(peerInfo.banned);
        t.ok(oldConnection.destroy.calledOnce);
        t.ok(replacementConnection.destroy.calledOnce, 'ban closes the current transport for the same key');
        t.absent(otherConnection.destroy.called, 'other peers are unaffected');
    });

    test('Network does not retain a validator promoted after its pending probe was banned', async t => {
        const { network, state, swarmInstance, validatorConnectionManagerInstance } = await loadNetwork();
        t.teardown(() => network.close());
        const publicKey = 'af'.repeat(32);
        const connection = createMockConnection(publicKey);
        swarmInstance.peers.set(publicKey, createPeerInfo(connection.remotePublicKey));
        swarmInstance._allConnections.set(connection.remotePublicKey, connection);
        let finishProbe;
        const probe = new Promise(resolve => { finishProbe = resolve; });
        validatorConnectionManagerInstance.add = async key => {
            await probe;
            validatorConnectionManagerInstance.validators.add(normalizePublicKey(key));
        };
        const connecting = network.tryConnect(publicKey, 'validator');
        state.emit(CustomEventType.EPOCH_PROPOSAL_VALIDATION_FAILURE, {
            connection,
            error: new V1ConsensusPublicKeyMismatchError(),
        });
        finishProbe();

        t.is(await connecting, CONNECTION_STATUS.IGNORED);
        t.absent(validatorConnectionManagerInstance.exists(publicKey));
        t.ok(connection.destroy.calledOnce);
    });

    test('Network ignores other consensus failures and removes ban listeners on close', async t => {
        const { network, state, swarmInstance } = await loadNetwork();
        t.teardown(() => network.close());
        const publicKey = 'ab'.repeat(32);
        const connection = createMockConnection(publicKey);
        const peerInfo = createPeerInfo(connection.remotePublicKey);
        swarmInstance.peers.set(publicKey, peerInfo);
        const events = [CustomEventType.EPOCH_PROPOSAL_VALIDATION_FAILURE, CustomEventType.EPOCH_PROPOSAL_APPROVAL_FAILURE];

        for (const event of events) {
            t.is(state.listenerCount(event), 1);
            for (const code of [ConsensusResultCode.INDEXER_ROLE_INVALID, ConsensusResultCode.ADDRESS_INVALID,
                ConsensusResultCode.EPOCH_INVALID, ConsensusResultCode.UNEXPECTED_ERROR, ConsensusResultCode.PUBLIC_KEY_MISMATCH]) {
                state.emit(event, { connection, resultCode: code, error: new V1ConsensusProtocolError(code, 'ordinary failure') });
            }
        }
        t.absent(peerInfo.ban.called);
        t.absent(connection.destroy.called);

        await network.close();
        for (const event of events) {
            t.is(state.listenerCount(event), 0, 'network removes its failure listener');
            state.emit(event, { connection, error: new V1ConsensusPublicKeyMismatchError() });
        }
        t.absent(peerInfo.ban.called, 'late failure events cannot act on a closed network');
        t.absent(connection.destroy.called);
    });

    test('Network#pendingConnectionsCount reflects active pending connections', async t => {
        const { network } = await loadNetwork();

        t.is(network.pendingConnectionsCount(), 0, 'starts at 0');

        await network.tryConnect('a'.repeat(64), 'validator');
        t.is(network.pendingConnectionsCount(), 1, 'increments after tryConnect');

        await network.tryConnect('b'.repeat(64), 'validator');
        t.is(network.pendingConnectionsCount(), 2, 'increments for each pending');

        t.teardown(async () => await network.close());
    });
}
