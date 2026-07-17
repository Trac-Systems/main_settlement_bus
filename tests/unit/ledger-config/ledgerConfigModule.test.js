import test from 'brittle';

async function runLedgerConfigTests() {
    test.pause();
    await import('./ledgerConfigCodec.test.js');
    await import('./ledgerConfigMerkle.test.js');
    await import('./LedgerConfigAdapterRegistry.test.js');
    await import('./ProofOfTimeLedgerConfigAdapter.test.js');
    await import('./LedgerConfigModelBContentStore.test.js');
    await import('./LedgerConfigModelBSynchronizer.test.js');
    test.resume();
}

await runLedgerConfigTests();
