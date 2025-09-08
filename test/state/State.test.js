import { test } from 'brittle';
import { encode, toBalance, decode } from '../../src/core/state/utils/nodeEntry.js';
import esmock from "esmock";
import sinon from "sinon";
import { randomBuffer, tokenUnits } from './stateTestUtils.js';
import { WRITER_BYTE_LENGTH, ADMIN_INITIAL_BALANCE } from '../../src/utils/constants.js';
import { $TNK } from '../../src/core/state/utils/balance.js';

const checkout = sinon.stub().returns({ get: () => {
        return { value: encode({
            wk: randomBuffer(WRITER_BYTE_LENGTH),
            isWhitelisted: true,
            isWriter: true,
            isIndexer: true,
            balance: ADMIN_INITIAL_BALANCE })
        }
    }
});

const AutoBaseMock = sinon.stub().returns({ view: { checkout, core: { signedLength: 1 }} });

test('State#incrementBalance', async t => {
    const State = await esmock('../../src/core/state/State.js', {
        "autobase": AutoBaseMock
    });
    const state = new State(null, null, null)

    const entry = await state.incrementBalance('adminAddress', $TNK(150n))
    t.is(toBalance(decode(entry).balance).asBigInt(), tokenUnits(1150n), 'balance matches');
});

test('State#derementBalance', async t => {
    const State = await esmock('../../src/core/state/State.js', {
        "autobase": AutoBaseMock
    });
    const state = new State(null, null, null)

    const entry = await state.decrementBalance('adminAddress', $TNK(150n))
    t.is(toBalance(decode(entry).balance).asBigInt(), tokenUnits(850n), 'balance matches');
});


test('State#derementBalance lower then', async t => {
    const State = await esmock('../../src/core/state/State.js', {
        "autobase": AutoBaseMock
    });
    const state = new State(null, null, null)

    const entry = await state.decrementBalance('adminAddress', $TNK(1150n))
    t.is(entry, null, 'entry is null');
});
