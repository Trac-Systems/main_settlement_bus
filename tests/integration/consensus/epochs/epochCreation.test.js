import test from 'brittle';
import sinon from 'sinon';
import { safeDecodeApplyOperation } from '../../../../src/codecs/apply/applyOperationCodec.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('consensus commits the same signed epoch on five indexers with low VDF difficulty', async t => {
    const network = await createConsensusNetwork(t);
    const append = sinon.spy(network.proposer.operations, 'appendSetEpoch');

    const round = network.startRound();
    await assertSignedEpoch(t, network);
    await waitFor('round completion', () => round.completed);

    t.is(append.callCount, 1, 'the round appends one SET_EPOCH operation');
    t.is(safeDecodeApplyOperation(append.firstCall.args[0]).seo.app.length, 2);
});
