import { ENV } from './env.js';

export const getArguments = () => {
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
