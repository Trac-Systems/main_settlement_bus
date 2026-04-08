import { createConfig, ENV } from './env.js';

const getArguments = () => {
    const pearApp = typeof Pear !== 'undefined' ? (Pear.app ?? Pear.config) : undefined;
    const runtimeArgs = typeof process !== 'undefined' ? process.argv.slice(2) : [];
    return pearApp?.args ?? runtimeArgs;
};

const throwCliError = (message) => {
    throw new Error(`MainSettlementBus CLI: ${message}`);
};

const getOptionValue = (args, flag) => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
        throwCliError(`${flag} requires a value.`);
    }

    return value;
};

const parseNonEmptyStringOption = (args, flag) => {
    const value = getOptionValue(args, flag);
    if (value === undefined) return undefined;

    if (value.trim() === '') {
        throwCliError(`${flag} must be a non-empty string.`);
    }

    return value;
};

const parsePortOption = (args) => {
    const value = getOptionValue(args, '--port');
    if (value === undefined) return undefined;

    if (!/^\d+$/.test(value)) {
        throwCliError('--port must be an integer between 1 and 65535.');
    }

    const port = Number.parseInt(value, 10);
    if (port < 1 || port > 65535) {
        throwCliError('--port must be an integer between 1 and 65535.');
    }

    return port;
};

export const resolveEnvironment = (args = []) => {
    const network = getOptionValue(args, '--network');

    if (network === undefined) return ENV.MAINNET;
    if (network === ENV.MAINNET) return ENV.MAINNET;
    if (network === ENV.DEVELOPMENT) return ENV.DEVELOPMENT;
    if (network === ENV.TESTNET1 || network === 'testnet') return ENV.TESTNET1;

    throwCliError('--network must be one of: mainnet, development, testnet1, testnet.');
};

export const isRpcEnabled = (args = getArguments()) => {
    return args.includes('--rpc');
};

export const resolveConfigFromArgs = (args = []) => {
    const runRpc = isRpcEnabled(args);
    const selectedEnv = resolveEnvironment(args);
    const storesDirectory = parseNonEmptyStringOption(args, '--stores-directory');
    const host = runRpc ? parseNonEmptyStringOption(args, '--host') : undefined;
    const port = runRpc ? parsePortOption(args) : undefined;

    const rpc = {
        storesDirectory,
        enableWallet: false,
        enableInteractiveMode: false,
        host,
        port
    };

    const options = runRpc ? rpc : { storesDirectory };

    return createConfig(selectedEnv, options);
};

export const resolveConfig = () => resolveConfigFromArgs(getArguments());
