import { createConfig, ENV } from './env.js';

const getArguments = () => {
    const pearApp = typeof Pear !== 'undefined' ? (Pear.app ?? Pear.config) : undefined;
    const runtimeArgs = typeof process !== 'undefined' ? process.argv.slice(2) : [];
    return pearApp?.args ?? runtimeArgs;
};

export const resolveEnvironment = (args = []) => {
    const useDevelopment = args.includes('--development');
    const useTestnet = args.includes('--testnet');
    if (useDevelopment) return ENV.DEVELOPMENT;
    return useTestnet ? ENV.TESTNET1 : ENV.MAINNET;
};

export const isRpcEnabled = () => {
    const args = getArguments();
    return args.includes('--rpc');
};

export const resolveConfig = () => {
    const args = getArguments();
    const runRpc = isRpcEnabled();
    const selectedEnv = resolveEnvironment(args);
    const storeName = args[0];
    const hostIndex = args.indexOf('--host');
    const host = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : undefined;
    const portIndex = args.indexOf('--port');
    const port = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1], 10) : undefined;

    const rpc = {
        storeName,
        enableWallet: false,
        enableInteractiveMode: false,
        host,
        port
    };

    const options = runRpc ? rpc : { storeName };

    return createConfig(selectedEnv, options);
};
