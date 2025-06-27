import { test, hook } from 'brittle';
import { EntryType } from "../../src/utils/constants.js";
import MsgUtils from '../../src/utils/msgUtils.js';
import { sleep } from '../../src/utils/helpers.js';
import { initTemporaryDirectory, removeTemporaryDirectory, setupMsbAdmin, setupMsbWriter } from '../utils/setupApplyTests.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';

let tmpDirectory, admin, indexer;

hook('Initialize nodes for addIndexer tests', async t => {
    tmpDirectory = await initTemporaryDirectory()
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {});

    // Indexer candidate should be a writer before addIndexer
    indexer = await setupMsbWriter(admin, 'indexerCandidate', testKeyPair2, tmpDirectory, admin.options);
});

test('handleApplyAddIndexerOperation (apply) - Append transaction into the base', async t => {
    t.plan(2)
    try {
        const assembledAddIndexerMessage = await MsgUtils.assembleAddIndexerMessage(admin.wallet, indexer.wallet.publicKey);
        await admin.msb.state.append(assembledAddIndexerMessage);
        await sleep(5000); // wait for both peers to sync state

        const indexers = await indexer.msb.state.get(EntryType.INDEXERS);
        const nodeInfo = await indexer.msb.state.get(indexer.wallet.publicKey);

        t.is(Array.from(indexers).includes(indexer.wallet.publicKey), true, 'Indexer candidate should be included in the indexers list');
        t.is(nodeInfo.isIndexer, true, 'Node info should indicate that the node is an indexer');
    }
    catch (error) {
        t.fail('Failed to add indexer: ' + error.message);
    }    
});

// TODO: Include a test that shows a non-writer peer cannot become an indexer
// TODO: Include a test that shows a non-whitelisted peer cannot become an indexer

hook('Clean up addIndexer setup', async t => {
    // close msb instances and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (indexer && indexer.msb) await indexer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
