import {default as test} from 'brittle';

async function runCheckTests() {
    test.pause();
    await import('./addAdmin/addAdminBasic.test.js');
    await import('./addAdmin/addAdminRecovery.test.js');
    await import('./addWhitelist.test.js');
    await import('./addWriter.test.js');
    await import('./removeWriter.test.js');
    await import('./addIndexer.test.js');
    await import('./removeIndexer.test.js');
    await import('./postTx/postTx.test.js');
    await import('./transfer.test.js');
    await import('./postTx/invalidSubValues.test.js');
    await import('./banValidator.test.js')
    test.resume();
}

await runCheckTests();