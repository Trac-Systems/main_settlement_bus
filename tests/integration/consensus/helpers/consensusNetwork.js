import Corestore from 'corestore';
import Autobase from 'autobase';
import b4a from 'b4a';
import { WalletProvider } from 'trac-wallet';
import { createConfig, ENV } from '../../../../src/config/env.js';
import State from '../../../../src/core/state/State.js';
import { $TNK } from '../../../../src/core/state/utils/balance.js';
import ConsensusMessages from '../../../../src/core/consensus/protocols/ConsensusMessages.js';
import IndexerConnectionManager from '../../../../src/core/consensus/services/IndexerConnectionManager.js';
import IndexerPendingRequestService from '../../../../src/core/consensus/services/IndexerPendingRequestService.js';
import { EpochCoordinationRound } from '../../../../src/core/consensus/services/EpochCoordinationRound.js';
import { VDFServiceManager } from '../../../../src/core/consensus/services/VDFServiceManager.js';
import { applyStateMessageFactory } from '../../../../src/messages/state/applyStateMessageFactory.js';
import { encodeApplyOperation, encodeConsensusConfig } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { encodeVdfConfig } from '../../../../src/codecs/consensus/v1/vdfConfigCodec.js';
import { uint8ToBuffer, uint16ToBuffer, uint32ToBuffer } from '../../../../src/utils/buffer.js';
import { Logger } from '../../../../src/utils/logger.js';
import { sleep as delay } from '../../../../src/utils/helpers.js';

export const VDF_DIFFICULTY = 100;
export const VDF_DISCRIMINANT_BITS = 1024;

// Poll observable progress, never use a fixed delay as evidence that work completed.
export async function waitFor(description, predicate) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await delay(20);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

/** Real State/Autobase nodes over local Noise streams; only peer discovery is replaced. */
export async function createConsensusNetwork(t, { indexerCount = 5, prepareConnections = true } = {}) {
    const nodes = [];
    const links = [];
    const rounds = [];
    const errors = [];
    const gates = [];
    let closing = false;
    let bootstrap;

    function recordError(error) {
        if (!closing) errors.push(error);
    }

    function deferred() {
        let resolve;
        const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
        gates.push(resolve);
        return { promise, resolve };
    }

    t.teardown(async () => {
        closing = true;
        // Attempt every cleanup even if an earlier resource fails to close.
        const failures = [];
        async function close(resource) {
            try { await resource?.close(); } catch (error) { failures.push(error); }
        }
        for (const { round } of rounds) await round.cancel();
        // Keep cleanup in one callback: Brittle does not sort teardown order after a thrown error.
        for (const release of gates) release();
        for (const node of nodes) {
            await close(node.vdfManager);
            await close(node.pending);
        }
        await Promise.allSettled(rounds.map(({ running }) => running));
        for (const { left, right } of links) {
            left.destroy();
            right.destroy();
        }
        for (const node of nodes) {
            await close(node.manager);
            await close(node.state);
            await close(node.store);
        }
        if (failures.length) throw new AggregateError(failures, 'Consensus network cleanup failed');
        if (errors.length) throw new AggregateError(errors, 'Consensus network reported errors');
    }, { force: true });

    // Register directory cleanup after resource cleanup, including for failed tests.
    const directory = await t.tmp();

    async function waitForReplication(description, predicate) {
        try {
            await waitFor(description, async () => {
                if (errors.length) throw errors[0];
                for (const node of nodes) {
                    await node.state.refresh();
                    // Drive real Autobase acknowledgements to make signed progress explicit.
                    if (node.state.base.writable && node.state.isIndexer()) await node.state.append(null);
                }
                return predicate();
            });
        } catch (error) {
            const progress = nodes.map(node => ({
                node: node.id,
                signed: node.state.getSignedLength(),
                length: node.state.getUnsignedLength(),
                indexer: node.state.isIndexer(),
            }));
            throw new Error(`${error.message}; node progress: ${JSON.stringify(progress)}`, { cause: error });
        }
    }

    async function connect(a, b) {
        const left = a.store.replicate(true, { keyPair: a.wallet });
        const right = b.store.replicate(false, { keyPair: b.wallet });
        left.on('error', recordError);
        right.on('error', recordError);
        links.push({ a, b, left, right });
        left.pipe(right).pipe(left);
        await Promise.all([left.noiseStream.opened, right.noiseStream.opened]);
        if (!left.noiseStream.remotePublicKey.equals(b.wallet.publicKey) ||
            !right.noiseStream.remotePublicKey.equals(a.wallet.publicKey)) {
            throw new Error('Noise connection authenticated an unexpected peer');
        }
    }

    function connectionFrom(node, other) {
        const link = links.find(link =>
            (link.a === node && link.b === other) || (link.b === node && link.a === other)
        );
        return link.a === node ? link.left.noiseStream : link.right.noiseStream;
    }

    // Each scenario uses five nodes; some start as writers awaiting promotion.
    for (let id = 0; id < 5; id++) {
        const store = new Corestore(`${directory}/node-${id}`);
        const node = { id, store, promoted: id === 0 };
        nodes.push(node);
        await store.ready();
        if (id === 0) bootstrap = await Autobase.getLocalKey(store);
        node.config = createConfig(ENV.DEVELOPMENT, {
            bootstrap,
            enableTxApplyLogs: false,
            enableInteractiveMode: false,
            enableLogTimestamp: false,
        });
        // No timeout is an expected transition in these tests. Leave time for slow CI.
        for (const name of ['epochSignatureTimeout', 'epochAppendTimeout', 'indexerPendingRequestTimeout']) {
            Object.defineProperty(node.config, name, { value: 60_000 });
        }
        node.wallet = await new WalletProvider(node.config).generate({ derivationPath: node.config.derivationPath });
        node.state = new State(store, node.wallet, node.config);
        node.state.on('error', recordError);
        for (const previous of nodes.slice(0, -1)) await connect(previous, node);
        await node.state.ready();
        node.state.base.on('error', recordError);
        if (id === 0) await node.state.append(null);
    }

    const proposer = nodes[0];
    async function appendAdmin(build) {
        const validity = await proposer.state.getIndexerSequenceState();
        const factory = applyStateMessageFactory(proposer.wallet, proposer.config);
        await proposer.state.append(encodeApplyOperation(await build(factory, validity)));
    }

    async function addIndexer(node) {
        if (node.promoted) throw new Error(`Node ${node.id} is already an indexer`);
        await appendAdmin((factory, validity) => factory.buildCompleteAddIndexerMessage(
            proposer.wallet.address, node.wallet.address, validity
        ));
        const expectedKeys = nodes.filter(peer => peer.promoted || peer === node)
            .map(peer => peer.state.writingKey.toString('hex')).sort();
        await waitForReplication(`indexer ${node.id} visible on all nodes`, async () => {
            for (const peer of nodes) {
                const actual = (await peer.state.getIndexersEntry()).map(entry => entry.key.toString('hex')).sort();
                if (actual.join(',') !== expectedKeys.join(',')) return false;
                // The Autobase membership list can change before the role update is signed.
                // Finish each promotion before submitting the next control operation.
                if (!(await peer.state.getNodeEntry(node.wallet.address))?.isIndexer) return false;
            }
            return node.state.isIndexer();
        });
        node.promoted = true;
    }

    await appendAdmin((factory, validity) => factory.buildCompleteAddAdminMessage(
        proposer.wallet.address, proposer.state.writingKey, validity
    ));
    await waitForReplication('admin registration', async () =>
        (await Promise.all(nodes.map(node => node.state.getAdminEntry()))).every(Boolean)
    );

    for (const node of nodes.slice(1)) {
        await appendAdmin((factory, validity) => factory.buildCompleteBalanceInitializationMessage(
            proposer.wallet.address, node.wallet.address, $TNK(10n), validity
        ));
        await appendAdmin((factory, validity) => factory.buildCompleteAppendWhitelistMessage(
            proposer.wallet.address, node.wallet.address, validity
        ));
        await waitForReplication(`writer ${node.id} whitelisted`, async () =>
            Boolean(await node.state.getSigned(node.wallet.address))
        );
        const validity = await proposer.state.getIndexerSequenceState();
        const partial = await applyStateMessageFactory(node.wallet, node.config).buildPartialAddWriterMessage(
            node.wallet.address, node.state.writingKey.toString('hex'), validity.toString('hex'), 'json'
        );
        await appendAdmin(factory => factory.buildCompleteAddWriterMessage(
            partial.address, ...['tx', 'txv', 'iw', 'in', 'is'].map(key => b4a.from(partial.rao[key], 'hex'))
        ));
        await waitForReplication(`writer ${node.id} writable`, () => node.state.base.writable);
        if (node.id < indexerCount) await addIndexer(node);
    }

    const configData = encodeVdfConfig({
        difficulty: uint32ToBuffer(VDF_DIFFICULTY),
        discriminantBitSize: uint16ToBuffer(VDF_DISCRIMINANT_BITS),
    });
    const genesisConfig = encodeConsensusConfig({ sv: uint8ToBuffer(1), cd: configData });
    await appendAdmin((factory, validity) => factory.buildCompleteSetGenesisEpochMessage(
        proposer.wallet.address, validity, genesisConfig
    ));
    await waitForReplication('signed genesis on all nodes', async () =>
        (await Promise.all(nodes.map(node => node.state.getCurrentEpoch()))).every(epoch => epoch === 0n)
    );

    for (const node of nodes) {
        node.pending = new IndexerPendingRequestService(node.config);
        function removeClosedSession(connection) {
            node.manager.remove(connection.remotePublicKey, connection);
        }
        node.messages = new ConsensusMessages(node.state, node.wallet, node.config, node.pending, removeClosedSession);
        const network = {
            isConnectionPending: () => false,
            async tryConnect(publicKey) {
                const other = nodes.find(peer => peer.wallet.publicKey.toString('hex') === publicKey);
                if (!other) throw new Error('Requested peer must exist in the test network');
                await node.manager.add(other.wallet.publicKey, connectionFrom(node, other));
            },
        };
        node.manager = new IndexerConnectionManager(
            nodes.length, node.config, new Logger(node.config), node.messages, node.state, network, node.wallet
        );
        await node.manager.ready();
        for (const other of nodes) {
            if (prepareConnections && other !== node) node.messages.prepareConnection(connectionFrom(node, other));
        }
    }
    async function openOperations(node) {
        node.vdfManager = new VDFServiceManager(node.state, node.wallet, node.config);
        node.operations = await node.vdfManager.open();
    }
    // Other nodes can become proposers explicitly when a scenario needs another round.
    await openOperations(proposer);

    function startRound(node = proposer, config = node.config) {
        const round = new EpochCoordinationRound({
            state: node.state,
            wallet: node.wallet,
            config,
            manager: node.manager,
            logger: new Logger(config),
            operations: node.operations,
            intervalMs: config.epochInterval,
        });
        const execution = { round, completed: false };
        rounds.push(execution);
        execution.running = round.run(() => { execution.completed = true; });
        execution.running.catch(recordError);
        return execution;
    }

    return { nodes, proposer, addIndexer, appendAdmin, connectionFrom, startRound, openOperations, waitForReplication, deferred };
}
