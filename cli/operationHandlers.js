import { randomBytes } from "hypercore-crypto";
import { isHexString } from "../src/utils/helpers.js";
import { printHelp, verifyDag } from "../src/utils/cli.js";
import {
    coreInfoCommand,
    getBalanceCommand,
    getConfirmedLengthCommand,
    getDeploymentCommand,
    getExtendedTxDetailsCommand,
    getFeeCommand,
    getLicenseAddressCommand,
    getLicenseCountCommand,
    getLicenseNumberCommand,
    getTxDetailsCommand,
    getTxHashesCommand,
    getTxInfoCommand,
    getTxvCommand,
    getUnconfirmedLengthCommand,
    getValidatorAddressCommand,
    nodeStatusCommand
} from "../src/utils/cliCommands.js";

export class CommandHandlers {
    #config;
    #msb;
    #closeCli;
    #wallet;

    constructor({ config, msb, handleClose, wallet }) {
        this.#config = config;
        this.#msb = msb;
        this.#closeCli = handleClose;
        this.#wallet = wallet;
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
                    printHelp(this.#config.isAdminMode);
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
                process: async () => coreInfoCommand(this.#msb.state)
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
                process: async () => verifyDag(
                    this.#msb.state,
                    this.#msb.network,
                    this.#wallet,
                    this.#msb.state.writingKey
                )
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
                process: async ({ parts }) => nodeStatusCommand(this.#msb.state, parts[0])
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
                process: async ({ parts }) => getValidatorAddressCommand(
                    this.#msb.state,
                    parts[0],
                    this.#config.addressPrefix
                )
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_deployment"),
                process: async ({ parts }) => getDeploymentCommand(
                    this.#msb.state,
                    parts[0],
                    this.#config.addressLength
                )
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_tx_info"),
                process: async ({ parts }) => getTxInfoCommand(this.#msb.state, parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/transfer"),
                process: async ({ parts }) => this.#msb.handleTransferOperation(parts[0], parts[1])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_balance"),
                process: async ({ parts }) => getBalanceCommand(this.#msb.state, parts[0], parts[1])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_number"),
                process: async ({ parts }) => getLicenseNumberCommand(this.#msb.state, parts[0])
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_address"),
                process: async ({ parts }) => getLicenseAddressCommand(this.#msb.state, parseInt(parts[0]))
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_license_count"),
                process: async () => getLicenseCountCommand(
                    this.#msb.state
                )
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_txv"),
                process: async () => getTxvCommand(this.#msb.state)
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_fee"),
                process: async () => getFeeCommand(this.#msb.state)
            },
            {
                evaluate: ({ input }) => input.startsWith("/confirmed_length"),
                process: async () => getConfirmedLengthCommand(this.#msb.state)
            },
            {
                evaluate: ({ input }) => input.startsWith("/unconfirmed_length"),
                process: async () => getUnconfirmedLengthCommand(this.#msb.state)
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_txs_hashes"),
                process: async ({ parts }) => getTxHashesCommand(
                    this.#msb.state,
                    parseInt(parts[0]),
                    parseInt(parts[1])
                )
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_tx_details"),
                process: async ({ parts }) => getTxDetailsCommand(this.#msb.state, parts[0], this.#config)
            },
            {
                evaluate: ({ input }) => input.startsWith("/get_extended_tx_details"),
                process: async ({ parts }) => getExtendedTxDetailsCommand(
                    this.#msb.state,
                    parts[0],
                    parts[1] === "true",
                    this.#config
                )
            }
        ];
    }
}
