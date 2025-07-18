/** @typedef {import('pear-interface')} */ /* global Pear */
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import readline from 'readline';
import { sleep } from './utils/helpers.js';
import { createHash } from './utils/crypto.js';
import { verifyDag, printHelp, printWalletInfo, formatIndexersEntry } from './utils/cli.js';
import PeerWallet from "trac-wallet"
import tty from 'tty';
import Corestore from 'corestore';
import messageOperations from "./messages/MessageOperations.js"
import { safeDecodeApplyOperation } from '../src/utils/protobuf/operationHelpers.js';
import { createMessage } from './utils/buffer.js';
import ApplyOperationEncodings from './core/state/ApplyOperationEncodings.js';
import {
    LISTENER_TIMEOUT,
    OperationType,
    EventType,
    WHITELIST_SLEEP_INTERVAL,
} from './utils/constants.js';
import Network from './core/network/Network.js';
import Check from './utils/check.js';
import State from './core/state/State.js';

//TODO create a MODULE which will separate logic responsible for role managment

export class MainSettlementBus extends ReadyResource {
    // Internal flags
    #shouldListenToAdminEvents = false;
    #shouldListenToWriterEvents = false;

    // internal attributes
    #STORES_DIRECTORY;
    #KEY_PAIR_PATH;
    #bootstrap;
    #channel;
    #store;
    #enable_wallet;
    #wallet;
    #replicate;
    #network;
    #readline_instance;
    #enableRoleRequester;
    #state;
    constructor(options = {}) {
        super();

        this.check = new Check();
        this.#initInternalAttributes(options);
        this.#state = new State(this.#store, this.bootstrap, this.#wallet, options);
        this.#network = new Network(this.#state, this.#channel, options);
        this.#enableRoleRequester = options.enableRoleRequester !== undefined ? options.enableRoleRequester : true;
    }

    #initInternalAttributes(options) {
        this.#STORES_DIRECTORY = options.stores_directory;
        this.#KEY_PAIR_PATH = `${this.#STORES_DIRECTORY}${options.store_name}/db/keypair.json`
        this.#bootstrap = this.#bootstrap = options.bootstrap ? b4a.from(options.bootstrap, 'hex') : null;
        this.#channel = b4a.alloc(32).fill(options.channel) || null;
        this.#store = new Corestore(this.#STORES_DIRECTORY + options.store_name);
        this.#enable_wallet = options.enable_wallet !== false;
        this.#wallet = new PeerWallet(options);
        this.#replicate = options.replicate !== false;
        this.#readline_instance = null;
        this.enable_interactive_mode = options.enable_interactive_mode !== false;
        if (this.enable_interactive_mode !== false) {
            try {
                this.#readline_instance = readline.createInterface({
                    input: new tty.ReadStream(0),
                    output: new tty.WriteStream(1)
                });
            } catch (e) { }
        }
    }

    get STORES_DIRECTORY() { return this.#STORES_DIRECTORY; }

    get KEY_PAIR_PATH() { return this.#KEY_PAIR_PATH; }

    get bootstrap() { return this.#bootstrap; }

    get state() { return this.#state; }

    get channel() { return this.#channel; }

    get network() { return this.#network; }

    get tracPublicKey() {
        if (!this.#wallet) return null;
        return this.#wallet.publicKey;
    }

    async _open() {

        await this.#state.ready();
        this.#stateEventsListener();

        if (this.#enable_wallet) {
            await this.#wallet.initKeyPair(this.KEY_PAIR_PATH, this.#readline_instance);
            printWalletInfo(this.#wallet.address, this.#state.writingKey);
        }
        await this.#network.ready();
        if (this.#replicate) {
            await this.#network.replicate(
                this.#state,
                this.#state.writingKey,
                this.#store,
                this.#wallet,
                this.#handleIncomingEvent.bind(this),
            );
        }
        //validator observer can't be awaited.
        this.#network.validatorObserver(
            this.#state.getWriterLength.bind(this.#state),
            this.#state.getWriterIndex.bind(this.#state),
            this.#state.getNodeEntry.bind(this.#state),
            this.#wallet.address);

        const adminEntry = await this.#state.getAdminEntry();


        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.#state.isWritable() && !this.#state.isIndexer()) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        await this.#setUpRoleAutomatically(adminEntry);

        console.log(`isIndexer: ${this.#state.isIndexer()}`);
        console.log(`isWriter: ${this.#state.isWritable()}`);
        console.log('MSB Unsigned Length:', this.#state.getUnsignedLength());
        console.log('MSB Signed Length:', this.#state.getSignedLength());
        console.log('');
    }

    async _close() {
        console.log('Closing everything gracefully... This may take a moment.');

        await this.#network.close();

        await sleep(100);

        await this.#state.close();

        await sleep(100);

        if (this.#readline_instance) {

            const inputClosed = new Promise(resolve => this.#readline_instance.input.once('close', resolve));
            const outputClosed = new Promise(resolve => this.#readline_instance.output.once('close', resolve));

            this.#readline_instance.close();
            this.#readline_instance.input.destroy();
            this.#readline_instance.output.destroy();

            // Do not remove this. Without it, readline may close too quickly and still hang.
            await Promise.all([inputClosed, outputClosed]).catch(e => console.log("Error during closing readline stream:", e));
        }

        await sleep(100);

        if (this.#store !== null) {
            await this.#store.close();
        }

        await sleep(100);
    }

    async #setUpRoleAutomatically() {
        if (!this.#state.isWritable() && this.#enableRoleRequester) {
            console.log('Requesting writer role... This may take a moment.');
            await this.#requestWriterRole(false)
            setTimeout(async () => {
                await this.#requestWriterRole(true)
            }, 5_000);
            await sleep(5_000);
        }
    }

    #isAdmin(adminEntry) {
        if (!adminEntry || this.#enable_wallet === false) return false;
        return !!(this.#wallet.address === adminEntry.tracAddr && b4a.equals(adminEntry.wk, this.#state.writingKey));

    }

    async #isAllowedToRequestRole(adminEntry, nodeEntry) {
        return nodeEntry && nodeEntry.isWhitelisted && !this.#isAdmin(adminEntry);
    }

    async #handleIncomingEvent(bufferedRequest) {
        try {
            const decodedRequest = safeDecodeApplyOperation(bufferedRequest);
            if (decodedRequest.type) {
                if (decodedRequest.type === OperationType.ADD_WRITER || decodedRequest.type === OperationType.REMOVE_WRITER) {
                    //This request must be handled by ADMIN
                    this.emit(EventType.ADMIN_EVENT, decodedRequest, bufferedRequest);
                }
                else if (decodedRequest.type === OperationType.ADD_ADMIN) {
                    //This request must be handled by WRITER
                    this.emit(EventType.WRITER_EVENT, decodedRequest, bufferedRequest);

                }
                else if (decodedRequest.type === OperationType.WHITELISTED) {
                    //TODO: We should create separated listener for whitelisted operation which only be working if wallet is enabled and node is not a writer. 
                    // also this listener should be turned off when node become writable. But for now it is ok.
                    const adminEntry = await this.#state.getAdminEntry();
                    if (!adminEntry || this.#enable_wallet === false) return;
                    const adminPublicKey = PeerWallet.decodeBech32m(adminEntry.tracAddr)
                    const reconstructedMessage = createMessage(decodedRequest.address, decodedRequest.bko.nonce, OperationType.WHITELISTED);
                    const hash = await createHash('sha256', reconstructedMessage);
                    const isWhitelisted = await this.#state.isAddressWhitelisted(this.#wallet.address);
                    const isMessageVerifed = this.#wallet.verify(decodedRequest.bko.sig, hash, adminPublicKey);
                    const nodeAddress = ApplyOperationEncodings.bufferToAddress(decodedRequest.address);
                    const isKeyMatchingWalletAddress = nodeAddress === this.#wallet.address;

                    if (!isMessageVerifed || !isKeyMatchingWalletAddress || !isWhitelisted || this.#state.isWritable()) {
                        console.error('Conditions not met for whitelisted operation');
                        return;
                    }
                    await this.#handleAddWriterOperation()
                }
            }
        } catch (error) {
            // for now ignore the error
        }
    }

    async #adminEventListener() {
        this.on(EventType.ADMIN_EVENT, async (parsedRequest, bufferedRequest) => {
            if (this.#enable_wallet === false) return;
            const isEventMessageValid = await messageOperations.verifyEventMessage(parsedRequest, this.#wallet, this.check, this.#state)
            if (!isEventMessageValid) return;
            await this.#state.append(bufferedRequest);
        });
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest, bufferedRequest) => {
            if (this.#enable_wallet === false) return;
            const isEventMessageVerifed = await messageOperations.verifyEventMessage(parsedRequest, this.#wallet, this.check, this.#state);
            if (!isEventMessageVerifed) return;
            await this.#state.append(bufferedRequest);
        });
    }

    async #stateEventsListener() {
        this.#state.base.on(EventType.IS_INDEXER, () => {
            if (this.#state.listenerCount(EventType.WRITER_EVENT) > 0) {
                this.#state.removeAllListeners(EventType.WRITER_EVENT);
            }
            this.#shouldListenToWriterEvents = false;
            console.log('Current node is an indexer');
        });

        this.#state.base.on(EventType.IS_NON_INDEXER, async () => {
            // downgrate from indexer to non-indexer makes that node is writable
            const updatedNodeEntry = await this.#state.getNodeEntry(this.#wallet.address.toString('hex'));
            const canEnableWriterEvents = updatedNodeEntry &&
                b4a.equals(updatedNodeEntry.wk, this.#state.writingKey) &&
                !this.#shouldListenToWriterEvents;

            if (canEnableWriterEvents) {
                this.#shouldListenToWriterEvents = true;
                this.#writerEventListener();
                console.log('Current node is writable');
            }
            console.log('Current node is not an indexer anymore');
        });

        this.#state.base.on(EventType.WRITABLE, async () => {
            const updatedNodeEntry = await this.#state.getNodeEntry(this.#wallet.address.toString('hex'));
            const canEnableWriterEvents = updatedNodeEntry &&
                b4a.equals(updatedNodeEntry.wk, this.#state.writingKey) &&
                !this.#shouldListenToWriterEvents;

            if (canEnableWriterEvents) {
                this.#shouldListenToWriterEvents = true;
                this.#writerEventListener();
                console.log('Current node is writable');
            }
        });

        this.#state.base.on(EventType.UNWRITABLE, async () => {
            if (this.#enable_wallet === false) {
                console.log('Current node is unwritable');
                return;
            }
            const updatedNodeEntry = await this.#state.getNodeEntry(this.#wallet.address.toString('hex'));
            const canDisableWriterEvents = updatedNodeEntry &&
                !updatedNodeEntry.isWriter &&
                this.#shouldListenToWriterEvents;

            if (canDisableWriterEvents) {
                this.removeAllListeners(EventType.WRITER_EVENT);
                this.#shouldListenToWriterEvents = false;
                console.log('Current node is unwritable');
            }
        });
    }

    async #handleAdminOperations() {
        try {
            const adminEntry = await this.#state.getAdminEntry();
            const addAdminMessage = await messageOperations.assembleAddAdminMessage(adminEntry, this.#state.writingKey, this.#wallet, this.#bootstrap);
            if (!adminEntry &&
                this.#wallet &&
                this.#state.writingKey &&
                b4a.equals(this.#state.writingKey, this.#bootstrap)
            ) {
                await this.#state.append(addAdminMessage);
            } else if (adminEntry &&
                this.#wallet &&
                adminEntry.tracAddr === this.#wallet.address &&
                this.#state.writingKey &&
                !b4a.equals(this.#state.writingKey, adminEntry.wk)
            ) {
                if (null === this.#network.validator_stream) return;
                const payloadForValidator = {
                    op: 'addAdmin',
                    message: addAdminMessage,

                }
                await this.#network.validator_stream.messenger.send(payloadForValidator);
            }

            setTimeout(async () => {
                const updatedAdminEntry = await this.#state.getAdminEntry();
                if (this.#isAdmin(updatedAdminEntry) && !this.#shouldListenToAdminEvents) {
                    this.#shouldListenToAdminEvents = true;
                    this.#adminEventListener();
                }
            }, LISTENER_TIMEOUT);

        } catch (e) {
            console.log(e);
        }
    }

    async #handleWhitelistOperations() {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();

        if (!this.#isAdmin(adminEntry)) return;
        const assembledWhitelistMessages = await messageOperations.assembleAppendWhitelistMessages(this.#wallet);
        if (!assembledWhitelistMessages) {
            console.log('Whitelist message not sent.');
            return;
        }

        const totalElements = assembledWhitelistMessages.size;
        let processedCount = 0;

        for (const [address, encodedPayload] of assembledWhitelistMessages) {
            processedCount++;
            const isWhitelisted = await this.#state.isAddressWhitelisted(address);
            const correstpondingPublicKey = PeerWallet.decodeBech32m(address).toString('hex');
            if (isWhitelisted) {
                console.log(`Public key ${address} is already whitelisted.`);
                continue;
            }

            const whitelistedMessage = {
                op: 'whitelisted',
                message: encodedPayload,
            };

            await this.#state.append(encodedPayload);
            // timesleep and validate if it becomes whitelisted
            await this.#network.sendMessageToNode(correstpondingPublicKey, whitelistedMessage)
            await sleep(WHITELIST_SLEEP_INTERVAL);
            console.log(`Whitelist message processed (${processedCount}/${totalElements})`);

        }
    }

    async #requestWriterRole(toAdd) {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();
        const nodeEntry = await this.#state.getNodeEntry(this.#wallet.address);
        const isAlreadyWriter = !!(nodeEntry && nodeEntry.isWriter === true)
        let assembledMessage = null;

        if (toAdd) {
            const isAllowedToRequestRole = await this.#isAllowedToRequestRole(adminEntry, nodeEntry);
            const canAddWriter = !!(!this.#state.isWritable() && !isAlreadyWriter && isAllowedToRequestRole);
            if (canAddWriter) {
                //TODO: network module should handle this in binary format however for now it is ok
                assembledMessage = {
                    op: 'addWriter',
                    message: await messageOperations.assembleAddWriterMessage(this.#wallet, this.#state.writingKey),
                }
            }
        }
        else {
            if (isAlreadyWriter) {
                //TODO: network module should handle this in binary format however for now it is ok
                assembledMessage = {
                    op: 'removeWriter',
                    message: await messageOperations.assembleRemoveWriterMessage(this.#wallet, this.#state.writingKey),

                }
            }
        }

        if (assembledMessage) {
            await this.#network.sendMessageToAdmin(adminEntry, assembledMessage);
        }
    }

    async #updateIndexerRole(tracAddress, toAdd) {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();
        if (!this.#isAdmin(adminEntry) && !this.#state.isWritable()) return;
        const nodeEntry = await this.#state.getNodeEntry(tracAddress);
        if (!nodeEntry) return;

        const indexersEntry = await this.#state.getIndexersEntry();
        const indexerListHasAddress = await this.#state.isAddressInIndexersEntry(tracAddress, indexersEntry);

        if (toAdd) {
            if (indexerListHasAddress) return;
            const canAddIndexer = nodeEntry.isWhitelisted && nodeEntry.isWriter && !nodeEntry.isIndexer && !indexerListHasAddress;
            if (canAddIndexer) {
                const assembledAddIndexerMessage = await messageOperations.assembleAddIndexerMessage(this.#wallet, tracAddress);
                await this.#state.append(assembledAddIndexerMessage);
            }
        }
        else {
            const canRemoveIndexer = !toAdd && nodeEntry.isIndexer && indexerListHasAddress;
            if (canRemoveIndexer) {
                const assembledRemoveIndexer = await messageOperations.assembleRemoveIndexerMessage(this.#wallet, tracAddress);
                await this.#state.append(assembledRemoveIndexer);
            }

        }
    }
    async #banValidator(address) {
        const adminEntry = await this.#state.getAdminEntry();
        if (!this.#isAdmin(adminEntry)) return;
        const isWhitelisted = await this.#state.isAddressWhitelisted(address);
        const nodeEntry = await this.#state.getNodeEntry(address);
        if (!isWhitelisted || null === nodeEntry || nodeEntry.isIndexer === true) return;
        const assembledBanValidatorMessage = await messageOperations.assembleBanWriterMessage(this.#wallet, address);
        await this.#state.append(assembledBanValidatorMessage);

    }

    async #handleAddIndexerOperation(address) {
        this.#updateIndexerRole(address, true);
    }

    async #handleRemoveIndexerOperation(address) {
        this.#updateIndexerRole(address, false);
    }

    async #handleAddWriterOperation() {
        await this.#requestWriterRole(true);
    }

    async #handleRemoveWriterOperation() {
        await this.#requestWriterRole(false);
    }

    async #handleBanValidatorOperation(address) {
        await this.#banValidator(address);
    }

    async interactiveMode() {
        if (this.#readline_instance === null) return;
        const rl = this.#readline_instance;

        printHelp();

        rl.on('line', async (input) => {
            this.handleCommand(input.trim(), rl);
            rl.prompt();
        });

        rl.prompt();
    }

    async handleCommand(input, rl = null) {
        switch (input) {
            case '/help':
                this.printHelp();
                break;
            case '/exit':
                if (rl) rl.close();
                await this.close();
                break;
            case '/add_admin':
                await this.#handleAdminOperations();
                break;
            case '/add_whitelist':
                await this.#handleWhitelistOperations();
                break;
            case '/add_writer':
                await this.#handleAddWriterOperation();
                break;
            case '/remove_writer':
                await this.#handleRemoveWriterOperation();
                break;
            case '/core':
                const admin = await this.#state.getAdminEntry();
                console.log('Admin:', admin ? {
                    address: admin.tracAddr,
                    writingKey: admin.wk.toString('hex')
                } : null);
                const indexers = await this.#state.getIndexersEntry();
                console.log('Indexers:', formatIndexersEntry(indexers));
                const wrl = await this.#state.getWriterLength();
                console.log('Writers Length:', wrl);
                // const linealizer = this.#state.getInfoFromLinearizer();
                // console.log('Indexers from Linearizer:', linealizer);
                break;
            case '/stats':
                await verifyDag(this.#state, this.#network, this.#wallet, this.#state.writingKey, this.#shouldListenToAdminEvents, this.#shouldListenToWriterEvents);
                break;
            default:
                if (input.startsWith('/get_node_info')) {
                    const splitted = input.split(' ');
                    const address = splitted[1];
                    const nodeEntry = await this.#state.getNodeEntry(address);
                    if (nodeEntry) {
                        console.log("Node Entry:", {
                            WritingKey: nodeEntry.wk.toString('hex'),
                            IsWhitelisted: nodeEntry.isWhitelisted,
                            IsWriter: nodeEntry.isWriter,
                            IsIndexer: nodeEntry.isIndexer
                        });
                    } else {
                        console.log("Node Entry not found for address:", address);
                    }
                } else if (input.startsWith('/add_indexer')) {
                    const splitted = input.split(' ');
                    const address = splitted[1]
                    await this.#handleAddIndexerOperation(address);
                }
                else if (input.startsWith('/remove_indexer')) {
                    const splitted = input.split(' ');
                    const address = splitted[1]
                    await this.#handleRemoveIndexerOperation(address);
                }
                else if (input.startsWith('/ban_writer')) {
                    const splitted = input.split(' ');
                    const address = splitted[1]
                    await this.#handleBanValidatorOperation(address);
                }
        }
    }

}

export default MainSettlementBus;
