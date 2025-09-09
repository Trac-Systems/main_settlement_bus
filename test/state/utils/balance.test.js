import { test } from 'brittle';
import b4a from 'b4a';
import { randomBuffer, TEN_THOUSAND_VALUE, tokenUnits } from '../stateTestUtils.js';
import { ZERO_BALANCE, toBalance, decode, encode } from '../../../src/core/state/utils/nodeEntry.js';
import { WRITER_BYTE_LENGTH, ADMIN_INITIAL_BALANCE, BALANCE_BYTE_LENGTH, TOKEN_DECIMALS } from '../../../src/utils/constants.js';
import { $TNK, Balance, BalanceError } from '../../../src/core/state/utils/balance.js';

test('Balance constructor rejects invalid length', t => {
  const badBuffer = b4a.from([0x01, 0x02])
  t.exception(() => new Balance(badBuffer), BalanceError, 'throws on invalid buffer length')
})

test('Balance#asHex explicit', t => {
  const val = $TNK(1000n)
  t.is(toBalance(val).asHex(), b4a.toString(val, 'hex'), 'hex matches')
})

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

test('Balance#add overflow', t => {
  const max = b4a.alloc(BALANCE_BYTE_LENGTH, 0xFF)
  const balance = toBalance(max)

  const oneRaw = b4a.alloc(BALANCE_BYTE_LENGTH)
  oneRaw[oneRaw.length - 1] = 1  

  const result = balance.add(toBalance(oneRaw))

  t.is(result.asBigInt(), 0n, 'wraps to zero')
})

test('Balance#sub with zero', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: TEN_THOUSAND_VALUE
    };

    const balance = toBalance(node.balance)
    const subBalance = balance.sub(toBalance(ZERO_BALANCE))

    const encoded = encode(node)
    subBalance.update(encoded)

    const updated = decode(encoded)
    t.ok(b4a.equals(updated.balance, TEN_THOUSAND_VALUE), 'balance matches');
});

test('Balance#sub zero from value', t => {
    const node = {
        wk: randomBuffer(WRITER_BYTE_LENGTH),
        isWhitelisted: true,
        isWriter: true,
        isIndexer: false,
        balance: TEN_THOUSAND_VALUE
    };

    const balance = toBalance(node.balance)
    const subBalance = balance.sub(toBalance(ZERO_BALANCE))

    const encoded = encode(node)
    subBalance.update(encoded)

    const updated = decode(encoded)
    t.ok(b4a.equals(updated.balance, TEN_THOUSAND_VALUE), 'balance matches');
});

test('Balance#sub underflow', t => {
  const a = $TNK(1000n)
  const b = $TNK(2000n)
  const result = toBalance(a).sub(toBalance(b))
  const expected = (2n ** BigInt(BALANCE_BYTE_LENGTH * 8)) - (1000n * 10n ** TOKEN_DECIMALS)
  t.is(result.asBigInt(), expected, 'wraps around with decimals applied');
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

test('Balance#greaterThan', t => {
    const $TNK1000 = $TNK(1000n)
    const $TNK1001 = $TNK(1001n)

    t.not(toBalance($TNK1000).greaterThan(toBalance($TNK1001)), '1000 not greater than 1001');
    t.ok(toBalance($TNK1001).greaterThan(toBalance($TNK1000)), '1001 greater than 1000');
    t.not(toBalance($TNK1000).greaterThan(toBalance($TNK1000)), '1000 not greater than 1000');
});

test('Balance#lowerThan', t => {
    const $TNK1000 = $TNK(1000n)
    const $TNK1001 = $TNK(1001n)

    t.not(toBalance($TNK1001).lowerThan(toBalance($TNK1000)), '1001 not lower than 1000');
    t.ok(toBalance($TNK1000).lowerThan(toBalance($TNK1001)), '1000 lower than 1001');
    t.not(toBalance($TNK1000).lowerThan(toBalance($TNK1000)), '1000 not lower than 1000');
});

test('Balance#equals', t => {
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