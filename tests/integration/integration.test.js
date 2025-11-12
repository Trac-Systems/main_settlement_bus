import { default as test } from 'brittle';

async function runTests() {
    test.pause();
    await import('./apply/apply.test.js');
    test.resume();
}

await runTests();
