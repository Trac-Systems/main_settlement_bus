import ReadyResource from "ready-resource";
import readline from "readline";
import tty from "tty";
import { randomBytes } from "hypercore-crypto";
import { sleep, isHexString } from "../src/utils/helpers.js";
import { verifyDag, printHelp } from "../src/utils/cli.js";
import {
    getBalanceCommand,
    getTxvCommand,
    getFeeCommand,
    getConfirmedLengthCommand,
    getUnconfirmedLengthCommand,
    getTxPayloadsBulkCommand,
    getTxHashesCommand,
    getTxDetailsCommand,
    getExtendedTxDetailsCommand,
    nodeStatusCommand,
    coreInfoCommand,
    getValidatorAddressCommand,
    getDeploymentCommand,
    getTxInfoCommand,
    getLicenseNumberCommand,
    getLicenseAddressCommand,
    getLicenseCountCommand
} from "../src/utils/cliCommands.js";

class Cli extends ReadyResource {
    #msb;
    #config;
    #readline_instance;

    constructor(msb, config) {
        super();
        this.#msb = msb;
        this.#config = config;
        this.#readline_instance = null;
    }

    async _open() {
        if (this.#config.enableInteractiveMode) {
            try {
                this.#readline_instance = readline.createInterface({
                    input: new tty.ReadStream(0),
                    output: new tty.WriteStream(1),
                });
            } catch (_ignored) {}
        }

        this.#msb.setReadlineInstance(this.#readline_instance);
    }

    async _close() {
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
    }

    startInteractiveMode() {
        console.log('RPC server will not be started.');

        const rl = this.#readline_instance;

        if (rl === null) return;

        printHelp(this.#config.isAdminMode);

        rl.on("line", async (input) => {
            try {
                await this.#handleCommand(input.trim(), rl);
            } catch (err) {
                console.error(`${err}`);
            }
            rl.prompt();
        });

        rl.prompt();
    }

    async #handleCommand(input, rl = null, payload = null) {
        const [command, ...parts] = input.split(" ");
        const exactHandlers = {
            "/help": async () => {
                printHelp(this.#config.isAdminMode);
            },
            "/exit": async () => {
                await this.close();
                await this.#msb.close();
            },
            "/add_admin": async () => await this.#msb.handleAdminCreation(),
            "/add_admin --recovery": async () => await this.#msb.handleAdminRecovery(),
            "/add_whitelist": async () => await this.#msb.handleWhitelistOperations(),
            "/add_writer": async () => await this.#msb.requestWriterRole(true),
            "/remove_writer": async () => await this.#msb.requestWriterRole(false),
            "/core": async () => await coreInfoCommand(this.#msb.state),
            "/indexers_list": async () => console.log(await this.#msb.state.getIndexersEntry()),
            "/validator_pool": () => this.#msb.network.validatorConnectionManager.prettyPrint(),
            "/stats": async () => await verifyDag(
                this.#msb.state,
                this.#msb.network,
                this.#msb.wallet,
                this.#msb.state.writingKey
            ),
            "/balance_migration": async () => await this.#msb.balanceMigrationOperation(),
            "/disable_initialization": async () => await this.#msb.disableInitialization()
        };

        if (exactHandlers[command]) {
            const result = await exactHandlers[command]();
            if (rl) rl.prompt();
            return result;
        }

        if (input.startsWith("/node_status")) {
            const address = parts[0];
            const result = await nodeStatusCommand(this.#msb.state, address);
            if (rl) rl.prompt();
            return result;
        }

        if (input.startsWith("/add_indexer")) {
            const address = parts[0];
            await this.#msb.updateWriterToIndexerRole(address, true);
        } else if (input.startsWith("/remove_indexer")) {
            const address = parts[0];
            await this.#msb.updateWriterToIndexerRole(address, false);
        } else if (input.startsWith("/ban_writer")) {
            const address = parts[0];
            await this.#msb.banValidator(address);
        } else if (input.startsWith("/deployment")) {
            const bootstrapToDeploy = parts[0];
            const channel = parts[1] || randomBytes(32).toString("hex");
            if (channel.length !== 64 || !isHexString(channel)) {
                throw new Error("Channel must be a 32-byte hex string");
            }
            await this.#msb.deployBootstrap(bootstrapToDeploy, channel);
        } else if (input.startsWith("/get_validator_addr")) {
            const wkHexString = parts[0];
            await getValidatorAddressCommand(this.#msb.state, wkHexString, this.#config.addressPrefix);
        } else if (input.startsWith("/get_deployment")) {
            const bootstrapHex = parts[0];
            await getDeploymentCommand(this.#msb.state, bootstrapHex, this.#config.addressLength);
        } else if (input.startsWith("/get_tx_info")) {
            const txHash = parts[0];
            await getTxInfoCommand(this.#msb.state, txHash);
        } else if (input.startsWith("/transfer")) {
            const address = parts[0];
            const amount = parts[1];
            await this.#msb.handleTransferOperation(address, amount);
        } else if (input.startsWith("/get_balance")) {
            const address = parts[0];
            const confirmedFlag = parts[1];
            const result = await getBalanceCommand(this.#msb.state, address, confirmedFlag);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_license_number")) {
            const address = parts[0];
            await getLicenseNumberCommand(this.#msb.state, address);
        } else if (input.startsWith("/get_license_address")) {
            const licenseId = parseInt(parts[0]);
            await getLicenseAddressCommand(this.#msb.state, licenseId);
        } else if (input.startsWith("/get_license_count")) {
            await getLicenseCountCommand(this.#msb.state, this.#msb.isAdmin.bind(this.#msb));
        } else if (input.startsWith("/get_txv")) {
            const result = await getTxvCommand(this.#msb.state);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_fee")) {
            const result = getFeeCommand(this.#msb.state);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/confirmed_length")) {
            const result = getConfirmedLengthCommand(this.#msb.state);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/unconfirmed_length")) {
            const result = getUnconfirmedLengthCommand(this.#msb.state);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_tx_payloads_bulk")) {
            if (!payload) {
                throw new Error("Missing payload for fetching tx payloads.");
            }
            const result = await getTxPayloadsBulkCommand(this.#msb.state, payload, this.#config);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_txs_hashes")) {
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            const result = await getTxHashesCommand(this.#msb.state, start, end);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_tx_details")) {
            const hash = parts[0];
            const result = await getTxDetailsCommand(this.#msb.state, hash, this.#config);
            if (rl) rl.prompt();
            return result;
        } else if (input.startsWith("/get_extended_tx_details")) {
            const hash = parts[0];
            const confirmed = parts[1] === "true";
            const result = await getExtendedTxDetailsCommand(this.#msb.state, hash, confirmed, this.#config);
            if (rl) rl.prompt();
            return result;
        }

        if (rl) rl.prompt();
    }
}

export const startInteractiveMode = async (msb, config) => {
    const cli = new Cli(msb, config);
    await cli.ready();
    await msb.ready();
    cli.startInteractiveMode();
};
