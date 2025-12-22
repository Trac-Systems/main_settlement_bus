import { printHelp } from "../utils/cli.js";
import { isHexString } from "../utils/helpers.js";
import { randomBytes } from "hypercore-crypto";

/**
 * Handles command-line interaction for MainSettlementBus.
 * Responsible for parsing/sanitizing CLI input and delegating
 * to public methods on the MSB instance.
 */
export class CommandLineHandler {
    /**
     * @param {import("../index.js").MainSettlementBus} msbInstance
     */
    constructor(msbInstance) {
        this.msb = msbInstance;
        this.readline = msbInstance.readlineInterface;
    }

    start() {
        const rl = this.readline;
        if (!rl) return;

        printHelp(this.msb.isAdminMode);

        rl.on("line", async (input) => {
            const trimmed = input.trim();
            if (!trimmed) {
                rl.prompt();
                return;
            }

            try {
                await this.#handleCommand(trimmed);
            } catch (error) {
                console.error(`${error}`);
            }

            rl.prompt();
        });

        rl.prompt();
    }

    async #handleCommand(input) {
        const [command, ...parts] = input.split(" ");

        if (command === "/help") {
            printHelp(this.msb.isAdminMode);
            return;
        }

        if (command === "/exit") {
            if (this.readline) this.readline.close();
            await this.msb.close();
            return;
        }

        if (command === "/add_admin" && parts.length === 0) {
            await this.msb.addAdmin();
            return;
        }

        if (command === "/add_admin" && parts[0] === "--recovery") {
            await this.msb.recoverAdmin();
            return;
        }

        if (command === "/add_whitelist") {
            await this.msb.addWhitelist();
            return;
        }

        if (command === "/add_writer") {
            await this.msb.addWriter();
            return;
        }

        if (command === "/remove_writer") {
            await this.msb.removeWriter();
            return;
        }

        if (command === "/core") {
            await this.msb.printCoreInfo();
            return;
        }

        if (command === "/indexers_list") {
            await this.msb.printIndexersList();
            return;
        }

        if (command === "/validator_pool") {
            this.msb.printValidatorPool();
            return;
        }

        if (command === "/stats") {
            await this.msb.verifyDag();
            return;
        }

        if (command === "/balance_migration") {
            await this.msb.runBalanceMigration();
            return;
        }

        if (command === "/disable_initialization") {
            await this.msb.disableInitializationCommand();
            return;
        }

        if (command === "/node_status") {
            const address = parts[0];
            await this.msb.nodeStatus(address);
            return;
        }

        if (command === "/add_indexer") {
            const address = parts[0];
            await this.msb.addIndexer(address);
            return;
        }

        if (command === "/remove_indexer") {
            const address = parts[0];
            await this.msb.removeIndexer(address);
            return;
        }

        if (command === "/ban_writer") {
            const address = parts[0];
            await this.msb.banWriter(address);
            return;
        }

        if (command === "/deployment") {
            const bootstrapToDeploy = parts[0];
            const channel = parts[1] || randomBytes(32).toString("hex");

            if (!channel || channel.length !== 64 || !isHexString(channel)) {
                throw new Error("Channel must be a 32-byte hex string");
            }

            await this.msb.deployBootstrap(bootstrapToDeploy, channel);
            return;
        }

        if (command === "/get_validator_addr") {
            const wkHexString = parts[0];
            await this.msb.printValidatorAddress(wkHexString);
            return;
        }

        if (command === "/get_deployment") {
            const bootstrapHex = parts[0];
            await this.msb.printDeployment(bootstrapHex);
            return;
        }

        if (command === "/get_tx_info") {
            const txHash = parts[0];
            await this.msb.printTxInfo(txHash);
            return;
        }

        if (command === "/transfer") {
            const address = parts[0];
            const amount = parts[1];
            await this.msb.transfer(address, amount);
            return;
        }

        if (command === "/get_balance") {
            const address = parts[0];
            const confirmedFlag = parts[1];
            await this.msb.getBalanceCli(address, confirmedFlag);
            return;
        }

        if (command === "/get_license_number") {
            const address = parts[0];
            await this.msb.printLicenseNumber(address);
            return;
        }

        if (command === "/get_license_address") {
            const licenseId = parseInt(parts[0]);
            await this.msb.printLicenseAddress(licenseId);
            return;
        }

        if (command === "/get_license_count") {
            await this.msb.printLicenseCount();
            return;
        }

        if (command === "/get_txv") {
            await this.msb.printTxv();
            return;
        }

        if (command === "/get_fee") {
            await this.msb.printFee();
            return;
        }

        if (command === "/confirmed_length") {
            await this.msb.printConfirmedLength();
            return;
        }

        if (command === "/unconfirmed_length") {
            await this.msb.printUnconfirmedLength();
            return;
        }

        if (command === "/get_txs_hashes") {
            const start = parseInt(parts[0]);
            const end = parseInt(parts[1]);
            await this.msb.printTxHashes(start, end);
            return;
        }

        if (command === "/get_tx_details") {
            const hash = parts[0];
            await this.msb.printTxDetails(hash);
            return;
        }

        if (command === "/get_extended_tx_details") {
            const hash = parts[0];
            const confirmed = parts[1] === "true";
            await this.msb.printExtendedTxDetails(hash, confirmed);
            return;
        }
    }
}

