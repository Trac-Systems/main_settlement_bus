import { test } from 'brittle';
import b4a from 'b4a';
import { randomBuffer, TEN_THOUSAND_VALUE, tokenUnits } from '../stateTestUtils.js';
import { ZERO_BALANCE, toBalance, decode, encode } from '../../../src/core/state/utils/nodeEntry.js';
import { WRITER_BYTE_LENGTH, ADMIN_INITIAL_BALANCE } from '../../../src/utils/constants.js';
import { $TNK } from '../../../src/core/state/utils/balance.js';

test('Balance#add with zero', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: ZERO_BALANCE
    };

    const balance = toBalance(node.balance)
    const addedBalance = balance.add(toBalance(TEN_THOUSAND_VALUE))

    const encoded = encode(node)
    addedBalance.update(encoded)

    const updated = decode(encoded)
    t.ok(b4a.equals(updated.balance, TEN_THOUSAND_VALUE), 'balance matches');
});

test('Balance#add other stuff', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: TEN_THOUSAND_VALUE
    };

    const balance = toBalance(node.balance)
    const addedBalance = balance.add(toBalance(TEN_THOUSAND_VALUE))
    t.is(addedBalance.asHex(), '00000000000000000000000000004e20', 'balance matches');
});

test('Balance#asBigInt', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: TEN_THOUSAND_VALUE
    };

    const balance = toBalance(node.balance)
    const addedBalance = balance.add(toBalance(TEN_THOUSAND_VALUE))
    t.is(addedBalance.asBigInt(), 20_000n, 'balance matches');
});

test('Balance#greaterThen', t => {
    const $TNK1000 = $TNK(1000n)
    const $TNK1001 = $TNK(1001n)

    t.not(toBalance($TNK1000).greaterThen(toBalance($TNK1001)), '1000 not greater then 1001');
    t.ok(toBalance($TNK1001).greaterThen(toBalance($TNK1000)), '1001 greater then 1000');
    t.not(toBalance($TNK1000).greaterThen(toBalance($TNK1000)), '1000 not greater then 1000');
});

test('Balance#lowerThen', t => {
    const $TNK1000 = $TNK(1000n)
    const $TNK1001 = $TNK(1001n)

    t.not(toBalance($TNK1001).lowerThen(toBalance($TNK1000)), '1001 not lower then 1000');
    t.ok(toBalance($TNK1000).lowerThen(toBalance($TNK1001)), '1000 lower then 1001');
    t.not(toBalance($TNK1000).lowerThen(toBalance($TNK1000)), '1000 not lower then 1000');
});

test('Balance#lowerThen', t => {
    const $TNK1000 = $TNK(1000n)

    t.ok(toBalance($TNK1000).equals(toBalance($TNK1000)), '1000 equals 1000');
});

test('Balance $TNK', t => {
    const $TNK300 = $TNK(300n)
    const converted = toBalance($TNK300).asBigInt()
    t.is(converted, tokenUnits(300n), 'balance matches');
});

test('Node entry integration', t => {
    const entry = encode({
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: true,
        balance: ADMIN_INITIAL_BALANCE
    });

    const decoded = decode(entry)

    const updated = toBalance(decoded.balance)
        .add(toBalance($TNK(300n)))
        .update(encode(decoded))

    t.is(toBalance(decode(updated).balance).asBigInt(), tokenUnits(1300n), 'balance matches');
});