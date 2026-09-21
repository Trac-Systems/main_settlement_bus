import { default as test } from 'brittle';

async function runConnectionManagerTests() {
    test.pause();
    await import('./ConnectionManager.test.js');
    await import('./IndexerDiagnostics.test.js');
    await import('./DiagnosticOutput.test.js');
    test.resume();
}

runConnectionManagerTests();
