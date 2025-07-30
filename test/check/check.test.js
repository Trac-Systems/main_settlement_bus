import { default as test } from 'brittle';

async function runCheckTests() {
  test.pause();

  await import('./basicKeyOp.test.js');
  await import('./extendedKeyOp.test.js');
  await import('./postTx.test.js');
  await import('./preTx.test.js');
  test.resume();
}

runCheckTests();