import { default as test } from 'brittle';

async function runStateTests() {
    test.pause();

    await import('./utils/address.test.js');
    await import('./utils/adminEntry.test.js');
    await import('./utils/balance.test.js');
    await import('./utils/nodeEntry.test.js');
    await import('./utils/indexerEntry.test.js');
    await import('./utils/lengthEntry.test.js');
    await import('./utils/roles.test.js');

    test.resume();
}

runStateTests();