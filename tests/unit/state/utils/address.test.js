import { test } from 'brittle';
import b4a from 'b4a';
import { randomAddress } from '../stateTestUtils.js';
import addressUtils from '../../../../src/core/state/utils/address.js';
import { address as addressApi } from 'trac-crypto-api';

test('Convert bech32m address to and from buffer - Happy Path', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    const addressBuffer = addressUtils.addressToBuffer(address, hrp);
    const reconstructedAddress = addressUtils.bufferToAddress(addressBuffer, hrp);

    t.ok(addressUtils.isAddressValid(address, hrp), 'Original address should be valid');
    t.ok(b4a.isBuffer(addressBuffer), 'Address buffer should be a Buffer instance');
    t.is(typeof reconstructedAddress, 'string', 'Reconstructed address should be a string');
    t.is(address, reconstructedAddress, 'Reconstructed address should match original');
    t.is(address.length, addressApi.size(hrp), 'Address length should match expected size');
    t.is(addressBuffer.length, addressApi.size(hrp), 'Address buffer length should match address length');
    t.ok(addressUtils.isAddressValid(addressBuffer, hrp), 'Canonical address buffers should be valid');
    t.ok(b4a.equals(addressUtils.addressToBuffer(reconstructedAddress, hrp), addressBuffer), 'Roundtrip preserves the exact bytes');
});

test('Address helpers reject high-bit aliases at every byte position', t => {
    const hrp = 'test';
    const original = addressUtils.addressToBuffer(randomAddress(hrp), hrp);

    for (let index = 0; index < original.length; index++) {
        const changed = b4a.from(original);
        changed[index] |= 0x80;

        t.is(addressUtils.bufferToAddress(changed, hrp), null, `byte ${index} cannot alias the original address`);
        t.is(addressUtils.isAddressValid(changed, hrp), false, `byte ${index} is invalid as a buffer`);
        t.is(addressUtils.addressToBuffer(changed, hrp).length, 0, `byte ${index} cannot be re-encoded`);
    }
});

test('bufferToAddress rejects non-buffer inputs', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);

    for (const input of [null, undefined, 42, address, {toString: () => address}, Array.from(b4a.from(address))]) {
        t.is(addressUtils.bufferToAddress(input, hrp), null);
    }
});

test('Address helpers preserve byte-array views without reading outside the view', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    const original = addressUtils.addressToBuffer(address, hrp);
    const backing = b4a.concat([b4a.from([0xff]), original, b4a.from([0xff])]);
    const view = backing.subarray(1, backing.length - 1);
    const byteArray = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

    t.is(addressUtils.bufferToAddress(view, hrp), address);
    t.is(addressUtils.bufferToAddress(byteArray, hrp), address);
    t.ok(addressUtils.isAddressValid(byteArray, hrp));
    t.ok(b4a.equals(addressUtils.addressToBuffer(byteArray, hrp), original));
});

test('Address byte conversion preserves existing format-only validation', t => {
    const hrp = 'test';
    const original = randomAddress(hrp);
    const address = original.slice(0, -1) + (original.endsWith('q') ? 'p' : 'q');
    const buffer = b4a.from(address, 'ascii');

    t.absent(addressApi.canDecode(address), 'the checksum is invalid');
    t.ok(addressUtils.isAddressValid(address, hrp), 'string validation remains format-only');
    t.ok(addressUtils.isAddressValid(buffer, hrp), 'buffer validation remains format-only');
    t.is(addressUtils.bufferToAddress(buffer, hrp), address);
    t.ok(b4a.equals(addressUtils.addressToBuffer(address, hrp), buffer));
});

test('isAddressValid returns false for wrong prefix', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    t.not(addressUtils.isAddressValid(address, 'wrong'), 'Should be invalid for wrong prefix');
});

test('isAddressValid returns false for wrong length', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    const short = address.slice(0, -1);
    t.not(addressUtils.isAddressValid(short, hrp), 'Should be invalid for short address');
    const long = address + 'a';
    t.not(addressUtils.isAddressValid(long, hrp), 'Should be invalid for long address');
});

test('isAddressValid returns false for invalid characters', t => {
    const hrp = 'test';
    let address = randomAddress(hrp);
    // Replace a char with an invalid one
    address = address.slice(0, 6) + 'A' + address.slice(7);
    t.not(addressUtils.isAddressValid(address, hrp), 'Should be invalid for non-bech32 chars');
});

test('addressToBuffer returns empty buffer for invalid address', t => {
    const invalid = 'notanaddress';
    const buf = addressUtils.addressToBuffer(invalid, 'test');
    t.ok(b4a.isBuffer(buf));
    t.is(buf.length, 0, 'Should return empty buffer');
});

test('bufferToAddress returns null for invalid buffer', t => {
    const buf = b4a.alloc(10, 0x61); // too short
    t.is(addressUtils.bufferToAddress(buf, 'test'), null);
});

test('bufferToAddress returns null for buffer with invalid chars', t => {
    const hrp = 'test';
    const address = randomAddress(hrp);
    const buf = b4a.from(address, 'ascii');
    // Corrupt the buffer
    buf[5] = 0x41; // 'A' (not bech32)
    t.is(addressUtils.bufferToAddress(buf, hrp), null);
});
