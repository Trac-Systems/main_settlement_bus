import b4a from 'b4a';
import { bech32m } from 'bech32';
import { TRAC_PUB_KEY_SIZE } from 'trac-crypto-api/constants.js'
import { TOKEN_DECIMALS } from '../../../src/utils/constants.js';

export function randomBuffer(size) {
    return b4a.from(Array.from({ length: size }, () => Math.floor(Math.random() * 256)));
}

export function randomAddress(hrp) {
    const data = randomBuffer(TRAC_PUB_KEY_SIZE);
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
