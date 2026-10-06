import test from 'brittle';

test.pause();
await import('./epochs/epochCreation.test.js');
await import('./membership/quorumRefresh.test.js');
await import('./replication/consensusChannelLifecycle.test.js');
test.resume();
