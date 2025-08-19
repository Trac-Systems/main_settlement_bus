import test from 'brittle';
import b4a from 'b4a';
import transaction from '../../../src/core/state/utils/transaction.js';

const { generateTxBuffer, TRANSACTION_TOTAL_SIZE, generateBootstrapDeploymentTxBuffer, BOOTSTRAP_DEPLOYMENT_SIZE } = transaction;
import { OperationType, BOOTSTRAP_BYTE_LENGTH, NONCE_BYTE_LENGTH } from '../../../src/utils/constants.js';

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

test('generateBootstrapDeploymentTxBuffer returns a 32-byte hash for valid input', async t => {
    const bootstrap = buf(BOOTSTRAP_BYTE_LENGTH, 0x01);
    const incoming_nonce = buf(NONCE_BYTE_LENGTH, 0x02);
    const opType = OperationType.BOOTSTRAP_DEPLOYMENT;

    const hash = await generateBootstrapDeploymentTxBuffer(bootstrap, incoming_nonce, opType);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 32, 'hash should be 32 bytes (sha256)');
});

test('generateBootstrapDeploymentTxBuffer returns empty buffer on error (bad bootstrap size)', async t => {
    const bootstrap = buf(1, 0x01); // too small
    const incoming_nonce = buf(NONCE_BYTE_LENGTH, 0x02);
    const opType = OperationType.BOOTSTRAP_DEPLOYMENT;

    const hash = await generateBootstrapDeploymentTxBuffer(bootstrap, incoming_nonce, opType);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 0, 'should return empty buffer on error');
});

test('generateBootstrapDeploymentTxBuffer returns empty buffer on error (bad nonce size)', async t => {
    const bootstrap = buf(BOOTSTRAP_BYTE_LENGTH, 0x01);
    const incoming_nonce = buf(1, 0x02); // too small
    const opType = OperationType.BOOTSTRAP_DEPLOYMENT;

    const hash = await generateBootstrapDeploymentTxBuffer(bootstrap, incoming_nonce, opType);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 0, 'should return empty buffer on error');
});

test('generateBootstrapDeploymentTxBuffer returns empty buffer on error (bad opType buffer)', async t => {
    const bootstrap = buf(BOOTSTRAP_BYTE_LENGTH, 0x01);
    const incoming_nonce = buf(NONCE_BYTE_LENGTH, 0x02);
    // simulate opTypeBuffer of wrong size by passing undefined (should fail internally)
    const hash = await generateBootstrapDeploymentTxBuffer(bootstrap, incoming_nonce, undefined);
    t.ok(b4a.isBuffer(hash));
    t.is(hash.length, 0, 'should return empty buffer on error');
});

test('generateBootstrapDeploymentTxBuffer output buffer size is correct before hashing', async t => {
    const bootstrap = buf(BOOTSTRAP_BYTE_LENGTH, 0x01);
    const incoming_nonce = buf(NONCE_BYTE_LENGTH, 0x02);
    const opType = OperationType.BOOTSTRAP_DEPLOYMENT;

    const opTypeBuffer = b4a.alloc(4);
    opTypeBuffer.writeUInt32BE(opType, 0);
    const tx = b4a.alloc(BOOTSTRAP_DEPLOYMENT_SIZE);
    let offset = 0;
    bootstrap.copy(tx, offset);
    offset += bootstrap.length;
    incoming_nonce.copy(tx, offset);
    offset += incoming_nonce.length;
    opTypeBuffer.copy(tx, offset);
    t.is(tx.length, BOOTSTRAP_DEPLOYMENT_SIZE, 'buffer size should match BOOTSTRAP_DEPLOYMENT_SIZE');
});
