import b4a from 'b4a';

import { safeEncodeApplyOperation } from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { encodeProofProposal } from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import { CustomEventType } from '../../../../../src/utils/constants.js';
import consensusFixtures from '../../../../fixtures/consensusV1Operation.fixtures.js';
import { config } from '../../../../helpers/config.js';
import { proofProposalApproval } from '../../../../helpers/proofProposal.js';
import {
    appendAndUpdate,
    setupSetLedgerConfigScenario,
} from '../setLedgerConfig/setLedgerConfigScenarioHelpers.js';

export { appendAndUpdate };

export const setupSetEpochScenario = setupSetLedgerConfigScenario;

export async function buildSetEpochPayload(context, configId) {
    const proofData = encodeProofProposal({
        ...consensusFixtures.proofProposal,
        config_id: b4a.from(configId),
    });
    const approvals = [proofProposalApproval(0x15, 0x16)];
    const payload = await applyStateMessageFactory(context.adminBootstrap.wallet, config)
        .buildCompleteSetEpochMessage(
            context.adminBootstrap.wallet.address,
            proofData,
            approvals
        );
    return safeEncodeApplyOperation(payload);
}

export async function appendAndCountEpochEvents(context, payload) {
    let createdEvents = 0;
    const onEpochCreated = () => createdEvents++;
    context.adminBootstrap.state.on(CustomEventType.EPOCH_CREATED, onEpochCreated);
    try {
        await appendAndUpdate(context.adminBootstrap.base, payload);
    } finally {
        context.adminBootstrap.state.off(CustomEventType.EPOCH_CREATED, onEpochCreated);
    }
    return createdEvents;
}
