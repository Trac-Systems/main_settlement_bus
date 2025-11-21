import b4a from 'b4a';
import { bech32m } from 'bech32';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';
import { TOKEN_DECIMALS } from '../../../src/utils/constants.js';

export function randomBuffer(size) {
    return b4a.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
}

export function randomAddress(hrp = TRAC_NETWORK_MSB_MAINNET_PREFIX) {
    const data = randomBuffer(32);
    return bech32m.encode(hrp, bech32m.toWords(data));
}

export const TEN_THOUSAND_VALUE = b4a.from([
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x27, 0x10,
])

export const tokenUnits = units => units * 10n ** TOKEN_DECIMALS

export const isBare = () => {
    if (global.Pear === undefined) return true;
    const pearApp = global.Pear.app ?? global.Pear.config;
    return pearApp?.options?.type === 'terminal';
}
