import { default as test } from 'brittle';

async function runCheckTests() {
  test.pause();
  await import('./addWhitelist.test.js');
  await import('./postTx.test.js');
  await import('./addWriter.test.js');
  await import('./removeWriter.test.js');
  await import('./addIndexer.test.js');
  await import('./removeIndexer.test.js');
  await import('./addAdmin.test.js');
  test.resume();
}

runCheckTests();