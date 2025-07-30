import test from 'brittle';
import b4a from 'b4a';
import transaction from '../../../src/core/state/utils/transaction.js';

const { generateTxBuffer, TRANSACTION_TOTAL_SIZE } = transaction;

function buf(size, fill = 0) {
    return b4a.alloc(size, fill);
}

test('generateTxBuffer returns a 32-byte hash for valid input', async t => {
    const bootstrap = buf(8, 0x01);
    const msb_bootstrap = buf(8, 0x02);
    const validator_address = buf(20, 0x03);
    const local_writer_key = buf(32, 0x04);
    const local_address = buf(20, 0x05);
    const content_hash = buf(32, 0x06);
    const nonce = buf(8, 0x07);

    const total = bootstrap.length + msb_bootstrap.length + validator_address.length + local_writer_key.length + local_address.length + content_hash.length + nonce.length;
    t.is(total, TRANSACTION_TOTAL_SIZE, 'sum of buffer sizes matches TRANSACTION_TOTAL_SIZE');

    const hash = await generateTxBuffer(bootstrap, msb_bootstrap, validator_address, local_writer_key, local_address, content_hash, nonce);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 32, 'hash should be 32 bytes (sha256)');
});

test('generateTxBuffer returns empty buffer on error', async t => {
    const bootstrap = buf(1, 0x01); // too small
    const msb_bootstrap = buf(8, 0x02);
    const validator_address = buf(20, 0x03);
    const local_writer_key = buf(32, 0x04);
    const local_address = buf(20, 0x05);
    const content_hash = buf(32, 0x06);
    const nonce = buf(8, 0x07);

    const hash = await generateTxBuffer(bootstrap, msb_bootstrap, validator_address, local_writer_key, local_address, content_hash, nonce);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 0, 'should return empty buffer on error');
});
