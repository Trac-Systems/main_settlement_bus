import { randomBytes } from "hypercore-crypto";
import _ from "lodash";
import { Handlers } from "./handlers.js";
import { isHexString } from "../src/utils/helpers.js";
import { bigIntToDecimalString } from "../src/utils/amountSerialization.js";
import {
    MAX_VDF_DIFFICULTY,
    MAX_VDF_DISCRIMINANT_BIT_SIZE
} from "../src/utils/constants.js";

const OPERATIONS = {
    CONFIRMATION: "confirmation",
    GENESIS_DIFFICULTY: "genesis-difficulty",
    GENESIS_DISCRIMINANT_BIT_SIZE: "genesis-discriminant-bit-size",
    CONSENSUS_CONFIG: "consensus-config",
    VDF_DIFFICULTY: "vdf-difficulty",
    VDF_DISCRIMINANT_BIT_SIZE: "vdf-discriminant-bit-size",
    GENESIS_PREFIX: "genesis-",
    VDF_PREFIX: "vdf-"
};

export const COMMANDS = {
    HELP: "/help",
    EXIT: "/exit",
    ADD_ADMIN: "/add_admin",
    ADD_ADMIN_RECOVERY: "/add_admin --recovery",
    ADD_WHITELIST: "/add_whitelist",
    ADD_WRITER: "/add_writer",
    REMOVE_WRITER: "/remove_writer",
    CORE: "/core",
    INDEXERS_LIST: "/indexers_list",
    VALIDATOR_POOL: "/validator_pool",
    INDEXER_POOL: "/indexer_pool",
    STATS: "/stats",
    BALANCE_MIGRATION: "/balance_migration",
    DISABLE_INITIALIZATION: "/disable_initialization",
    NODE_STATUS: "/node_status",
    ADD_INDEXER: "/add_indexer",
    REMOVE_INDEXER: "/remove_indexer",
    BAN_WRITER: "/ban_writer",
    DEPLOYMENT: "/deployment",
    GET_VALIDATOR_ADDR: "/get_validator_addr",
    GET_DEPLOYMENT: "/get_deployment",
    GET_TX_INFO: "/get_tx_info",
    TRANSFER: "/transfer",
    GET_BALANCE: "/get_balance",
    GET_LICENSE_NUMBER: "/get_license_number",
    GET_LICENSE_ADDRESS: "/get_license_address",
    GET_LICENSE_COUNT: "/get_license_count",
    GET_TXV: "/get_txv",
    GET_FEE: "/get_fee",
    CONFIRMED_LENGTH: "/confirmed_length",
    UNCONFIRMED_LENGTH: "/unconfirmed_length",
    GET_TXS_HASHES: "/get_txs_hashes",
    GET_TX_DETAILS: "/get_tx_details",
    GET_EXTENDED_TX_DETAILS: "/get_extended_tx_details",
    EPOCH_GENESIS_INITIALIZATION: "/init_genesis",
    SET_CONSENSUS_CONFIG: "/set_consensus_config",
    SET_VDF_PARAMS: "/set_vdf_params"
};

export class CommandHandler {
    #msb;
    #closeCli;
    #wallet;
    #handlers;

    constructor({ config, msb, handleClose, wallet }) {
        this.#msb = msb;
        this.#closeCli = handleClose;
        this.#wallet = wallet;
        this.#handlers = new Handlers(msb, config);
    }

    async handle(input, context) {
        const [command, ...parts] = input.split(" ");
        const handlerContext = { command, input, parts, context };
        const handlers = this.#getHandlers();
        const handler = handlers.find(({ evaluate }) => evaluate(handlerContext));

        if (handler) {
            return handler.process(handlerContext);
        }
    }

    #getHandlers() {
        return [
            {
                evaluate: ({ context }) => context.pending?.op === OPERATIONS.CONFIRMATION,
                process: async ({ input, context }) => this.#handlePendingConfirmation(input, context)
            },
            {
                evaluate: ({ context }) => context.pending?.op.startsWith(OPERATIONS.GENESIS_PREFIX),
                process: async ({ input, context }) => this.#handlePendingGenesisInitialization(input, context)
            },
            {
                evaluate: ({ context }) => context.pending?.op === OPERATIONS.CONSENSUS_CONFIG,
                process: async ({ input, context }) => this.#handlePendingSetConsensusConfig(input, context)
            },
            {
                evaluate: ({ context }) => context.pending?.op.startsWith(OPERATIONS.VDF_PREFIX),
                process: async ({ input, context }) => this.#handlePendingSetVdfParams(input, context)
            },
            {
                evaluate: ({ command }) => command === COMMANDS.HELP,
                process: async () => {
                    this.#msb.printHelp();
                }
            },
            {
                evaluate: ({ command }) => command === COMMANDS.EXIT,
                process: async () => {
                    await this.#closeCli();
                    await this.#msb.close();
                }
            },
            {
                evaluate: ({ input }) => input === COMMANDS.ADD_ADMIN_RECOVERY,
                process: async () => this.#msb.handleAdminRecovery()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.ADD_ADMIN,
                process: async () => this.#msb.handleAdminCreation()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.ADD_WHITELIST,
                process: async () => this.#msb.handleWhitelistOperations()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.ADD_WRITER,
                process: async () => this.#msb.requestWriterRole(true)
            },
            {
                evaluate: ({ command }) => command === COMMANDS.REMOVE_WRITER,
                process: async () => this.#msb.requestWriterRole(false)
            },
            {
                evaluate: ({ command }) => command === COMMANDS.CORE,
                process: async () => this.#handlers.handleCoreInfo()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.INDEXERS_LIST,
                process: async () => console.log(await this.#msb.state.getIndexersEntry())
            },
            {
                evaluate: ({ command }) => command === COMMANDS.VALIDATOR_POOL,
                process: async () => this.#msb.network.validatorConnectionManager.prettyPrint()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.INDEXER_POOL,
                process: async () => this.#msb.network.indexerConnectionManager.prettyPrint()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.STATS,
                process: async () => this.#msb.verifyDag()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.BALANCE_MIGRATION,
                process: async () => this.#msb.balanceMigrationOperation()
            },
            {
                evaluate: ({ command }) => command === COMMANDS.DISABLE_INITIALIZATION,
                process: async () => this.#msb.disableInitialization()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.NODE_STATUS),
                process: async ({ parts }) => this.#handlers.handleNodeStatus(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.ADD_INDEXER),
                process: async ({ parts }) => this.#msb.updateWriterToIndexerRole(parts[0], true)
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.REMOVE_INDEXER),
                process: async ({ parts }) => this.#msb.updateWriterToIndexerRole(parts[0], false)
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.BAN_WRITER),
                process: async ({ parts }) => this.#msb.banValidator(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.DEPLOYMENT),
                process: async ({ parts }) => {
                    const channel = parts[1] || randomBytes(32).toString("hex");
                    if (!isHexString(channel, 64)) {
                        throw new Error("Channel must be a 32-byte hex string");
                    }
                    return this.#msb.deployBootstrap(parts[0], channel);
                }
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_VALIDATOR_ADDR),
                process: async ({ parts }) => this.#handlers.handleValidatorAddress(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_DEPLOYMENT),
                process: async ({ parts }) => this.#handlers.handleDeployment(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_TX_INFO),
                process: async ({ parts }) => this.#handlers.handleTxInfo(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.TRANSFER),
                process: async ({ parts, context }) => this.#queueTransferConfirmation(parts[0], parts[1], context)
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_BALANCE),
                process: async ({ parts }) => this.#handlers.handleBalance(parts[0] || this.#wallet?.address, parts[1])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_LICENSE_NUMBER),
                process: async ({ parts }) => this.#handlers.handleLicenseNumber(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_LICENSE_ADDRESS),
                process: async ({ parts }) => this.#handlers.handleLicenseAddress(parseInt(parts[0]))
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_LICENSE_COUNT),
                process: async () => this.#handlers.handleLicenseCount()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_TXV),
                process: async () => this.#handlers.handleTxv()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_FEE),
                process: async () => this.#handlers.handleFee()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.CONFIRMED_LENGTH),
                process: async () => this.#handlers.handleConfirmedLength()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.UNCONFIRMED_LENGTH),
                process: async () => this.#handlers.handleUnconfirmedLength()
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_TXS_HASHES),
                process: async ({ parts }) => this.#handlers.handleTxHashes(
                    parseInt(parts[0]),
                    parseInt(parts[1])
                )
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_TX_DETAILS),
                process: async ({ parts }) => this.#handlers.handleTxDetails(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.GET_EXTENDED_TX_DETAILS),
                process: async ({ parts }) => this.#handlers.handleExtendedTxDetails(parts[0], parts[1] === "true")
            },
            {
                evaluate: ({ input }) => input.startsWith(COMMANDS.EPOCH_GENESIS_INITIALIZATION),
                process: async ({ context }) => this.#queueEpochGenesisInitialization(context)
            },
            {
                evaluate: ({ command }) => command === COMMANDS.SET_CONSENSUS_CONFIG,
                process: async ({ context }) => this.#queueSetConsensusConfig(context)
            },
            {
                evaluate: ({ command }) => command === COMMANDS.SET_VDF_PARAMS,
                process: async ({ context }) => this.#queueSetVdfParams(context)
            }
        ];
    }

    async #handlePendingConfirmation(input, context) {
        const normalizedInput = input.trim().toLowerCase();
        const pendingConfirmation = context.pending;

        if (normalizedInput === "y" || normalizedInput === "yes") {
            context.pending = null;

            try {
                return await pendingConfirmation.onConfirm();
            } catch (error) {
                const errorMessage = typeof error === "object" && error !== null && "message" in error
                    ? error.message
                    : `${error}`;
                const failureMessage = pendingConfirmation.failureMessage || "Transaction submission failed";
                console.error(`${failureMessage}: ${errorMessage}`);
                console.log("Try again or use /help.");
            }

            return;
        }

        if (normalizedInput === "n" || normalizedInput === "no") {
            context.pending = null;
            return pendingConfirmation.onDecline();
        }

        console.log(pendingConfirmation.invalidMessage || 'Invalid input. Please answer "y" or "n".');
        console.log(pendingConfirmation.prompt);
    }

    async #queueTransferConfirmation(recipientAddress, amount, context) {
        const preparedTransfer = await this.#msb.prepareTransferOperation(recipientAddress, amount);

        console.info("Transfer Details:");
        if (preparedTransfer.isSelfTransfer) {
            console.info("Self transfer - only fee will be deducted");
        }
        console.info(`Amount: ${bigIntToDecimalString(preparedTransfer.amountBigInt)}`);
        console.info(`Estimated transaction fee: ${bigIntToDecimalString(preparedTransfer.feeBigInt)}`);
        console.info(`Total transaction cost: ${bigIntToDecimalString(preparedTransfer.totalDeductedAmount)}`);
        console.info(`Current balance: ${bigIntToDecimalString(preparedTransfer.senderBalance)}`);
        console.info(`Balance after transaction: ${bigIntToDecimalString(preparedTransfer.expectedNewBalance)}`);

        context.pending = {
            op: OPERATIONS.CONFIRMATION,
            prompt: "Do you want to proceed? (y/n)",
            onConfirm: async () => this.#msb.submitPreparedTransferOperation(preparedTransfer),
            onDecline: async () => this.#msb.printHelp()
        };

        console.log(context.pending.prompt);
    }

    #queueEpochGenesisInitialization(context) {
        context.pending = {
            op: OPERATIONS.GENESIS_DIFFICULTY
        };

        console.log(this.#getGenesisDifficultyPrompt());
    }

    #handlePendingGenesisInitialization(input, context) {
        const pendingGenesisInitialization = context.pending;

        if (pendingGenesisInitialization.op === OPERATIONS.GENESIS_DIFFICULTY) {
            const difficulty = this.#parsePositiveInteger(input, BigInt(MAX_VDF_DIFFICULTY));
            if (!difficulty) {
                console.log("Invalid difficulty. Please enter a positive integer (example 55_000_000).");
                console.log(this.#getGenesisDifficultyPrompt());
                return;
            }

            pendingGenesisInitialization.difficulty = difficulty;
            pendingGenesisInitialization.op = OPERATIONS.GENESIS_DISCRIMINANT_BIT_SIZE;
            console.log(this.#getGenesisDiscriminantBitSizePrompt());
            return;
        }

        const discriminantBitSize = this.#parsePositiveInteger(input, BigInt(MAX_VDF_DISCRIMINANT_BIT_SIZE));
        if (!discriminantBitSize) {
            console.log("Invalid discriminant bit size. Please enter a positive integer (example 2048).");
            console.log(this.#getGenesisDiscriminantBitSizePrompt());
            return;
        }

        const difficulty = pendingGenesisInitialization.difficulty;
        context.pending = null;

        return this.#queueEpochGenesisConfirmation({
            difficulty,
            discriminantBitSize
        }, context);
    }

    #queueEpochGenesisConfirmation({ difficulty, discriminantBitSize }, context) {
        const consensusConfig = {
            schemaVersion: 1,
            configData: {
                difficulty: Number(difficulty.value),
                discriminantBitSize: Number(discriminantBitSize.value)
            }
        };

        console.info("Genesis Epoch Initialization Parameters:");
        console.info(`VDF difficulty: ${difficulty.display}`);
        console.info(`VDF discriminant bit size: ${discriminantBitSize.display}`);

        context.pending = {
            op: OPERATIONS.CONFIRMATION,
            prompt: "Do you want to proceed? (yes/no)",
            invalidMessage: 'Invalid input. Please answer "yes" or "no".',
            failureMessage: "Genesis epoch initialization failed",
            onConfirm: async () => this.#handlers.handleEpochGenesisInitialization(consensusConfig),
            onDecline: async () => console.log("Genesis epoch initialization cancelled.")
        };

        console.log(context.pending.prompt);
    }

    #queueSetConsensusConfig(context) {
        context.pending = { op: OPERATIONS.CONSENSUS_CONFIG };

        console.log(this.#getSetConsensusConfigPrompt());
    }

    #handlePendingSetConsensusConfig(input, context) {
        if (input.trim().toLowerCase() === "/cancel") {
            context.pending = null;
            console.log("Consensus config update cancelled.");
            return;
        }

        const consensusConfig = this.#parseConsensusConfig(input);
        if (!consensusConfig) {
            console.log(
                'Invalid consensus config. Please enter a JSON object containing only "schemaVersion" and "configData".'
            );
            console.log(this.#getSetConsensusConfigPrompt());
            return;
        }

        context.pending = null;
        return this.#queueSetConsensusConfigConfirmation(consensusConfig, context);
    }

    #queueSetConsensusConfigConfirmation(consensusConfig, context) {
        console.info("Consensus Config Update:");
        console.info(JSON.stringify(consensusConfig, null, 2));

        context.pending = {
            op: OPERATIONS.CONFIRMATION,
            prompt: "Do you want to proceed? (yes/no)",
            invalidMessage: 'Invalid input. Please answer "yes" or "no".',
            failureMessage: "Consensus config update failed",
            onConfirm: async () => this.#handlers.handleSetConsensusConfig(consensusConfig),
            onDecline: async () => console.log("Consensus config update cancelled.")
        };

        console.log(context.pending.prompt);
    }

    #queueSetVdfParams(context) {
        context.pending = {
            op: OPERATIONS.VDF_DIFFICULTY
        };

        console.log(this.#getSetVdfParamsDifficultyPrompt());
    }

    #handlePendingSetVdfParams(input, context) {
        if (input.trim().toLowerCase() === "/cancel") {
            context.pending = null;
            console.log("VDF params update cancelled.");
            return;
        }

        const pendingSetVdfParams = context.pending;

        if (pendingSetVdfParams.op === OPERATIONS.VDF_DIFFICULTY) {
            const difficulty = this.#parsePositiveInteger(input, BigInt(MAX_VDF_DIFFICULTY));
            if (!difficulty) {
                console.log(
                    "Invalid difficulty. Please enter an integer between 1 and 4_294_967_295."
                );
                console.log(this.#getSetVdfParamsDifficultyPrompt());
                return;
            }

            pendingSetVdfParams.difficulty = difficulty;
            pendingSetVdfParams.op = OPERATIONS.VDF_DISCRIMINANT_BIT_SIZE;
            console.log(this.#getSetVdfParamsDiscriminantBitSizePrompt());
            return;
        }

        const discriminantBitSize = this.#parsePositiveInteger(input, BigInt(MAX_VDF_DISCRIMINANT_BIT_SIZE));
        if (!discriminantBitSize) {
            console.log(
                "Invalid discriminant bit size. Please enter an integer between 1 and 65_535."
            );
            console.log(this.#getSetVdfParamsDiscriminantBitSizePrompt());
            return;
        }

        const difficulty = pendingSetVdfParams.difficulty;
        context.pending = null;
        return this.#queueSetVdfParamsConfirmation({
            difficulty,
            discriminantBitSize
        }, context);
    }

    #queueSetVdfParamsConfirmation({ difficulty, discriminantBitSize }, context) {
        const consensusConfig = {
            schemaVersion: 1,
            configData: {
                difficulty: Number(difficulty.value),
                discriminantBitSize: Number(discriminantBitSize.value)
            }
        };

        console.info("VDF Params Update:");
        console.info(`VDF difficulty: ${difficulty.display}`);
        console.info(`VDF discriminant bit size: ${discriminantBitSize.display}`);

        context.pending = {
            op: OPERATIONS.CONFIRMATION,
            prompt: "Do you want to proceed? (yes/no)",
            invalidMessage: 'Invalid input. Please answer "yes" or "no".',
            failureMessage: "VDF params update failed",
            onConfirm: async () => this.#handlers.handleSetConsensusConfig(consensusConfig),
            onDecline: async () => console.log("VDF params update cancelled.")
        };

        console.log(context.pending.prompt);
    }

    #parseConsensusConfig(input) {
        try {
            const parsed = JSON.parse(input);
            if (
                !_.isPlainObject(parsed) ||
                Object.keys(parsed).length !== 2 ||
                !Object.hasOwn(parsed, "schemaVersion") ||
                !Object.hasOwn(parsed, "configData")
            ) {
                return null;
            }

            return parsed;
        } catch {
            return null;
        }
    }

    #parsePositiveInteger(input, maximum = null) {
        const display = input.trim();
        if (!/^[0-9]+(?:_[0-9]+)*$/.test(display)) {
            return null;
        }

        const value = display.replaceAll("_", "");
        const integer = BigInt(value);
        if (integer <= 0n || (maximum !== null && integer > maximum)) {
            return null;
        }

        return { display, value };
    }

    #getGenesisDifficultyPrompt() {
        return "Set VDF difficulty (example 55_000_000):";
    }

    #getGenesisDiscriminantBitSizePrompt() {
        return "Set VDF discriminant bit size (example 2048):";
    }

    #getSetConsensusConfigPrompt() {
        return 'Set consensus config as JSON, or enter /cancel (example {"schemaVersion":1,"configData":{"difficulty":60000000,"discriminantBitSize":2048}}):';
    }

    #getSetVdfParamsDifficultyPrompt() {
        return "Set new VDF difficulty (example 55_000_000):";
    }

    #getSetVdfParamsDiscriminantBitSizePrompt() {
        return "Set new VDF discriminant bit size (example 2048):";
    }
}
