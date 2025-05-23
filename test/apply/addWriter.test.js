import test from 'brittle';
import {initMsbAdmin, initMsbPeer} from './setupApplyTests.js';
import PeerWallet from "trac-wallet"
import { testKeyPair1, testKeyPair2 } from '../fixtures/apply.fixtures.js';
 
 // handleApplyAddWriterOperation  and addWriter
 // should not be possible to perform replay attack

 test('Apply function addWriter - happy path', async (t) => {
    try {
        const admin = await initMsbAdmin(testKeyPair1);
        const writer = await initMsbPeer('writer', testKeyPair2, admin.options);

        await admin.msb.ready();
        await writer.msb.ready();
    }
    catch (error) {
        t.fail(error.message);
    }

 });