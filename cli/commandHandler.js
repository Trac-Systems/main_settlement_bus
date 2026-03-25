import { randomBytes } from "hypercore-crypto";
import { Handlers } from "./handlers.js";
import { isHexString } from "../src/utils/helpers.js";

export class CommandHandler {
    #config;
    #msb;
    #closeCli;
    #wallet;
    #handlers;

    constructor({ config, msb, handleClose, wallet }) {
        this.#config = config;
        this.#msb = msb;
        this.#closeCli = handleClose;
        this.#wallet = wallet;
        this.#handlers = new Handlers(msb, config);
    }

    async handle(input) {
        const [command, ...parts] = input.split(" ");
        const context = { command, input, parts };
        const handlers = this.#getHandlers();
        const handler = handlers.find(({ evaluate }) => evaluate(context));

        if (handler) {
            return handler.process(context);
        }
    }

    #getHandlers() {
        return [
            {
                evaluate: ({ command }) => command === "/help",
                process: async () => {
                    this.#msb.printHelp();
                }
            },
            {
                evaluate: ({ command }) => command === "/exit",
                process: async () => {
                    await this.#closeCli();
                    await this.#msb.close();
                }
            },
            {
                evaluate: ({ input }) => input === "/add_admin --recovery",
                process: async () => this.#msb.handleAdminRecovery()
            },
            {
                evaluate: ({ command }) => command === "/add_admin",
                process: async () => this.#msb.handleAdminCreation()
            },
            {
                evaluate: ({ command }) => command === "/add_whitelist",
                process: async () => this.#msb.handleWhitelistOperations()
            },
            {
                evaluate: ({ command }) => command === "/add_writer",
                process: async () => this.#msb.requestWriterRole(true)
            },
            {
                evaluate: ({ command }) => command === "/remove_writer",
                process: async () => this.#msb.requestWriterRole(false)
            },
            {
                evaluate: ({ command }) => command === "/core",
                process: async () => this.#handlers.handleCoreInfo()
            },
            {
                evaluate: ({ command }) => command === "/indexers_list",
                process: async () => console.log(await this.#msb.state.getIndexersEntry())
            },
            {
                evaluate: ({ command }) => command === "/validator_pool",
                process: async () => this.#msb.network.validatorConnectionManager.prettyPrint()
            },
            {
                evaluate: ({ command }) => command === "/stats",
                process: async () => this.#msb.verifyDag()
            },
            {
                evaluate: ({ command }) => command === "/balance_migration",
                process: async () => this.#msb.balanceMigrationOperation()
            },
            {
                evaluate: ({ command }) => command === "/disable_initialization",
                process: async () => this.#msb.disableInitialization()
            },
            {
                evaluate: ({ input }) => input.startsWith("/node_status"),
                process: async ({ parts }) => this.#handlers.handleNodeStatus(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/add_indexer"),
                process: async ({ parts }) => this.#msb.updateWriterToIndexerRole(parts[0], true)
            },
            {
                evaluate: ({ input }) => input.startsWith("/remove_indexer"),
                process: async ({ parts }) => this.#msb.updateWriterToIndexerRole(parts[0], false)
            },
            {
                evaluate: ({ input }) => input.startsWith("/ban_writer"),
                process: async ({ parts }) => this.#msb.banValidator(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/deployment"),
                process: async ({ parts }) => {
                    const channel = parts[1] || randomBytes(32).toString("hex");
                    if (!isHexString(channel, 64)) {
                        throw new Error("Channel must be a 32-byte hex string");
                    }
                    return this.#msb.deployBootstrap(parts[0], channel);
                }
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_validator_addr"),
                process: async ({ parts }) => this.#handlers.handleValidatorAddress(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_deployment"),
                process: async ({ parts }) => this.#handlers.handleDeployment(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_tx_info"),
                process: async ({ parts }) => this.#handlers.handleTxInfo(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/transfer"),
                process: async ({ parts }) => this.#msb.handleTransferOperation(parts[0], parts[1])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_balance"),
                process: async ({ parts }) => this.#handlers.handleBalance(parts[0], parts[1])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_number"),
                process: async ({ parts }) => this.#handlers.handleLicenseNumber(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_address"),
                process: async ({ parts }) => this.#handlers.handleLicenseAddress(parseInt(parts[0]))
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_count"),
                process: async () => this.#handlers.handleLicenseCount()
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_txv"),
                process: async () => this.#handlers.handleTxv()
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_fee"),
                process: async () => this.#handlers.handleFee()
            },
            {
                evaluate: ({ input }) => input.startsWith("/confirmed_length"),
                process: async () => this.#handlers.handleConfirmedLength()
            },
            {
                evaluate: ({ input }) => input.startsWith("/unconfirmed_length"),
                process: async () => this.#handlers.handleUnconfirmedLength()
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_txs_hashes"),
                process: async ({ parts }) => this.#handlers.handleTxHashes(
                    parseInt(parts[0]),
                    parseInt(parts[1])
                )
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_tx_details"),
                process: async ({ parts }) => this.#handlers.handleTxDetails(parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_extended_tx_details"),
                process: async ({ parts }) => this.#handlers.handleExtendedTxDetails(parts[0], parts[1] === "true")
            }
        ];
    }
}
