import { test } from 'brittle';
import b4a from 'b4a';

import EpochProofProposalService from '../../../../src/core/consensus/services/EpochProofProposalService.js';
import { PROOF_OF_TIME_SCHEMA_ID } from '../../../../src/core/ledger-config/index.js';

test('EpochProofProposalService reads the current epoch through the signed State API', async t => {
    let currentEpochReads = 0;
    let resolveFirstRead;
    const firstRead = new Promise(resolve => {
        resolveFirstRead = resolve;
    });
    const state = {
        async requireLedgerConfigConsensusReady() {
            return {
                descriptor: {
                    schemaId: PROOF_OF_TIME_SCHEMA_ID,
                    configId: b4a.alloc(32, 1),
                },
                adapterConfig: {
                    vdfDifficulty: 55_000_000,
                    vdfDiscriminantSize: 2048,
                },
            };
        },
        async requireCurrentEpoch() {
            currentEpochReads++;
            resolveFirstRead();
            return 0n;
        },
    };
    const service = new EpochProofProposalService(
        state,
        {},
        { address: 'unused' },
        { epochInterval: 1, debug: false, addressPrefix: 'trac' }
    );

    await service.ready();
    service.start();
    await firstRead;
    await service.stop();
    await service.close();

    t.is(currentEpochReads, 1, 'worker reads the initialized epoch without using the removed lastEpoch API');
});
