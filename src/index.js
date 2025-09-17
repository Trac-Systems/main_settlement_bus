
/** @typedef {import('pear-interface')} */ /* global Pear */
import ReadyResource from "ready-resource";
import Corestore from "corestore";
import PeerWallet from "trac-wallet";
import b4a from "b4a";
import readline from "readline";
import tty from "tty";

import { sleep, getFormattedIndexersWithAddresses, isHexString, convertAdminCoreOperationPayloadToHex } from "./utils/helpers.js";
import { verifyDag, printHelp, printWalletInfo, get_tx_info, printBalance } from "./utils/cli.js";
import CompleteStateMessageOperations from "./messages/completeStateMessages/CompleteStateMessageOperations.js";
import { safeDecodeApplyOperation } from "./utils/protobuf/operationHelpers.js";
import { bufferToAddress, isAddressValid } from "./core/state/utils/address.js";
import Network from "./core/network/Network.js";
import Check from "./utils/check.js";
import State from "./core/state/State.js";
import PartialStateMessageOperations from "./messages/partialStateMessages/PartialStateMessageOperations.js";
import {
    EventType,
    WHITELIST_SLEEP_INTERVAL,
    BOOTSTRAP_HEXSTRING_LENGTH,
    EntryType,
} from "./utils/constants.js";
import partialStateMessageOperations from "./messages/partialStateMessages/PartialStateMessageOperations.js";
import { randomBytes } from "hypercore-crypto";
import { decimalStringToBigInt, bigIntTo16ByteBuffer, bufferToBigInt, bigIntToDecimalString } from "./utils/amountSerialization.js"
import { ZERO_WK } from "./utils/buffer.js";
//TODO create a MODULE which will separate logic responsible for role managment

export class MainSettlementBus extends ReadyResource {
    // internal attributes
    #stores_directory;
    #key_pair_path;
    #bootstrap;
    #channel;
    #store;
    #enable_wallet;
    #wallet;
    #network;
    #readline_instance;
    #enable_validator_observer;
    #enable_role_requester;
    #enable_auto_transaction_consent
    #state;
    #isClosing = false;
    #is_admin_mode;

    constructor(options = {}) {
        super();
        this.#stores_directory = options.stores_directory;
        this.#key_pair_path = `${this.#stores_directory}${options.store_name}/db/keypair.json`;
        this.#enable_wallet = options.enable_wallet !== false;
        this.enable_interactive_mode = options.enable_interactive_mode !== false;
        this.#is_admin_mode = options.store_name === 'admin';
        this.#enable_role_requester =
            options.enable_role_requester !== undefined
                ? options.enable_role_requester
                : false;
        this.#enable_validator_observer =
            options.enable_validator_observer !== undefined
                ? options.enable_validator_observer
                : true;
        this.#enable_auto_transaction_consent =
            options.enable_auto_transaction_consent !== undefined
                ? options.enable_auto_transaction_consent
                : false;
        this.#bootstrap = options.bootstrap
            ? b4a.from(options.bootstrap, "hex")
            : null;

        if (!options.channel) {
            throw new Error(
                "MainSettlementBus: Channel is required. Application cannot start without channel."
            );
        }

        this.#channel = b4a.alloc(32).fill(options.channel);
        this.#store = new Corestore(this.#stores_directory + options.store_name);
        this.#wallet = new PeerWallet(options);
        this.#readline_instance = null;

        if (this.enable_interactive_mode !== false) {
            try {
                this.#readline_instance = readline.createInterface({
                    input: new tty.ReadStream(0),
                    output: new tty.WriteStream(1),
                });
            } catch (e) {
            }
        }

        this.check = new Check();
        this.#state = new State(this.#store, this.bootstrap, this.#wallet, options);
        this.#network = new Network(this.#state, this.#channel, options);
    }

    get stores_directory() {
        return this.#stores_directory;
    }

    get key_pair_path() {
        return this.#key_pair_path;
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
                this.key_pair_path,
                this.#readline_instance
            );
            printWalletInfo(this.#wallet.address, this.#state.writingKey, this.#state, this.#enable_wallet);
        }

        await this.#network.replicate(
            this.#state,
            this.#store,
            this.#wallet,
        );

        //TODO: validator observer can't be awaited. In the future change logic to process events instead of loop?
        if (this.#enable_validator_observer) {
            this.#network.startValidatorObserver(this.#wallet.address);
        }

        const adminEntry = await this.#state.getAdminEntry();
        await this.#setUpRoleAutomatically(adminEntry);

        console.log(`isIndexer: ${this.#state.isIndexer()}`);
        console.log(`isWriter: ${this.#state.isWritable()}`);
        console.log("MSB Unsigned Length:", this.#state.getUnsignedLength());
        console.log("MSB Signed Length:", this.#state.getSignedLength());

        await printBalance(this.#wallet.address, this.#state, this.#enable_wallet);
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

    async broadcastPartialTransaction(partialTransactionPayload) {
        await this.#network.validator_stream.messenger.send(partialTransactionPayload);
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

    async #stateEventsListener() {
        this.#state.base.on(EventType.IS_INDEXER, () => {
            console.log("Current node is an indexer");
        });

        this.#state.base.on(EventType.IS_NON_INDEXER, async () => {
            // Prevent further actions if closing is in progress
            // The reason is that getNodeEntry is async and may cause issues if we will access state after closing
            if (this.#isClosing) return;
            console.log("Current node is not an indexer anymore");
        });

        this.#state.base.on(EventType.WRITABLE, async () => {
            console.log("Current node is writable");
        });

        this.#state.base.on(EventType.UNWRITABLE, async () => {
            if (this.#enable_wallet === false) {
                console.log("Current node is unwritable");
                return;
            }
            console.log("Current node is unwritable");
        });
    }
    async #handleAdminCreation() {
        if (this.#enable_wallet === false) {
            throw new Error("Can not initialize an admin - wallet is not enabled.");
        }
        const adminEntry = await this.#state.getAdminEntry();

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

        await this.#state.append(null); // before initialization system.indexers is empty, we need to initialize first block to create system.indexers array
        const txValidity = await this.#state.getIndexerSequenceState();
        const addAdminMessage = await CompleteStateMessageOperations.assembleAddAdminMessage(
            this.#wallet,
            this.#state.writingKey,
            txValidity
        );

        await this.#state.append(addAdminMessage);
    }
    async #handleAdminRecovery() {
        if (this.#enable_wallet === false) {
            throw new Error("Can not initialize an admin - wallet is not enabled.");
        }
        const adminEntry = await this.#state.getAdminEntry();

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

        const txValidity = await this.#state.getIndexerSequenceState();
        const adminRecoveryMessage = await partialStateMessageOperations.assembleAdminRecoveryMessage(
            this.#wallet,
            this.#state.writingKey.toString('hex'),
            txValidity.toString('hex')
        );

        await this.broadcastPartialTransaction(adminRecoveryMessage);
    }

    async #handleWhitelistOperations() {
        if (this.#enable_wallet === false) {
            throw new Error("Cannot perform whitelisting - wallet is not enabled.");
        }

        if (this.#enable_wallet === false) return;
        const adminEntry = await this.#state.getAdminEntry();

        if (!this.#isAdmin(adminEntry)) {
            throw new Error('Cannot perform whitelisting - you are not the admin!.');
        }

        const txValidity = await this.#state.getIndexerSequenceState();
        const assembledWhitelistMessages = await CompleteStateMessageOperations.assembleAppendWhitelistMessages(
            this.#wallet,
            txValidity
        );
        if (!assembledWhitelistMessages) {
            throw new Error("No whitelisted messages to process.");
        }

        const totalElements = assembledWhitelistMessages.size;
        let processedCount = 0;

        for (const [address, encodedPayload] of assembledWhitelistMessages) {
            processedCount++;
            const isWhitelisted = await this.#state.isAddressWhitelisted(address);
            const correspondingPublicKey = PeerWallet.decodeBech32m(address).toString("hex");
            if (isWhitelisted) {
                console.error(`Public key ${address} is already whitelisted.`);
                console.log(
                    `Whitelist message skipped (${processedCount}/${totalElements})`
                );
                continue;
            }

            await this.#state.append(encodedPayload);
            // timesleep and validate if it becomes whitelisted
            // if node is not active we should not wait to long...
            await this.#network.sendMessageToNode(
                correspondingPublicKey,
                convertAdminCoreOperationPayloadToHex(safeDecodeApplyOperation(encodedPayload))
            )
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
            const txValidity = await this.#state.getIndexerSequenceState();
            const assembledMessage = await PartialStateMessageOperations.assembleAddWriterMessage(
                this.#wallet,
                this.#state.writingKey.toString('hex'),
                txValidity.toString('hex')
            )

            await this.broadcastPartialTransaction(assembledMessage);
            return;
        }

        if (!isAlreadyWriter) {
            throw new Error("Cannot remove writer role - you are not a writer");
        }

        if (nodeEntry.isIndexer === true) {
            throw new Error("Cannot remove writer role - node is an indexer");
        }



        const txValidity = await this.#state.getIndexerSequenceState();
        const assembledMessage = await PartialStateMessageOperations.assembleRemoveWriterMessage(
            this.#wallet,
            this.#state.writingKey.toString('hex'),
            txValidity.toString('hex')
        )

        await this.broadcastPartialTransaction(assembledMessage);
        return;
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

        const indexerNodeEntry = await this.#state.getNodeEntry(address);
        const indexerListHasAddress = await this.#state.isWkInIndexersEntry(
            indexerNodeEntry.wk,
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
            const txValidity = await this.#state.getIndexerSequenceState();
            const assembledAddIndexerMessage = await CompleteStateMessageOperations.assembleAddIndexerMessage(this.#wallet, address, txValidity);
            await this.#state.append(assembledAddIndexerMessage);
        } else {
            const canRemoveIndexer =
                !toAdd && nodeEntry.isIndexer && indexerListHasAddress;

            if (!canRemoveIndexer) {
                throw new Error(
                    `Can not remove indexer role for: ${address} - node is not an indexer or address is not in indexers list.`
                );
            }
            const txValidity = await this.#state.getIndexerSequenceState();
            const assembledRemoveIndexer = await CompleteStateMessageOperations.assembleRemoveIndexerMessage(this.#wallet, address, txValidity);
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
        const txValidity = await this.#state.getIndexerSequenceState();
        const assembledBanValidatorMessage = await CompleteStateMessageOperations.assembleBanWriterMessage(
            this.#wallet,
            address,
            txValidity
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
        const isAlreadyDeployed = await this.#state.getRegisteredBootstrapEntry(externalBootstrap);
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
        const txValidity = await this.#state.getIndexerSequenceState();
        const payload = await PartialStateMessageOperations.assembleBootstrapDeploymentMessage(
            this.#wallet,
            externalBootstrap,
            txValidity.toString('hex')
        );
        await this.broadcastPartialTransaction(payload);

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

    async #handleTransferOperation(address, amount) {
        if (this.#enable_wallet === false) {
            throw new Error(
                "Can not perform transfer - wallet is not enabled."
            );
        }

        if (!this.#wallet) {
            throw new Error(
                "Can not perform transfer - wallet is not initialized."
            );
        }

        if (!isAddressValid(address)) {
            throw new Error("Invalid recipient address");
        }

        const amountBigInt = decimalStringToBigInt(amount);

        const MAX_AMOUNT = BigInt('0xffffffffffffffffffffffffffffffff');
        if (amountBigInt > MAX_AMOUNT) {
            throw new Error("Transfer amount exceeds maximum allowed value");
        }

        const amountBuffer = bigIntTo16ByteBuffer(amountBigInt);

        if (bufferToBigInt(amountBuffer) !== amountBigInt) {
            throw new Error(`conversion error for amount: ${amount}`);
        }

        const senderEntry = await this.#state.getNodeEntry(this.#wallet.address);
        if (!senderEntry) {
            throw new Error("Sender account not found");
        }

        const fee = await this.#state.getFee();
        const feeBigInt = bufferToBigInt(fee);
        const senderBalance = bufferToBigInt(senderEntry.balance);
        const isSelfTransfer = address === this.#wallet.address;
        const totalDeductedAmount = isSelfTransfer ? feeBigInt : amountBigInt + feeBigInt;

        if (!(senderBalance >= totalDeductedAmount)) {
            throw new Error("Insufficient balance for transfer + fee");
        }

        const txValidity = await this.#state.getIndexerSequenceState();
        const payload = await PartialStateMessageOperations.assembleTransferOperationMessage(
            this.#wallet,
            address,
            amountBuffer.toString('hex'),
            txValidity.toString('hex'),
        )
        await this.broadcastPartialTransaction(payload);

        const expectedNewBalance = senderBalance - totalDeductedAmount;
        console.log('Transfer Details:');
        if (isSelfTransfer) {
            console.log('Self transfer - only fee will be deducted');
            console.log(`Fee: ${bigIntToDecimalString(feeBigInt)}`);
            console.log(`Total amount to send: ${bigIntToDecimalString(totalDeductedAmount)}`);
        } else {
            console.log(`Amount: ${bigIntToDecimalString(amountBigInt)}`);
            console.log(`Fee: ${bigIntToDecimalString(feeBigInt)}`);
            console.log(`Total: ${bigIntToDecimalString(totalDeductedAmount)}`);
        }
        console.log(`Expected Balance After Transfer: ${bigIntToDecimalString(expectedNewBalance)}`);
    }

    async #handleBalanceMigrationOperation() {

        const isInitDisabled = await this.#state.isInitalizationDisabled()

        if (isInitDisabled) {
            throw new Error("Can not initialize balance - balance initialization is disabled.");
        }

        if (this.#enable_wallet === false) {
            throw new Error("Can not initialize an admin - wallet is not enabled.");
        }
        const adminEntry = await this.#state.getAdminEntry();

        if (!adminEntry) {
            throw new Error("Can not initialize an admin - admin does not exist.");
        }

        if (!this.#isAdmin(adminEntry)) {
            throw new Error('Cannot perform whitelisting - you are not the admin!.');
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

        const txValidity = await this.#state.getIndexerSequenceState();
        const { messages, totalBalance, totalAddresses, addresses } = await CompleteStateMessageOperations.assembleBalanceInitializationMessages(
            this.#wallet,
            txValidity
        );
        console.log(`Total balance to migrate: ${bigIntToDecimalString(totalBalance)} across ${totalAddresses} addresses.`);

        if (messages.length === 0) {
            throw new Error("No balance migration messages to process.");
        }
        console.log("Starting BRC20 $TRAC TO $TNK native migration...");
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            console.log(`Processing message ${i + 1} of ${messages.length}...`);
            await this.#state.append(message);
            await sleep(WHITELIST_SLEEP_INTERVAL);
        }

        await sleep(WHITELIST_SLEEP_INTERVAL);

        let allBalancesMigrated = true;
        for (let i = 0; i < addresses.length; i++) {
            const entry = await this.#state.getNodeEntry(addresses[i].address);
            const expectedBalance = addresses[i].parsedBalance;
            const amountBigInt = bufferToBigInt(entry.balance);
            if (amountBigInt !== expectedBalance) {
                allBalancesMigrated = false
                console.log(`Balance of ${expectedBalance} failed to migrate to address: ${addresses[i].address}, ${addresses[i].parsedBalance}`);
                break
            }
        }

        console.log("Balance migration successful: ", allBalancesMigrated);
    }

    async #disableInitialization() {
        if (this.#enable_wallet === false) {
            throw new Error("Can not initialize an admin - wallet is not enabled.");
        }
        const adminEntry = await this.#state.getAdminEntry();

        if (!adminEntry) {
            throw new Error("Can not initialize an admin - admin does not exist.");
        }

        if (!this.#isAdmin(adminEntry)) {
            throw new Error('Cannot perform whitelisting - you are not the admin!.');
        }
        // add more checks
        const txValidity = await this.#state.getIndexerSequenceState();
        const payload = await CompleteStateMessageOperations.assembleDisableInitializationMessage(
            this.#wallet,
            this.#state.writingKey,
            txValidity,
        )
        console.log('Disabling initialization...');
        await this.#state.append(payload);
    }

    async interactiveMode() {
        if (this.#readline_instance === null) return;
        const rl = this.#readline_instance;

        printHelp(this.#is_admin_mode);

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
                printHelp(this.#is_admin_mode);
                break;
            case "/exit":
                if (rl) rl.close();
                await this.close();
                break;
            case "/add_admin":
                await this.#handleAdminCreation();
                break;
            case "/add_admin --recovery":
                await this.#handleAdminRecovery();
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
                console.log("Admin:", admin ? {
                    address: admin.address,
                    writingKey: admin.wk.toString("hex")
                } : null);
                const formattedIndexers = await getFormattedIndexersWithAddresses(this.#state);
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
                );
                break;
            
            // DELETE BEFORE DEPLOYMENT /TEST
            case '/test':
                const contentHash = randomBytes(32).toString('hex');
                const randomExternalBootstrap = "5adb970a73e20e8e2e896cd0c30cf025a0b32ec6fe026b98c6714115239607ac"
                const randomWk = randomBytes(32).toString('hex');
                const txValidity = await this.#state.getIndexerSequenceState();
                const msbBootstrap = this.bootstrap.toString('hex');
                const assembledTransactionOperation = await PartialStateMessageOperations.assembleTransactionOperationMessage(
                    this.#wallet,
                    randomWk,
                    txValidity.toString('hex'),
                    contentHash,
                    randomExternalBootstrap,
                    msbBootstrap
                )
                await this.broadcastPartialTransaction(assembledTransactionOperation);

                break;
            case '/balance_migration':
                await this.#handleBalanceMigrationOperation();
                break;
            case '/disable_initialization':
                await this.#disableInitialization();
                break;
            default:
                if (input.startsWith('/get_node_info')) {
                    const splitted = input.split(' ')
                    const address = splitted[1]
                    const nodeEntry = await this.#state.getNodeEntry(address)
                    if (nodeEntry) {
                        console.log('Node Entry:', {
                            WritingKey: nodeEntry.wk.toString('hex'),
                            IsWhitelisted: nodeEntry.isWhitelisted,
                            IsWriter: nodeEntry.isWriter,
                            IsIndexer: nodeEntry.isIndexer,
                            balance: bigIntToDecimalString(bufferToBigInt(nodeEntry.balance))
                        })
                        return {
                            WritingKey: nodeEntry.wk.toString('hex'),
                            IsWhitelisted: nodeEntry.isWhitelisted,
                            IsWriter: nodeEntry.isWriter,
                            IsIndexer: nodeEntry.isIndexer,
                            balance: bigIntToDecimalString(bufferToBigInt(nodeEntry.balance))
                        }
                    } else {
                        console.log('Node Entry:', {
                            WritingKey: ZERO_WK.toString('hex'),
                            IsWhitelisted: false,
                            IsWriter: false,
                            IsIndexer: false,
                            balance: bigIntToDecimalString(0n)
                        })
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
                }
                else if (input.startsWith("/get_validator_addr")) {
                    const splitted = input.split(" ");
                    const wkHexString = splitted[1];
                    const payload = await this.#state.getSigned(EntryType.WRITER_ADDRESS + wkHexString);
                    console.log(`Address assigned to the writer key: ${wkHexString} - ${bufferToAddress(payload)}`)
                }
                else if (input.startsWith("/get_deployment")) {
                    const splitted = input.split(" ");
                    const bootstrapHex = splitted[1];
                    const deploymentEntry = await this.#state.getRegisteredBootstrapEntry(bootstrapHex);

                    if (deploymentEntry) {
                        const decodedDeploymentEntry = deploymentEntryUtils.decode(deploymentEntry)
                        const txhash = decodedDeploymentEntry.txHash.toString('hex');
                        console.log(`Bootstrap deployed under transaction hash: ${txhash}`);
                        const payload = await this.#state.getSigned(txhash);
                        if (payload) {
                            const decoded = safeDecodeApplyOperation(payload);
                            console.log('Decoded Bootstrap Deployment Payload:', decoded);
                        } else {
                            console.log(`No payload found for transaction hash: ${txhash}`);
                        }
                    } else {
                        console.log(`No deployment found for bootstrap: ${bootstrapHex}`);
                    }
                } else if (input.startsWith("/get_tx_info")) {
                    const splitted = input.split(" ");
                    const txHash = splitted[1];
                    const payload = await get_tx_info(this.#state, txHash);
                    if (payload) {
                        console.log(`Payload for transaction hash ${txHash}:`, payload);
                    } else {
                        console.log(`No information found for transaction hash: ${txHash}`);
                    }
                } else if (input.startsWith("/transfer")) {
                    const splitted = input.split(" ");
                    const address = splitted[1];
                    const amount = splitted[2];
                    await this.#handleTransferOperation(address, amount);
                } else if (input.startsWith("/get_txv")) {
                    const txv = await this.#state.getIndexerSequenceState();
                    console.log('Current TXV:', txv.toString('hex'));
                    return txv
                } else if (input.startsWith("/get_fee")) {
                    const fee = this.#state.getFee();
                    console.log('Current FEE:', bigIntToDecimalString(bufferToBigInt(fee)));
                    return bigIntToDecimalString(bufferToBigInt(fee))
                } else if (input.startsWith("/confirmed_length")) {
                    const confirmed_length = this.#state.getSignedLength();
                    console.log('Confirmed_length:', confirmed_length);
                    return confirmed_length
                }


        }
        if (rl) rl.prompt();
    }
}

export default MainSettlementBus;
