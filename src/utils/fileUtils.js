import fs from 'fs'; // TODO: If we are using bare environment, we should use bare-fs instead
import path from 'path';
import { WHITELIST_FILEPATH, BALANCE_MIGRATION_FILEPATH, BALANCE_MIGRATED_DIR, WHITELIST_MIGRATION_DIR } from '../utils/constants.js';
import { isAddressValid } from '../core/state/utils/address.js';
import { decimalStringToBigInt, bigIntTo16ByteBuffer, bufferToBigInt, bigIntToDecimalString } from './amountSerialization.js';
import PeerWallet from 'trac-wallet';
import b4a from 'b4a';
const MIGRATED_FILE_REGEX = /^migrated(\d+)\.csv$/;

/**
 * Reads the contents of the whitelist file and returns an array of strings.
 * Each line is expected to represent an address. Lines are trimmed and empty lines are ignored.
 * ATTENTION: The addresses are not checked for validity in this function.
 *
 * @param {string} [filepath=WHITELIST_FILEPATH] - The path to the file to read. Defaults to the whitelist file path from constants.
 * @returns {Promise<string[]>} Resolves with an array of strings (one per valid line).
 * @throws {Error} If the file does not exist or cannot be read.
 */
// TODO: We should generalize this function in the future, so we can improve the reusability of the code.
export async function readAddressesFromWhitelistFile(filepath = WHITELIST_FILEPATH) {
    try {
        if (!filepath.toLowerCase().endsWith('.csv')) {
            throw new Error(`Invalid file format: ${filepath}. Balance migration file must be a CSV file.`);
        }
        
        const data = await fs.promises.readFile(filepath, 'utf8');
        
        const addresses = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (addresses.length === 0) {
            throw new Error('The whitelist file is empty. File must contain at least one valid address.');
        }

        const seen = new Set();
        const duplicates = new Set();

        for (const address of addresses) {
            if (seen.has(address)) {
                duplicates.add(address);
            } else {
                seen.add(address);
            }
        }

        if (duplicates.size > 0) {
            throw new Error(`Duplicate addresses found in whitelist file: ${Array.from(duplicates).join(', ')}. Each address must be unique.`);
        }

        return addresses;
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Whitelist file not found: ${filepath}`);
        }
        throw new Error(`Failed to read public keys from the whitelist file: ${err.message}`);
    }
}

export async function readBalanceMigrationFile(filepath = BALANCE_MIGRATION_FILEPATH) {
    try {

        if (!filepath.toLowerCase().endsWith('.csv')) {
            throw new Error(`Invalid file format: ${filepath}. Balance migration file must be a CSV file.`);
        }

        const pairFormatRegex = /^([a-zA-Z0-9]+),(\d+(?:\.\d{1,18})?|\d+)$/;
        const data = await fs.promises.readFile(filepath, 'utf8');
        const lines = data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 0) {
            throw new Error('Balance migration file is empty. File must contain at least one valid address balance pair.');
        }

        const addressBalancePair = new Map();
        let totalBalance = BigInt(0);
        let totalAddresses = 0;
        let addresses = []

        for (const line of lines) {
            const match = line.match(pairFormatRegex);
            if (!match) {
                throw new Error(`Invalid line in balance migration file: '${line}'. Each line must be in format: address,xxx.xxx`);
            }
            const address = match[1];
            const balance = match[2];

            if (addressBalancePair.has(address)) {
                throw new Error(`Duplicate address found in balance migration file: '${address}'. Each address must be unique.`);
            }

            const parsedBalance = decimalStringToBigInt(balance);
            const balanceBuffer = bigIntTo16ByteBuffer(parsedBalance);
            const reconstructedBalance = bufferToBigInt(balanceBuffer);

            if (parsedBalance !== reconstructedBalance) {
                throw new Error(`Balance serialization/deserialization mismatch for address '${address}'. Original: ${parsedBalance}, Reconstructed: ${reconstructedBalance}`);
            }
            totalBalance += parsedBalance;
            totalAddresses += 1;
            addresses.push({ address, parsedBalance })
            addressBalancePair.set(address, balanceBuffer);
        }

        return { addressBalancePair, totalBalance, totalAddresses, addresses };
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Balance migration file not found: ${filepath}`);
        }
        throw new Error(`Failed to read balance migration file: ${err.message}`);
    }
}

export async function validateAddressFromIncomingFile(stateInstance, address, adminEntry) {
    if (!isAddressValid(address)) {
        throw new Error(`Invalid address format: '${address}'. Please ensure all addresses are valid.`);
    }

    const publicKey = PeerWallet.decodeBech32m(address);

    if (!publicKey || publicKey.length !== 32) {
        throw new Error(`Invalid public key: '${address}'. Please ensure all addresses are valid.`);
    }

    if (address === adminEntry.address) {
        throw new Error(`The admin address '${address}' cannot be included in the current operation.`);
    }

    const nodeEntry = await stateInstance.getNodeEntryUnsigned(address);

    if (nodeEntry && nodeEntry.isWhitelisted) {
        throw new Error(`Whitelisted node address '${address}' cannot be included in the current operation.`);
    }

    if (nodeEntry && !b4a.equals(nodeEntry.license, b4a.alloc(4,0))) {
        throw new Error(`Address '${address}' has been banned/whitelisted in the past and cannot be included in the current operation.`);
    }
}

export async function getAllMigrationFiles(migrationDirectory = BALANCE_MIGRATED_DIR) {
    try {
        const files = await fs.promises.readdir(migrationDirectory);
        return files.filter(file => file.match(MIGRATED_FILE_REGEX))
            .map(file => path.join(migrationDirectory, file));
    } catch {
        return [];
    }
}

export async function validateMigrationData(addresses, migrationDirectory = BALANCE_MIGRATED_DIR) {
    const migrationFiles = await getAllMigrationFiles(migrationDirectory);
    if (migrationDirectory === BALANCE_MIGRATED_DIR) {
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i].address;
            for (const filePath of migrationFiles) {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const hasMigratedAddress = content
                    .split('\n')
                    .some(line => line.trim() && line.split(',')[0] === address);

                if (hasMigratedAddress) {
                    throw new Error(`Address '${address}' has already been migrated in file: ${filePath}`);
                }
            }
        }
    } else if (migrationDirectory === WHITELIST_MIGRATION_DIR) {
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            for (const filePath of migrationFiles) {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const hasMigratedAddress = content
                    .split('\n')
                    .some(line => line.trim() === address);

                if (hasMigratedAddress) {
                    throw new Error(`Address '${address}' has already been migrated in file: ${filePath}`);
                }
            }
        }
    }
}

export async function getNextMigrationNumber(migrationDirectory = BALANCE_MIGRATED_DIR) {
    const migrationFiles = await getAllMigrationFiles(migrationDirectory);
    if (migrationFiles.length === 0) return 1;

    const numbers = migrationFiles.map(filePath => {
        const fileName = path.basename(filePath);
        const match = fileName.match(MIGRATED_FILE_REGEX);
        return match ? parseInt(match[1]) : 0;
    });
    return Math.max(...numbers) + 1;
}

export async function createMigrationEntryFile(addressBalancePair, migrationNumber, migrationDir = BALANCE_MIGRATED_DIR) {
    const filename = path.join(migrationDir, `migrated${migrationNumber}.csv`);
    const content = Array.from(addressBalancePair.entries())
        .map(([address, balance]) => `${address},${bigIntToDecimalString(bufferToBigInt(balance))}`)
        .join('\n');

    await fs.promises.mkdir(migrationDir, { recursive: true });
    await fs.promises.writeFile(filename, content);
}

export async function createWhitelistEntryFile(addresses, migrationNumber, migrationDir = WHITELIST_MIGRATION_DIR) {
    const filename = path.join(migrationDir, `migrated${migrationNumber}.csv`);
    const content = addresses
        .join('\n');

    await fs.promises.mkdir(migrationDir, { recursive: true });
    await fs.promises.writeFile(filename, content);
}

export default {
    readAddressesFromWhitelistFile,
    readBalanceMigrationFile,
    getAllMigrationFiles,
    validateMigrationData,
    getNextMigrationNumber,
    createMigrationEntryFile,
    createWhitelistEntryFile,
    validateAddressFromIncomingFile
}
