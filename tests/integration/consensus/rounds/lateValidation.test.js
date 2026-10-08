import test from 'brittle';
import sinon from 'sinon';
import V1EpochProofProposalRequest from '../../../../src/core/consensus/v1/validators/V1EpochProofProposalRequest.js';
import { EpochStateMachine } from '../../../../src/core/consensus/services/EpochStateMachine.js';
import { CustomEventType } from '../../../../src/utils/constants.js';
import { createConsensusNetwork, waitFor } from '../helpers/consensusNetwork.js';
import { assertSignedEpoch } from '../helpers/epochAssertions.js';

test('validation completing after an epoch is signed cannot delay the next epoch round', async t => {
    const network = await createConsensusNetwork(t);
    const peer = network.nodes[1];
    const validationEntered = network.deferred();
    const resumeValidation = network.deferred();
    const validationCompleted = network.deferred();
    const verify = V1EpochProofProposalRequest.prototype.validateProofProposalVdfProof;
    const validation = sinon.stub(V1EpochProofProposalRequest.prototype, 'validateProofProposalVdfProof').callsFake(async function (proposal) {
        await verify.call(this, proposal);
        if (this._state === peer.state && proposal.epoch.readBigUInt64BE() === 1n) {
            validationEntered.resolve();
            await resumeValidation.promise;
        }
    });
    t.teardown(() => validation.restore());
    function onValidated(event) {
        if (event.proofProposal.epoch.readBigUInt64BE() === 1n) validationCompleted.resolve(event);
    }
    peer.state.on(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, onValidated);
    t.teardown(() => peer.state.off(CustomEventType.EPOCH_PROPOSAL_VALIDATION_SUCCESS, onValidated));

    const first = network.startRound();
    await validationEntered.promise;
    await assertSignedEpoch(t, network);
    await waitFor('first round completion', () => first.completed);
    await network.openOperations(peer);

    // Capture the real machine without changing its transitions or handlers.
    let machine;
    const enter = EpochStateMachine.prototype.enter;
    const entered = sinon.stub(EpochStateMachine.prototype, 'enter').callsFake(function (...args) {
        machine = this;
        return enter.apply(this, args);
    });
    t.teardown(() => entered.restore());
    const vdfEntered = network.deferred();
    const resumeVdf = network.deferred();
    const calculate = peer.operations.calculateVDF.bind(peer.operations);
    peer.operations.calculateVDF = async (...args) => {
        const result = await calculate(...args);
        vdfEntered.resolve();
        await resumeVdf.promise;
        return result;
    };
    const second = network.startRound(peer);
    await vdfEntered.promise;
    t.is(machine.context.currentEpoch, 1n, 'the next round loaded the newly signed parent');
    t.absent(machine.context.remoteProposalReceived);

    resumeValidation.resolve();
    const event = await validationCompleted.promise;
    t.is(event.proofProposal.epoch.readBigUInt64BE(), 1n, 'real protocol validation finishes for the previous epoch');
    t.absent(machine.context.remoteProposalReceived, 'the late success cannot impose a remote proposal wait');
    resumeVdf.resolve();

    await assertSignedEpoch(t, network, { epoch: 2n, proposer: peer });
    await waitFor('second round completion', () => second.completed);
    t.absent(machine.context.remoteProposalReceived);
});
