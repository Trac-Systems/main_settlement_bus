import { default as test } from 'brittle';

async function runConnectionManagerTests() {
    test.pause();
    await import('./ConnectionManager.test.js');
    test.resume();
}

runConnectionManagerTests();