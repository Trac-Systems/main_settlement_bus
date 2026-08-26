import fs from 'fs';

import { encodeHtlcLockData } from '../src/utils/htlcLockData.js';

const inputPath = process.argv[2];
const input = inputPath ? fs.readFileSync(inputPath, 'utf8') : fs.readFileSync(0, 'utf8');
const payload = JSON.parse(input);
const lockData = payload.lockData ?? payload;
const addressPrefix = payload.addressPrefix ?? process.argv[3];

console.log(encodeHtlcLockData(lockData, addressPrefix).toString('hex'));
