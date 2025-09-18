import { default as test } from 'brittle';

async function runMsgUtilsTests() {
    test.pause();

    await import('./applyOperations.test.js');
    await import('./createHash.test.js');
    await import('./isHexString.test.js');
    await import('./normalizeHex.test.js');
    await import('./amountSerialization.test.js');
    test.resume();
}

runMsgUtilsTests();