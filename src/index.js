/** @typedef {import('pear-interface')} */ /* global Pear */
import ReadyResource from 'ready-resource';
import b4a from 'b4a';
import readline from 'readline';
import { sleep } from './utils/helpers.js';
import { createHash } from './utils/crypto.js';
import { verifyDag, printHelp, printWalletInfo } from './utils/cli.js';
import PeerWallet from "trac-wallet"
import tty from 'tty';
import Corestore from 'corestore';
import MsgUtils from './utils/msgUtils.js';
import MsgUtils2 from "./messages/MessageOperations.js"
import { extractPublickeyFromAddress } from './utils/helpers.js';
import {safeDecodeApplyOperation} from '../src/utils/protobuf/operationHelpers.js';
import {
    LISTENER_TIMEOUT,
    EntryType,
    OperationType,
    EventType,
    WHITELIST_SLEEP_INTERVAL,
    TRAC_NETWORK_PREFIX,
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
        this.#bootstrap = this.#bootstrap = options.bootstrap ? b4a.from(options.bootstrap, 'hex') : null;;
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
            printWalletInfo(this.#wallet.publicKey, this.#state.writingKey);
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

        this.#network.validatorObserver(this.#state.get.bind(this.#state), this.#wallet.publicKey); // can't be await

        const adminEntry = await this.#state.getAdminEntry();


        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (!this.#isAdmin(adminEntry) && this.#state.isWritable() && !this.#state.isIndexer()) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        // temporary turned off
        //await this.#setUpRoleAutomatically(adminEntry);

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
        const adminTracPublicKey = extractPublickeyFromAddress(adminEntry.tracAddr);
        return !!(b4a.equals(this.#wallet.publicKey, adminTracPublicKey) && b4a.equals(adminEntry.wk, this.#state.writingKey));

    }

    async #isAllowedToRequestRole(adminEntry, nodeEntry) {
        return nodeEntry && nodeEntry.isWhitelisted && !this.#isAdmin(adminEntry);
    }

    //todo: delete state.js method have it
    async #isWhitelisted(address) {
        //TODO rewrite with new binary logic
        const whitelistEntry = await this.#state.isAddressWhitelisted(address)
        return !!whitelistEntry;
    }


    async #handleIncomingEvent(bufferedRequest) {
        try {

            const decodedRequest = safeDecodeApplyOperation(bufferedRequest);
            if (decodedRequest.type) {

                if (decodedRequest.type === OperationType.ADD_WRITER || decodedRequest.type === OperationType.REMOVE_WRITER) {
                    //This request must be hanlded by ADMIN
                    this.emit(EventType.ADMIN_EVENT, decodedRequest, bufferedRequest);
                } else if (parsedRequest.type === OperationType.ADD_ADMIN) {
                    //This request must be handled by WRITER
                    this.emit(EventType.WRITER_EVENT, parsedRequest, bufferedRequest);
                }
                else if (parsedRequest.type === OperationType.WHITELISTED) {
                    const adminEntry = await this.#state.get(EntryType.ADMIN);
                    const reconstructedMessage = MsgUtils.createMessage(parsedRequest.key, parsedRequest.value.nonce, OperationType.WHITELISTED);
                    const hash = await createHash('sha256', reconstructedMessage);
                    if (this.#wallet.verify(b4a.from(parsedRequest.value.sig, 'hex'), b4a.from(hash), b4a.from(adminEntry.tracPublicKey, 'hex')) && !this.#state.isWritable() && parsedRequest.key === this.#wallet.publicKey) {
                        await this.#handleAddWriterOperation()
                    }
                }
            }
        } catch (error) {
            // for now ignore the error
        }
    }

    async #adminEventListener() {
        this.on(EventType.ADMIN_EVENT, async (parsedRequest, bufferedRequest) => {
            if (this.#enable_wallet === false) return;
            const isEventMessageValid = await MsgUtils2.verifyEventMessage(parsedRequest, this.#wallet, this.check, this.#state)
            if (isEventMessageValid) {
                await this.#state.append(bufferedRequest);
            }
        });
    }

    async #writerEventListener() {
        //TODO; Fix admin recovery
        this.on(EventType.WRITER_EVENT, async (parsedRequest, bufferedRequest) => {
            if (this.#enable_wallet === false) return;
            const adminEntry = await this.#state.get(EntryType.ADMIN);
            const isEventMessageVerifed = await MsgUtils.verifyEventMessage(parsedRequest, this.#wallet, this.check)
            if (adminEntry && adminEntry.tracPublicKey === parsedRequest.key && isEventMessageVerifed) {
                await this.#state.append(parsedRequest);
            }
        });
    }

    async #stateEventsListener() {
        this.#state.base.on(EventType.IS_INDEXER, () => {
            if (this.#state.listenerCount(EventType.WRITER_EVENT) > 0) {
                this.#state.removeAllListeners(EventType.WRITER_EVENT);
                this.#shouldListenToWriterEvents = false;
            }
            console.log('Current node is an indexer');
        });

        this.#state.base.on(EventType.IS_NON_INDEXER, () => {
            console.log('Current node is not an indexer anymore');
        });
        //TODO: FIX AFTER BINARY 
        this.#state.base.on(EventType.WRITABLE, async () => {
            const updatedNodeEntry = await this.#state.get(this.#wallet.address.toString('hex'));
            const canEnableWriterEvents = updatedNodeEntry &&
                updatedNodeEntry.wk === this.#state.writingKey &&
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
            const updatedNodeEntry = await this.#state.get(this.#wallet.publicKey);
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
            const adminEntry = await this.#state.get(EntryType.ADMIN);
            const addAdminMessage = await MsgUtils2.assembleAddAdminMessage(adminEntry, this.#state.writingKey, this.#wallet, this.#bootstrap);

            if (!adminEntry && this.#wallet && this.#state.writingKey && this.#state.writingKey === this.#bootstrap) {
                await this.#state.append(addAdminMessage);
            } else if (adminEntry && this.#wallet && adminEntry.tracPublicKey === this.#wallet.publicKey && this.#state.writingKey && this.#state.writingKey !== adminEntry.wk) {
                if (null === this.#network.validator_stream) return;
                //TODO: it should be refactored at the end
                //await this.#network.validator_stream.messenger.send(addAdminMessage);
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
        const assembledWhitelistMessages = await MsgUtils2.assembleAppendWhitelistMessages(this.#wallet);
        console.log(assembledWhitelistMessages)
        if (!assembledWhitelistMessages) {
            console.log('Whitelist message not sent.');
            return;
        }

        const totelElements = assembledWhitelistMessages.length;
        //TODO: enable connection to node and inform it that it became a writer.

        for (let i = 0; i < totelElements; i++) {
            // const isWhitelisted = await this.#isWhitelisted(assembledWhitelistMessages[i].key);
            // if (!isWhitelisted) {
            await this.#state.append(assembledWhitelistMessages[i]);
            // await this.#network.sendMessageToNode(assembledWhitelistMessages[i].key, whitelistedMessage);
            // await sleep(WHITELIST_SLEEP_INTERVAL);
            // console.log(`Whitelist message sent (public key ${(i + 1)}/${totelElements})`);
            //}
        }
    }

    async #requestWriterRole(toAdd) {
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();
        const nodeEntry = await this.#state.getNodeEntry(this.#wallet.address.toString('hex'));
        const isAlreadyWriter = !!(nodeEntry && nodeEntry.isWriter === true)
        let assembledMessage = null;

        if (toAdd) {
            const isAllowedToRequestRole = await this.#isAllowedToRequestRole(adminEntry, nodeEntry);
            const canAddWriter = !!(!this.#state.isWritable() && !isAlreadyWriter && isAllowedToRequestRole);
            if (canAddWriter) {
                //TODO: network module should handle this in binary format however for now it is ok
                assembledMessage = {
                    op: 'addWriter',
                    message: await MsgUtils2.assembleAddWriterMessage(this.#wallet, this.#state.writingKey),
                }
            }
        }
        else {
            if (isAlreadyWriter) {
                //TODO: network module should handle this in binary format however for now it is ok
                assembledMessage = {
                    op: 'removeWriter',
                    message: await MsgUtils2.assembleRemoveWriterMessage(this.#wallet, this.#state.writingKey),

                }
            }
        }

        if (assembledMessage) {
            await this.#network.sendMessageToAdmin(adminEntry, assembledMessage);
        }
    }

    async #updateIndexerRole(tracPubKey, toAdd) {
        const tempAddressApproach = "01" + tracPubKey;
        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();
        if (!this.#isAdmin(adminEntry) && !this.#state.isWritable()) return;
        const nodeEntry = await this.#state.getNodeEntry(tempAddressApproach);
        if (!nodeEntry || !nodeEntry.isWriter) return;

        const indexersEntry = await this.#state.getIndexersEntry();
        const indexerListHasAddress = await this.#state.isAddressInIndexersEntry(tempAddressApproach, indexersEntry);
        if (indexerListHasAddress) return;
        if (toAdd) {
            const canAddIndexer = nodeEntry.isWhitelisted && nodeEntry.isWriter && !nodeEntry.isIndexer;
            if (canAddIndexer) {
                const assembledAddIndexerMessage = await MsgUtils2.assembleAddIndexerMessage(this.#wallet, b4a.from(tracPubKey, 'hex'));
                await this.#state.append(assembledAddIndexerMessage);
            }
        } 
        else {
            const canRemoveIndexer = !toAdd && nodeEntry.isIndexer
            if (canRemoveIndexer) {
                const assembledRemoveIndexer = await MsgUtils2.assembleRemoveIndexerMessage(this.#wallet, b4a.from(tracPubKey, 'hex'));
                await this.#state.append(assembledRemoveIndexer);
            }

        }
    }
    //todo refactor this method to use MsgUtils2 and adjust it to binary data
    async #banValidator(tracPublicKey) {
        const tempAddressApproach = "01" + tracPublicKey;
        const adminEntry = await this.#state.getAdminEntry();
        if (!this.#isAdmin(adminEntry)) return;
        const isWhitelisted = await this.#state.isAddressWhitelisted(tempAddressApproach);
        const nodeEntry = await this.#state.getNodeEntry(tempAddressApproach);
        if (!isWhitelisted || null === nodeEntry || nodeEntry.isIndexer === true) return;
        const assembledBanValidatorMessage = await MsgUtils2.assembleBanWriterMessage(this.#wallet, b4a.from(tracPublicKey, 'hex'));
        await this.#state.append(assembledBanValidatorMessage);

    }

    async #handleAddIndexerOperation(tracAddress) {
        this.#updateIndexerRole(tracAddress, true);
    }

    async #handleRemoveIndexerOperation(tracPublicKey) {
        this.#updateIndexerRole(tracPublicKey, false);
    }

    async #handleAddWriterOperation() {
        await this.#requestWriterRole(true);
    }

    async #handleRemoveWriterOperation() {
        await this.#requestWriterRole(false);
    }

    async #handleBanValidatorOperation(tracPublicKey) {
        await this.#banValidator(tracPublicKey);
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
                break
            case '/flags':
                //TODO: consider to move it into the get node info or stats
                console.log("shouldListenToAdminEvents: ", this.#shouldListenToAdminEvents);
                console.log("shouldListenToWriterEvents: ", this.#shouldListenToWriterEvents);
                console.log("isWritable: ", this.#state.isWritable());
                console.log("isIndexer: ", this.#state.isIndexer());
                break
            case '/show':
                //TODO: Implement formater for users
                const admin = await this.#state.get(EntryType.ADMIN);
                console.log('Admin:', admin);
                const indexers = await this.#state.get(EntryType.INDEXERS);
                console.log('Indexers:', indexers);
                const wrl = await this.#state.get(EntryType.WRITERS_LENGTH);
                console.log('Writers Length:', wrl);
                break;
            case '/stats':
                await verifyDag(this.#state.base, this.#network.swarm, this.#wallet, this.#state.writingKey);
                break;
            default:
                if (input.startsWith('/get_node_info')) {
                    const splitted = input.split(' ');
                    const address = splitted[1];
                    const tempAddress = "0" + TRAC_NETWORK_PREFIX.toString() + address;
                    console.log("Temporary Address:", tempAddress);
                    const nodeEntry = await this.#state.getNodeEntry(tempAddress);
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
                    const tracPublicKey = splitted[1]
                    await this.#handleAddIndexerOperation(tracPublicKey);
                }
                else if (input.startsWith('/remove_indexer')) {
                    const splitted = input.split(' ');
                    const tracPublicKey = splitted[1]
                    await this.#handleRemoveIndexerOperation(tracPublicKey);
                }
                else if (input.startsWith('/ban_writer')) {
                    const splitted = input.split(' ');
                    const tracPublicKey = splitted[1]
                    await this.#handleBanValidatorOperation(tracPublicKey);
                }
        }
    }

}

export default MainSettlementBus;
