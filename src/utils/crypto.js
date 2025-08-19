if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
}

import { blake3 } from '@tracsystems/blake3';
import b4a from 'b4a';

export async function blake3Hash(input, hashLength = 32) {
  if (typeof input === 'string') {
    input = b4a.from(input, 'utf8');
  }

  const hashBytes = await blake3(input, hashLength);
  return b4a.from(hashBytes);
}
