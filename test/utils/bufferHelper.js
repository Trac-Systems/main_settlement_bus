import b4a from "b4a";
import { LICENSE_BYTE_LENGTH } from "../../src/utils/constants.js";

export function encodeLE(num) {
  if (typeof num !== 'bigint') {
    num = BigInt(num);
  }

  if (num < 0n || num > 0xFFFFFFFFn) {
    throw new RangeError('Value must be between 0 and 2^32 - 1');
  }

  const buf = b4a.alloc(LICENSE_BYTE_LENGTH);
  let temp = num;

  for (let i = 0; i < LICENSE_BYTE_LENGTH; i++) {
    buf[i] = Number(temp & 0xFFn); 
    temp >>= 8n;                   
  }

  return buf;
}