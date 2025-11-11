import { default as test } from 'brittle';

async function runStateTests() {
    test.pause();

    await import('./address.test.js');
    await import('./adminEntry.test.js');
    await import('./balance.test.js');
    await import('./nodeEntry.test.js');
    await import('./indexerEntry.test.js');
    await import('./lengthEntry.test.js');
    await import('./roles.test.js');


    test.resume();
}

runStateTests();