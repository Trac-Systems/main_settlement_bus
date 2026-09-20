#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { delimiter, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import tracCrypto from 'trac-crypto-api';

// Hardcoded settings: fill these in before enabling cron.
const FROM = 'XXXX';
const TO = 'XXXX';
const SECRET_KEY_HEX = 'XXXX'; // Sender's 64-byte Ed25519 secretKey: 128 hex characters.
const AMOUNT_TNK = '0.0001';
const RPC = 'http://127.0.0.1:5000/v1';
const PM2 = 'pm2'; // Use an absolute path if needed.
const PROCESS_NAME = '0.2.21';
const EXPLORER = 'https://explorer.trac.network/api/tx/recent';

async function json(url, body) {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response.json();
}

async function main() {
  const recent = await json(EXPLORER);
  const latest = JSON.parse(recent.transaction)[0];
  const inactive = Date.now() - Date.parse(latest.createdAt) >= 180_000;
  if (!inactive) return;

  if (process.argv.includes('--dry-run')) {
    console.log('Would restart ' + PROCESS_NAME + ', wait 10 seconds, then send ' + AMOUNT_TNK + ' TNK.');
    return;
  }

  console.log('No transactions for 3 minutes. Restarting ' + PROCESS_NAME);
  await promisify(execFile)(PM2, ['restart', PROCESS_NAME], {
    timeout: 15_000,
    env: { ...process.env, PATH: dirname(process.execPath) + delimiter + (process.env.PATH || '') },
  });
  await sleep(10_000);

  const { txv } = await json(RPC + '/txv');
  const [whole, fraction = ''] = AMOUNT_TNK.split('.');
  const amount = BigInt(whole + fraction.padEnd(18, '0')).toString(16).padStart(32, '0');
  const nonce = randomBytes(32);
  // MSB mainnet transfer: network 918, validity, recipient, amount, nonce, type 13.
  const message = Buffer.concat([
    Buffer.from('00000396', 'hex'), Buffer.from(txv, 'hex'), Buffer.from(TO, 'ascii'),
    Buffer.from(amount, 'hex'), nonce, Buffer.from('0000000d', 'hex'),
  ]);
  const hash = Buffer.from(await tracCrypto.hash.blake3(message));
  const signature = Buffer.from(tracCrypto.sign(hash, Buffer.from(SECRET_KEY_HEX, 'hex')));
  const tx = hash.toString('hex');
  const payload = Buffer.from(JSON.stringify({
    type: 13, address: FROM,
    tro: { tx, txv, to: TO, am: amount, in: nonce.toString('hex'), is: signature.toString('hex') },
  })).toString('base64');

  console.log('Sending ' + AMOUNT_TNK + ' TNK. Transaction: ' + tx);
  await json(RPC + '/broadcast-transaction', { payload });
  console.log('Broadcast accepted: ' + tx);
}

main().catch(error => {
  console.error(new Date().toISOString(), error.message);
  process.exitCode = 1;
});
