import { test, hook } from 'brittle';
import { EntryType } from "../../src/utils/constants.js";
import MsgUtils from '../../src/utils/msgUtils.js';
import { initTemporaryDirectory, removeTemporaryDirectory, setupMsbAdmin, setupMsbWriter, setupMsbIndexer} from '../utils/setupApplyTests.js';
import { sleep } from '../../src/utils/functions.js';
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';

let tmpDirectory, admin, indexer;

hook('Initialize nodes for addIndexer tests', async t => {
    tmpDirectory = await initTemporaryDirectory();
    admin = await setupMsbAdmin(testKeyPair1, tmpDirectory, {});
    indexer = await setupMsbWriter(admin, 'indexer', testKeyPair2, tmpDirectory, admin.options);
    indexer = await setupMsbIndexer(indexer, admin);
});

test('handleApplyRemoveIndexerOperation (apply) - Append transaction into the base', async t => {
    t.plan(2);

    try {
        const assembledRemoveIndexerMessage = await MsgUtils.assembleRemoveIndexerMessage(admin.wallet, indexer.wallet.publicKey);
        await admin.msb.state.append(assembledRemoveIndexerMessage);
        await sleep(5000); // wait for both peers to sync state
    
        const indexers = await indexer.msb.state.get(EntryType.INDEXERS);
        const nodeInfo = await indexer.msb.state.get(indexer.wallet.publicKey);
    
        t.is(Array.from(indexers).includes(indexer.wallet.publicKey), false, 'Indexer candidate should be not included in the indexers list');
        t.is(nodeInfo.isIndexer, false, 'Node info should indicate that the node is not an indexer');
    }
    catch (error) {
        t.fail('Failed to remove indexer: ' + error.message);
    }
});

hook('Clean up removeIndexer setup', async t => {
    // close msbBoostrap and remove temp directory
    if (admin && admin.msb) await admin.msb.close();
    if (indexer && indexer.msb) await indexer.msb.close();
    if (tmpDirectory) await removeTemporaryDirectory(tmpDirectory);
});
