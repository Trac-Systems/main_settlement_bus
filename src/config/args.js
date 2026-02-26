import { createConfig, ENV } from './env.js';

const getArguments = () => {
    const pearApp = typeof Pear !== 'undefined' ? (Pear.app ?? Pear.config) : undefined;
    const runtimeArgs = typeof process !== 'undefined' ? process.argv.slice(2) : [];
    return pearApp?.args ?? runtimeArgs;
};

export const resolveEnvironment = (args = []) => {
    const networkIndex = args.indexOf('--network');
    const network = (networkIndex !== -1 && args[networkIndex + 1]) ? args[networkIndex + 1] : undefined;

    if (network === ENV.MAINNET) return ENV.MAINNET;
    if (network === ENV.DEVELOPMENT) return ENV.DEVELOPMENT;
    if (network === ENV.TESTNET1 || network === 'testnet') return ENV.TESTNET1;
    return ENV.MAINNET;
};

export const isRpcEnabled = () => {
    const args = getArguments();
    return args.includes('--rpc');
};

export const resolveConfig = () => {
    const args = getArguments();
    const runRpc = isRpcEnabled();
    const selectedEnv = resolveEnvironment(args);
    const storesDirectory = args[0];
    const hostIndex = args.indexOf('--host');
    const host = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : undefined;
    const portIndex = args.indexOf('--port');
    const port = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1], 10) : undefined;

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
