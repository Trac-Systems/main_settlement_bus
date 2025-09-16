import { test } from 'brittle';
import b4a from 'b4a';
import { randomBuffer, TEN_THOUSAND_VALUE, tokenUnits } from '../stateTestUtils.js';
import { ZERO_BALANCE, decode, encode } from '../../../src/core/state/utils/nodeEntry.js';
import { WRITER_BYTE_LENGTH, ADMIN_INITIAL_BALANCE, BALANCE_BYTE_LENGTH, TOKEN_DECIMALS, DEFAULT_PERCENTAGE } from '../../../src/utils/constants.js';
import { $TNK, addBuffers, burn, divBuffers, mulBuffers, subBuffers, toBalance, toTerm } from '../../../src/core/state/utils/balance.js';
import { NULL_BUFFER } from '../../../src/utils/buffer.js';

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

test('Balance#add overflow returns NULL_BUFFER', t => {
    const max = b4a.alloc(BALANCE_BYTE_LENGTH, 0xFF);
    const balance = toBalance(max);

    const oneRaw = b4a.alloc(BALANCE_BYTE_LENGTH);
    oneRaw[oneRaw.length - 1] = 1; // +1

    const result = balance.add(toBalance(oneRaw));

    // Should return null-like buffer on overflow
    t.is(result, null, 'overflow returns null');
});

test('Balance#add edge case: max - 1 + 1 = max', t => {
    const maxMinusOne = b4a.alloc(BALANCE_BYTE_LENGTH, 0xFF);
    maxMinusOne[maxMinusOne.length - 1] = 0xFE;
    const balance = toBalance(maxMinusOne);

    const oneRaw = b4a.alloc(BALANCE_BYTE_LENGTH);
    oneRaw[oneRaw.length - 1] = 1;

    const result = balance.add(toBalance(oneRaw));

    // Should equal max value
    const expected = b4a.alloc(BALANCE_BYTE_LENGTH, 0xFF);
    t.ok(b4a.equals(result.value, expected), 'max - 1 + 1 = max');
});

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

test('Balance#sub underflow returns NULL_BUFFER', t => {
    const a = $TNK(1000n);
    const b = $TNK(2000n);
    const result = toBalance(a).sub(toBalance(b));

    // Should return null-like buffer on underflow
    t.is(result, null, 'overflow returns null');
});

test('Balance#sub edge case: equal amounts = zero', t => {
    const a = $TNK(5000n);
    const b = $TNK(5000n);
    const result = toBalance(a).sub(toBalance(b));

    const expected = b4a.alloc(BALANCE_BYTE_LENGTH); // all zeros
    t.ok(b4a.equals(result.value, expected), 'equal amounts subtract to zero');
});

test('Balance#sub edge case: one less than a', t => {
    const a = $TNK(1000n);
    const b = $TNK(999n);
    const result = toBalance(a).sub(toBalance(b));

    const expected = $TNK(1n);
    t.ok(b4a.equals(result.value, expected), 'subtracting 999 from 1000 gives 1');
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

test('Balance#greaterThanOrEquals', t => {
    const b1000 = toBalance($TNK(1000n))
    const b1001 = toBalance($TNK(1001n))
    const b1000Dup = toBalance($TNK(1000n))

    t.ok(b1001.greaterThanOrEquals(b1000), '1001 >= 1000')
    t.ok(b1000.greaterThanOrEquals(b1000Dup), '1000 >= 1000')
    t.ok(!b1000.greaterThanOrEquals(b1001), '1000 !>= 1001')
})

test('Balance#lowerThanOrEquals', t => {
    const b1000 = toBalance($TNK(1000n))
    const b1001 = toBalance($TNK(1001n))
    const b1000Dup = toBalance($TNK(1000n))

    t.ok(b1000.lowerThanOrEquals(b1001), '1000 <= 1001')
    t.ok(b1000.lowerThanOrEquals(b1000Dup), '1000 <= 1000')
    t.ok(!b1001.lowerThanOrEquals(b1000), '1001 !<= 1000')
})

test('Balance#burn 0%', t => {
    const balance = toBalance($TNK(1000n));
    const burned = burn(balance, 0n);
    t.ok(b4a.equals(burned.value, balance.value), 'burn 0% leaves balance unchanged');
});

test('Balance#burn 100%', t => {
    const balance = toBalance($TNK(1000n));
    const burned = burn(balance, 100n);
    const expected = b4a.alloc(BALANCE_BYTE_LENGTH); // zero buffer
    t.ok(b4a.equals(burned.value, expected), 'burn 100% results in zero balance');
});

test('Balance#burn 18% with rounding up', t => {
    // Starting balance in token units (scaled by TOKEN_DECIMALS)
    const startingBalance = $TNK(999n);
    const balance = toBalance(startingBalance);

    // Perform burn 18%
    const burned = burn(balance, 18n); // buffer-based burn, rounding up

    // Compute expected burn buffer using the same buffer logic
    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(18n)),
        toTerm(100n) 
    );

    const roundedQuotient = b4a.equals(remainder, b4a.alloc(BALANCE_BYTE_LENGTH))
        ? quotient
        : addBuffers(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1])); 

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));

    console.log('starting balance:', balance.asBigInt());
    console.log('burned balance:', burned.asBigInt());
    console.log('expected balance:', expected.asBigInt());

    t.ok(b4a.equals(burned.value, expected.value), 'burn 18% with remainder rounds up');
});

test('Balance#burn 1% with rounding up', t => {
    const balance = toBalance($TNK(101n));
    const burned = burn(balance, 1n);

    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(1n)),
        toTerm(100n)
    );

    const roundedQuotient = b4a.compare(remainder, b4a.alloc(BALANCE_BYTE_LENGTH)) > 0
        ? add(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1]))
        : quotient;

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));
    t.ok(b4a.equals(burned.value, expected.value), 'burn 1% rounds up correctly');
});

test('Balance#burn 50% with rounding up', t => {
    const balance = toBalance($TNK(1000n));
    const burned = burn(balance, 50n);

    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(50n)),
        toTerm(100n)
    );

    const roundedQuotient = b4a.compare(remainder, b4a.alloc(BALANCE_BYTE_LENGTH)) > 0
        ? addBuffers(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1]))
        : quotient;

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));
    t.ok(b4a.equals(burned.value, expected.value), 'burn 50% rounds up correctly');
});

test('Balance#burn 100% burns all', t => {
    const balance = toBalance($TNK(1000n));
    const burned = burn(balance, 100n);

    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(100n)),
        toTerm(100n)
    );

    const roundedQuotient = b4a.compare(remainder, b4a.alloc(BALANCE_BYTE_LENGTH)) > 0
        ? addBuffers(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1]))
        : quotient;

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));
    t.ok(b4a.equals(burned.value, expected.value), 'burn 100% results in zero balance');
});

test('Balance#burn edge rounding up', t => {
    const balance = toBalance($TNK(999n)); // small number to force rounding
    const burned = burn(balance, 18n);

    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(18n)),
        toTerm(100n)
    );

    const roundedQuotient = b4a.compare(remainder, b4a.alloc(BALANCE_BYTE_LENGTH)) > 0
        ? addBuffers(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1]))
        : quotient;

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));
    t.ok(b4a.equals(burned.value, expected.value), 'burn 18% with remainder rounds up');
});

test('Balance#burn max buffer edge case', t => {
    const max = b4a.alloc(BALANCE_BYTE_LENGTH, 0xFF);
    const balance = toBalance(max);
    const burned = burn(balance, 1n); // 1% of max

    const { quotient, remainder } = divBuffers(
        mulBuffers(balance.value, toTerm(1n)),
        toTerm(100n)
    );

    const roundedQuotient = b4a.compare(remainder, b4a.alloc(BALANCE_BYTE_LENGTH)) > 0
        ? addBuffers(quotient, b4a.from([...Array(BALANCE_BYTE_LENGTH - 1).fill(0), 1]))
        : quotient;

    const expected = toBalance(subBuffers(balance.value, roundedQuotient));
    t.ok(b4a.equals(burned.value, expected.value), 'burn 1% from max buffer rounds correctly');
});
