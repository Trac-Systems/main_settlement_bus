/** @typedef {import('pear-interface')} */ /* global Pear */
import ReadyResource from "ready-resource";
import Corestore from "corestore";
import PeerWallet from "trac-wallet";
import b4a from "b4a";
import readline from "readline";
import tty from "tty";

import { sleep, formatIndexersEntry, isHexString } from "./utils/helpers.js";
import { verifyDag, printHelp, printWalletInfo } from "./utils/cli.js";
import StateMessageOperations from "./messages/stateMessages/StateMessageOperations.js";
import { safeDecodeApplyOperation } from "./utils/protobuf/operationHelpers.js";
import { createMessage } from "./utils/buffer.js";
import addressUtils, { isAddressValid } from "./core/state/utils/address.js";
import Network from "./core/network/Network.js";
import Check from "./utils/check.js";
import State from "./core/state/State.js";
import PartialStateMessageOperations from "./messages/partialStateMessages/PartialStateMessageOperations.js";
import {
    LISTENER_TIMEOUT,
    OperationType,
    EventType,
    WHITELIST_SLEEP_INTERVAL,
    BOOTSTRAP_HEXSTRING_LENGTH,
} from "./utils/constants.js";
import { blake3Hash } from "./utils/crypto.js";

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
    #network;
    #readline_instance;
    #enable_validator_observer;
    #enable_role_requester;
    #state;
    #isClosing = false;

    constructor(options = {}) {
        super();
        this.#initInternalAttributes(options);
        this.check = new Check();
        this.#state = new State(this.#store, this.bootstrap, this.#wallet, options);
        this.#network = new Network(this.#state, this.#channel, options);
    }

    #initInternalAttributes(options) {
        this.#STORES_DIRECTORY = options.stores_directory;
        this.#KEY_PAIR_PATH = `${this.#STORES_DIRECTORY}${options.store_name}/db/keypair.json`;
        this.#enable_wallet = options.enable_wallet !== false;
        this.enable_interactive_mode = options.enable_interactive_mode !== false;
        this.#enable_role_requester =
            options.enable_role_requester !== undefined
                ? options.enable_role_requester
                : true;
        this.#enable_validator_observer =
            options.enable_validator_observer !== undefined
                ? options.enable_validator_observer
                : true;
        this.#bootstrap = options.bootstrap
            ? b4a.from(options.bootstrap, "hex")
            : null;

        if (!options.channel) {
            throw new Error(
                "MainSettlementBus: Channel is required. Application cannot start without channel."
            );
        }

        this.#channel = b4a.alloc(32).fill(options.channel);
        this.#store = new Corestore(this.#STORES_DIRECTORY + options.store_name);
        this.#wallet = new PeerWallet(options);
        this.#readline_instance = null;

        if (this.enable_interactive_mode !== false) {
            try {
                this.#readline_instance = readline.createInterface({
                    input: new tty.ReadStream(0),
                    output: new tty.WriteStream(1),
                });
            } catch (e) { }
        }
    }

    get STORES_DIRECTORY() {
        return this.#STORES_DIRECTORY;
    }

    get KEY_PAIR_PATH() {
        return this.#KEY_PAIR_PATH;
    }

    get bootstrap() {
        return this.#bootstrap;
    }

    get state() {
        return this.#state;
    }

    get channel() {
        return this.#channel;
    }

    get network() {
        return this.#network;
    }

    get tracPublicKey() {
        if (!this.#wallet) return null;
        return this.#wallet.publicKey;
    }

    async _open() {
        await this.#state.ready();
        await this.#network.ready();
        this.#stateEventsListener();

        if (this.#enable_wallet) {
            await this.#wallet.initKeyPair(
                this.KEY_PAIR_PATH,
                this.#readline_instance
            );
            printWalletInfo(this.#wallet.address, this.#state.writingKey);
        }

        await this.#network.replicate(
            this.#state,
            this.#store,
            this.#wallet,
            this.#handleIncomingEvent.bind(this)
        );

        //validator observer can't be awaited.
        if (this.#enable_validator_observer) {
            this.#network.startValidatorObserver(this.#wallet.address);
        }

        const adminEntry = await this.#state.getAdminEntry();

        if (this.#isAdmin(adminEntry)) {
            this.#shouldListenToAdminEvents = true;
            this.#adminEventListener(); // only for admin
        } else if (this.#state.isWritable() && !this.#state.isIndexer()) {
            this.#shouldListenToWriterEvents = true;
            this.#writerEventListener(); // only for writers
        }

        await this.#setUpRoleAutomatically(adminEntry);

        console.log(`isIndexer: ${this.#state.isIndexer()}`);
        console.log(`isWriter: ${this.#state.isWritable()}`);
        console.log("MSB Unsigned Length:", this.#state.getUnsignedLength());
        console.log("MSB Signed Length:", this.#state.getSignedLength());
        console.log("");
    }

    async _close() {
        console.log("Closing everything gracefully... This may take a moment.");

        this.#isClosing = true;
        await this.#network.close();

        await sleep(100);

        await this.#state.close();

        await sleep(100);

        if (this.#readline_instance) {
            const inputClosed = new Promise((resolve) =>
                this.#readline_instance.input.once("close", resolve)
            );
            const outputClosed = new Promise((resolve) =>
                this.#readline_instance.output.once("close", resolve)
            );

            this.#readline_instance.close();
            this.#readline_instance.input.destroy();
            this.#readline_instance.output.destroy();

            // Do not remove this. Without it, readline may close too quickly and still hang.
            await Promise.all([inputClosed, outputClosed]).catch((e) =>
                console.log("Error during closing readline stream:", e)
            );
        }

        await sleep(100);

        if (this.#store !== null) {
            await this.#store.close();
        }

        await sleep(100);
    }

    async #setUpRoleAutomatically() {
        if (!this.#state.isWritable() && this.#enable_role_requester) {
            console.log("Requesting writer role... This may take a moment.");
            await this.#requestWriterRole(false);
            setTimeout(async () => {
                await this.#requestWriterRole(true);
            }, 5_000);
            await sleep(5_000);
        }
    }

    #isAdmin(adminEntry) {
        if (!adminEntry || this.#enable_wallet === false) return false;
        return !!(
            this.#wallet.address === adminEntry.address &&
            b4a.equals(adminEntry.wk, this.#state.writingKey)
        );
    }

    async #isAllowedToRequestRole(adminEntry, nodeEntry) {
        return nodeEntry && nodeEntry.isWhitelisted && !this.#isAdmin(adminEntry);
    }

    async #handleIncomingEvent(bufferedRequest) {
        try {
            const decodedRequest = safeDecodeApplyOperation(bufferedRequest);
            if (decodedRequest.type) {
                if ([OperationType.ADD_WRITER, OperationType.REMOVE_WRITER, OperationType.ADD_ADMIN].includes(decodedRequest.type)) {
                    //This request must be handled by ADMIN
                    this.emit(EventType.ADMIN_EVENT, decodedRequest, bufferedRequest);
                } else if (decodedRequest.type === OperationType.WHITELISTED) {
                    //TODO: We should create separated listener for whitelisted operation which only be working if wallet is enabled and node is not a writer.
                    // also this listener should be turned off when node become writable. But for now it is ok.
                    const adminEntry = await this.#state.getAdminEntry();
                    if (!adminEntry || this.#enable_wallet === false) return;
                    const adminPublicKey = PeerWallet.decodeBech32m(adminEntry.address);
                    const reconstructedMessage = createMessage(
                        decodedRequest.address,
                        decodedRequest.bko.nonce,
                        OperationType.WHITELISTED
                    );
                    const hash = await blake3Hash(reconstructedMessage);
                    const isWhitelisted = await this.#state.isAddressWhitelisted(
                        this.#wallet.address
                    );
                    const isMessageVerifed = this.#wallet.verify(
                        decodedRequest.bko.sig,
                        hash,
                        adminPublicKey
                    );
                    const nodeAddress = addressUtils.bufferToAddress(
                        decodedRequest.address
                    );
                    const isKeyMatchingWalletAddress =
                        nodeAddress === this.#wallet.address;

                    if (
                        !isMessageVerifed ||
                        !isKeyMatchingWalletAddress ||
                        !isWhitelisted ||
                        this.#state.isWritable()
                    ) {
                        console.error("Conditions not met for whitelisted operation");
                        return;
                    }
                    await this.#handleAddWriterOperation();
                }
            }
        } catch (error) {
            console.error("Handle incoming event:", error);
        }
    }

    async #adminEventListener() {
        this.on(EventType.ADMIN_EVENT, async (parsedRequest, bufferedRequest) => {
            try {
                if (this.#enable_wallet === false) return;
                const isEventMessageValid =
                    await StateMessageOperations.verifyEventMessage(
                        parsedRequest,
                        this.#wallet,
                        this.check,
                        this.#state
                    );
                if (!isEventMessageValid) return;
                await this.#state.append(bufferedRequest);
            } catch (error) {
                console.error("ADMIN_EVENT:", error.message);
            }
        });
    }

    async #pickWriter() {
        const length = await this.#state.getWriterLength()
        for (var i = 0; i < length; i++) {
            const writerAddressBuffer = await this.#state.getWriterIndex(i);
            const writerAddressString = bufferToAddress(writerAddressBuffer)
            const validatorPublicKey = PeerWallet.decodeBech32m(writerAddressString).toString("hex");
            const isConnected = this.#network.isConnected(validatorPublicKey);

            if (validatorPublicKey && isConnected) {
                return validatorPublicKey
            }
        }
    }

    async #writerEventListener() {
        this.on(EventType.WRITER_EVENT, async (parsedRequest, bufferedRequest) => {
            try {
                if (this.#enable_wallet === false) return;
                const isEventMessageVerifed =
                    await StateMessageOperations.verifyEventMessage(
                        parsedRequest,
                        this.#wallet,
                        this.check,
                        this.#state
                    );
                if (!isEventMessageVerifed) return;
                await this.#state.append(bufferedRequest);
            } catch (error) {
                console.error("WRITER_EVENT:", error.message);
            }
        });
    }

    async #stateEventsListener() {
        this.#state.base.on(EventType.IS_INDEXER, () => {
            if (this.#state.listenerCount(EventType.WRITER_EVENT) > 0) {
                this.#state.removeAllListeners(EventType.WRITER_EVENT);
            }
            this.#shouldListenToWriterEvents = false;
            console.log("Current node is an indexer");
        });

        this.#state.base.on(EventType.IS_NON_INDEXER, async () => {
            // Prevent further actions if closing is in progress
            // The reason is that getNodeEntry is async and may cause issues if we will access state after closing
            if (this.#isClosing) return;

            // downgrate from indexer to non-indexer makes that node is writable
            const updatedNodeEntry = await this.#state.getNodeEntry(
                this.#wallet.address
            );
            const canEnableWriterEvents =
                updatedNodeEntry &&
                b4a.equals(updatedNodeEntry.wk, this.#state.writingKey) &&
                !this.#shouldListenToWriterEvents;

            if (canEnableWriterEvents) {
                this.#shouldListenToWriterEvents = true;
                this.#writerEventListener();
                console.log("Current node is writable");
            }
            console.log("Current node is not an indexer anymore");
        });

        this.#state.base.on(EventType.WRITABLE, async () => {
            const updatedNodeEntry = await this.#state.getNodeEntry(
                this.#wallet.address
            );
            const canEnableWriterEvents =
                updatedNodeEntry &&
                b4a.equals(updatedNodeEntry.wk, this.#state.writingKey) &&
                !this.#shouldListenToWriterEvents;

            if (canEnableWriterEvents) {
                this.#shouldListenToWriterEvents = true;
                this.#writerEventListener();
                console.log("Current node is writable");
            }
        });

        this.#state.base.on(EventType.UNWRITABLE, async () => {
            if (this.#enable_wallet === false) {
                console.log("Current node is unwritable");
                return;
            }
            const updatedNodeEntry = await this.#state.getNodeEntry(
                this.#wallet.address
            );
            const canDisableWriterEvents =
                updatedNodeEntry &&
                !updatedNodeEntry.isWriter &&
                this.#shouldListenToWriterEvents;

            if (canDisableWriterEvents) {
                this.removeAllListeners(EventType.WRITER_EVENT);
                this.#shouldListenToWriterEvents = false;
                console.log("Current node is unwritable");
            }
        });
    }

    async #handleAdminOperations(recovery = false) {
        if (this.#enable_wallet === false) {
            throw new Error("Can not initialize an admin - wallet is not enabled.");
        }
        const adminEntry = await this.#state.getAdminEntry();

        if (recovery === false) {
            if (adminEntry) {
                throw new Error("Can not initialize an admin - admin already exists.");
            }
            if (!this.#wallet) {
                throw new Error(
                    "Can not initialize an admin - wallet is not initialized."
                );
            }
            if (!this.#state.writingKey) {
                throw new Error(
                    "Can not initialize an admin - writing key is not initialized."
                );
            }
            if (!b4a.equals(this.#state.writingKey, this.#bootstrap)) {
                throw new Error(
                    "Can not initialize an admin - bootstrap is not equal to writing key."
                );
            }

            const addAdminMessage =
                await StateMessageOperations.assembleAddAdminMessage(
                    this.#wallet,
                    this.#state.writingKey
                );
            await this.#state.append(addAdminMessage);

            setTimeout(async () => {
                const updatedAdminEntry = await this.#state.getAdminEntry();
                if (
                    this.#isAdmin(updatedAdminEntry) &&
                    !this.#shouldListenToAdminEvents
                ) {
                    this.#shouldListenToAdminEvents = true;
                    this.#adminEventListener();
                }
            }, LISTENER_TIMEOUT);
            return;
        }

        if (!adminEntry) {
            throw new Error(
                "Can not perform recovery - admin has been not initialized."
            );
        }
        if (!this.#wallet) {
            throw new Error("Can not perform recovery - wallet is not initialized.");
        }
        if (adminEntry.address !== this.#wallet.address) {
            throw new Error("Can not perform recovery - you are not the admin.");
        }
        if (b4a.equals(this.#state.writingKey, adminEntry.wk)) {
            throw new Error(
                "Can not perform recovery - writer key condition is not met."
            );
        }

        const addAdminMessage =
            await StateMessageOperations.assembleAddAdminMessage(
                this.#wallet,
                this.#state.writingKey
            );
        const payloadForValidator = {
            op: "addAdmin",
            transactionPayload: addAdminMessage,
        };
        await this.#network.validator_stream.messenger.send(payloadForValidator);

        setTimeout(async () => {
            const updatedAdminEntry = await this.#state.getAdminEntry();
            if (
                this.#isAdmin(updatedAdminEntry) &&
                !this.#shouldListenToAdminEvents
            ) {
                this.#shouldListenToAdminEvents = true;
                this.#adminEventListener();
            }
        }, LISTENER_TIMEOUT);
    }

    async #handleWhitelistOperations() {
        if (this.#enable_wallet === false) {
            throw new Error("Cannot perform whitelisting - wallet is not enabled.");
        }

        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();

        if (!this.#isAdmin(adminEntry)) return;
        const assembledWhitelistMessages =
            await StateMessageOperations.assembleAppendWhitelistMessages(
                this.#wallet
            );
        if (!assembledWhitelistMessages) {
            throw new Error("No whitelisted messages to process.");
        }

        const totalElements = assembledWhitelistMessages.size;
        let processedCount = 0;

        for (const [address, encodedPayload] of assembledWhitelistMessages) {
            processedCount++;
            const isWhitelisted = await this.#state.isAddressWhitelisted(address);
            const correspondingPublicKey =
                PeerWallet.decodeBech32m(address).toString("hex");
            if (isWhitelisted) {
                console.error(`Public key ${address} is already whitelisted.`);
                console.log(
                    `Whitelist message skipped (${processedCount}/${totalElements})`
                );
                continue;
            }

            const whitelistedMessage = {
                op: "whitelisted",
                transactionPayload: encodedPayload,
            };

            await this.#state.append(encodedPayload);
            // timesleep and validate if it becomes whitelisted
            await this.#network.sendMessageToNode(
                correspondingPublicKey,
                whitelistedMessage
            );
            await sleep(WHITELIST_SLEEP_INTERVAL);
            console.log(
                `Whitelist message processed (${processedCount}/${totalElements})`
            );
        }
    }

    async #requestWriterRole(toAdd) {
        if (this.#enable_wallet === false) {
            throw new Error("Cannot request writer role - wallet is not enabled");
        }

        const adminEntry = await this.#state.getAdminEntry();
        const nodeEntry = await this.#state.getNodeEntry(this.#wallet.address);
        const isAlreadyWriter = !!(nodeEntry && nodeEntry.isWriter === true);

        if (toAdd) {
            if (isAlreadyWriter) {
                throw new Error(
                    "Cannot request writer role - state indicates you are already a writer"
                );
            }

            const isAllowedToRequestRole = await this.#isAllowedToRequestRole(
                adminEntry,
                nodeEntry
            );
            if (!isAllowedToRequestRole) {
                throw new Error(
                    "Cannot request writer role - node is not allowed to request this role"
                );
            }

            if (this.#state.isWritable()) {
                throw new Error(
                    "Cannot request writer role - internal state is already writable"
                );
            }

            const assembledMessage = {
                op: "addWriter",
                transactionPayload:
                    await StateMessageOperations.assembleAddWriterMessage(
                        this.#wallet,
                        this.#state.writingKey
                    ),
            };
            let dispatcher = await this.#pickWriter()
            console.log(dispatcher);

            if (dispatcher) {
                await this.#network.sendMessageToNode(dispatcher, assembledMessage);
            }
            return;
        }

        if (!isAlreadyWriter) {
            throw new Error("Cannot remove writer role - you are not a writer");
        }

        const assembledMessage = {
            op: "removeWriter",
            transactionPayload:
                await StateMessageOperations.assembleRemoveWriterMessage(
                    this.#wallet,
                    this.#state.writingKey
                ),
        };

        let dispatcher = await this.#pickWriter()
        if (dispatcher) {
            await this.#network.sendMessageToNode(dispatcher, assembledMessage);
        }
    }

    async #updateIndexerRole(address, toAdd) {
        if (this.#enable_wallet === false) {
            throw new Error(
                `Can not request indexer role for: ${address} - wallet is not enabled.`
            );
        }

        const adminEntry = await this.#state.getAdminEntry();

        if (!adminEntry) {
            throw new Error(
                `Can not request indexer role for: ${address} - admin entry has not been initialized.`
            );
        }

        if (!isAddressValid(address)) {
            throw new Error(
                `Can not request indexer role for: ${address} - invalid address.`
            );
        }

        if (!this.#isAdmin(adminEntry) && !this.#state.isWritable()) {
            throw new Error(
                `Can not request indexer role for: ${address} - You are not an admin or writer.`
            );
        }
        const nodeEntry = await this.#state.getNodeEntry(address);
        if (!nodeEntry) {
            throw new Error(
                `Can not request indexer role for: ${address} - node entry has not been not initialized.`
            );
        }

        const indexersEntry = await this.#state.getIndexersEntry();
        const indexerListHasAddress = await this.#state.isAddressInIndexersEntry(
            address,
            indexersEntry
        );

        if (toAdd) {
            if (indexerListHasAddress) {
                throw new Error(
                    `Cannot update indexer role for: ${address} - address is already in indexers list.`
                );
            }

            const canAddIndexer =
                nodeEntry.isWhitelisted &&
                nodeEntry.isWriter &&
                !nodeEntry.isIndexer &&
                !indexerListHasAddress;

            if (!canAddIndexer) {
                throw new Error(
                    `Can not request indexer role for: ${address} - node is not whitelisted, not a writer or already an indexer.`
                );
            }

            const assembledAddIndexerMessage =
                await StateMessageOperations.assembleAddIndexerMessage(
                    this.#wallet,
                    address
                );
            await this.#state.append(assembledAddIndexerMessage);
        } else {
            const canRemoveIndexer =
                !toAdd && nodeEntry.isIndexer && indexerListHasAddress;

            if (!canRemoveIndexer) {
                throw new Error(
                    `Can not remove indexer role for: ${address} - node is not an indexer or address is not in indexers list.`
                );
            }

            const assembledRemoveIndexer =
                await StateMessageOperations.assembleRemoveIndexerMessage(
                    this.#wallet,
                    address
                );
            await this.#state.append(assembledRemoveIndexer);
        }
    }

    async #banValidator(address) {
        if (this.#enable_wallet === false) {
            throw new Error(
                `Can not ban writer with address: ${address} - wallet is not enabled.`
            );
        }
        const adminEntry = await this.#state.getAdminEntry();

        if (!adminEntry) {
            throw new Error(
                `Can not ban writer with address: ${address} - admin entry has not been initialized.`
            );
        }

        if (!isAddressValid(address)) {
            throw new Error(
                `Can not ban writer with address:  ${address} - invalid address.`
            );
        }

        if (!this.#isAdmin(adminEntry)) {
            throw new Error(
                `Can not ban writer with address: ${address} - You are not an admin.`
            );
        }

        const isWhitelisted = await this.#state.isAddressWhitelisted(address);
        const nodeEntry = await this.#state.getNodeEntry(address);

        if (!isWhitelisted || null === nodeEntry || nodeEntry.isIndexer === true) {
            throw new Error(
                `Can not ban writer with address: ${address} - node is not whitelisted or is an indexer.`
            );
        }

        const assembledBanValidatorMessage =
            await StateMessageOperations.assembleBanWriterMessage(
                this.#wallet,
                address
            );
        await this.#state.append(assembledBanValidatorMessage);
    }

    async #deployBootstrap(externalBootstrap) {
        if (this.#enable_wallet === false) {
            throw new Error(
                "Can not perform bootstrap deployment - wallet is not enabled."
            );
        }

        if (!this.#wallet) {
            throw new Error(
                "Can not perform bootstrap deployment - wallet is not initialized."
            );
        }

        const adminEntry = await this.#state.getAdminEntry();

        if (!adminEntry) {
            throw new Error(
                `Can not perform bootstrap deployment - admin entry has not been initialized.`
            );
        }

        if (!externalBootstrap) {
            throw new Error(
                `Can not perform bootstrap deployment - external bootstrap is not provided.`
            );
        }

        if (!isHexString(externalBootstrap)) {
            throw new Error(
                `Can not perform bootstrap deployment - bootstrap is not a hex: ${externalBootstrap}`
            );
        }

        if (externalBootstrap.length !== BOOTSTRAP_HEXSTRING_LENGTH) {
            throw new Error(
                `Can not perform bootstrap deployment - bootstrap is not a hex: ${externalBootstrap}`
            );
        }
        const isAlreadyDeployed = await this.#state.getRegisteredBootstrapEntry(
            externalBootstrap
        );
        if (isAlreadyDeployed !== null) {
            throw new Error(
                `Can not perform bootstrap deployment - bootstrap ${externalBootstrap} is already deployed.`
            );
        }

        if (externalBootstrap === this.bootstrap.toString("hex")) {
            throw new Error(
                `Can not perform bootstrap deployment - bootstrap ${externalBootstrap} is equal to MSB bootstrap!`
            );
        }

        const payload =
            await PartialStateMessageOperations.assembleBootstrapDeployment(
                this.#wallet,
                externalBootstrap
            );
        await this.#network.validator_stream.messenger.send(payload);
    }

    async #handleAddIndexerOperation(address) {
        await this.#updateIndexerRole(address, true);
    }

    async #handleRemoveIndexerOperation(address) {
        await this.#updateIndexerRole(address, false);
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

    async #handleBootstrapDeploymentOperation(bootstrapHex) {
        await this.#deployBootstrap(bootstrapHex);
    }

    async interactiveMode() {
        if (this.#readline_instance === null) return;
        const rl = this.#readline_instance;

        printHelp();

        rl.on("line", async (input) => {
            try {
                await this.handleCommand(input.trim(), rl);
            } catch (err) {
                console.error(`${err}`);
            }
            rl.prompt();
        });

        rl.prompt();
    }

    async handleCommand(input, rl = null) {
        switch (input) {
            case "/help":
                printHelp();
                break;
            case "/exit":
                if (rl) rl.close();
                await this.close();
                break;
            case "/add_admin":
                await this.#handleAdminOperations();
                break;
            case "/add_admin --recovery":
                await this.#handleAdminOperations(true);
                break;
            case "/add_whitelist":
                await this.#handleWhitelistOperations();
                break;
            case "/add_writer":
                await this.#handleAddWriterOperation();
                break;
            case "/remove_writer":
                await this.#handleRemoveWriterOperation();
                break;
            case "/core":
                const admin = await this.#state.getAdminEntry();
                console.log(
                    "Admin:",
                    admin
                        ? {
                            address: admin.address,
                            writingKey: admin.wk.toString("hex"),
                        }
                        : null
                );
                const indexers = await this.#state.getIndexersEntry();
                const formattedIndexers = formatIndexersEntry(indexers);
                if (formattedIndexers.length === 0) {
                    console.log("Indexers: no indexers");
                } else {
                    console.log("Indexers:", formattedIndexers);
                }
                break;
            case "/stats":
                await verifyDag(
                    this.#state,
                    this.#network,
                    this.#wallet,
                    this.#state.writingKey,
                    this.#shouldListenToAdminEvents,
                    this.#shouldListenToWriterEvents
                );
                break;
            default:
                if (input.startsWith("/get_node_info")) {
                    const splitted = input.split(" ");
                    const address = splitted[1];
                    const nodeEntry = await this.#state.getNodeEntry(address);
                    if (nodeEntry) {
                        console.log("Node Entry:", {
                            WritingKey: nodeEntry.wk.toString("hex"),
                            IsWhitelisted: nodeEntry.isWhitelisted,
                            IsWriter: nodeEntry.isWriter,
                            IsIndexer: nodeEntry.isIndexer,
                        });
                    } else {
                        console.log("Node Entry not found for address:", address);
                    }
                } else if (input.startsWith("/add_indexer")) {
                    const splitted = input.split(" ");
                    const address = splitted[1];
                    await this.#handleAddIndexerOperation(address);
                } else if (input.startsWith("/remove_indexer")) {
                    const splitted = input.split(" ");
                    const address = splitted[1];
                    await this.#handleRemoveIndexerOperation(address);
                } else if (input.startsWith("/ban_writer")) {
                    const splitted = input.split(" ");
                    const address = splitted[1];
                    await this.#handleBanValidatorOperation(address);
                } else if (input.startsWith("/deployment")) {
                    const splitted = input.split(" ");
                    const bootstrap_to_deploy = splitted[1];
                    await this.#handleBootstrapDeploymentOperation(bootstrap_to_deploy);
                } else if (input.startsWith("/get_deployment")) {
                    const splitted = input.split(" ");
                    const bootstrapHex = splitted[1];
                    const txHash = await this.#state.getRegisteredBootstrapEntry(
                        bootstrapHex
                    );
                    if (txHash) {
                        console.log(
                            `Bootstrap deployed under transaction hash: ${txHash.toString(
                                "hex"
                            )}`
                        );
                        const payload = await this.#state.getSigned(txHash.toString("hex"));
                        if (payload) {
                            const decoded = safeDecodeApplyOperation(payload);
                            console.log("Decoded Bootstrap Deployment Payload:", decoded);
                        } else {
                            console.log(
                                `No payload found for transaction hash: ${txHash.toString(
                                    "hex"
                                )}`
                            );
                        }
                    } else {
                        console.log(`No deployment found for bootstrap: ${bootstrapHex}`);
                    }
                }
        }
        if (rl) rl.prompt();
    }
}

export default MainSettlementBus;
