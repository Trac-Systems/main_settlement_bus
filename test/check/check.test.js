import { default as test } from 'brittle';

async function runCheckTests() {
  test.pause();

  await import('./preTx.test.js');
  await import('./postTx.test.js');
  await import('./basicKeyOp.test.js');
  await import('./extendedKeyOp.test.js');
  test.resume();
}

runCheckTests();