import { default as test } from 'brittle';

async function runStateTests() {
    test.pause();
    await import('./addAdmin/state.apply.addAdmin.test.js');
    test.resume();
}

runStateTests();