import { test } from 'brittle';
import esmock from 'esmock';
import sinon from 'sinon';

import { config } from '../../helpers/config.js';

async function* history(entries) {
    for (const entry of entries) yield entry;
}

async function createState(entries, signedLength = 12) {
    const createHistoryStream = sinon.stub().callsFake(() => history(entries));
    const AutoBaseMock = sinon.stub().returns({
        view: {
            core: { signedLength },
            createHistoryStream,
        },
    });
    const State = await esmock('../../../src/core/state/State.js', {
        autobase: AutoBaseMock,
    });

    return {
        state: new State(null, null, config),
        createHistoryStream,
    };
}

test('State transaction history includes a standard LedgerConfig receipt key', async t => {
    const txHash = 'ab'.repeat(32);
    const { state, createHistoryStream } = await createState([
        { type: 'put', key: '/ledger-config/current', seq: 5 },
        { type: 'put', key: txHash, seq: 7 },
        { type: 'del', key: 'cd'.repeat(32), seq: 8 },
        { type: 'put', key: 'ef'.repeat(31) + 'e', seq: 9 },
        { type: 'put', key: 'not-hex'.padEnd(64, 'x'), seq: 10 },
    ]);

    t.is(await state.getTransactionConfirmedLength(txHash), 7);
    t.alike(await state.confirmedTransactionsBetween(0, 12), [
        { hash: txHash, confirmed_length: 7 },
    ]);
    t.alike(createHistoryStream.firstCall.args[0], { gte: 0, lte: 12 });
    t.alike(createHistoryStream.secondCall.args[0], { gte: 0, lte: 11 });
});
