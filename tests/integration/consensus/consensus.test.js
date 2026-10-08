import test from 'brittle';

test.pause();
await import('./epochs/epochCreation.test.js');
await import('./membership/quorumRefresh.test.js');
await import('./replication/consensusChannelLifecycle.test.js');
await import('./replication/consensusHandshake.test.js');
await import('./rounds/lateApprovals.test.js');
await import('./rounds/lateValidation.test.js');
test.resume();
