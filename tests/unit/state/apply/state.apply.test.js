import { default as test } from 'brittle';
/**
 * Note: This is not possible to cover tests with when indexer Sequence returns null. Hyperbee is shoting with errors,
 * if someone will try to do it then, this person will hack itself.
 */
async function runStateTests() {
    test.pause();
    await import('./addAdmin/state.apply.addAdmin.test.js');
    await import('./balanceInitialization/state.apply.balanceInitialization.test.js');
    test.resume();
}

runStateTests();
