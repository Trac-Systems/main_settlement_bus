import { default as test } from 'brittle';
import { setConfig } from '../../src/config/env.js';

async function runTests() {
    test.pause();
    setConfig()
    await import('./apply/apply.test.js');
    test.resume();
}

await runTests();
