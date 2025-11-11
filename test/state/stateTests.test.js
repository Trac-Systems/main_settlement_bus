import { default as test } from 'brittle';
import { isBare } from './stateTestUtils.js';

async function runStateTests() {
    test.pause();

    // await import('./utils/state.utils.test.js');
    await import('./apply/state.apply.test.js');
    // These tests are skipped temoporarily because the mock library sinon does not work with bare.
    // TODO: replace esmock, sinon is actually fine
    // if (!isBare()) {
    //     await import('./State.test.js');
    // }

    test.resume();
}

runStateTests();