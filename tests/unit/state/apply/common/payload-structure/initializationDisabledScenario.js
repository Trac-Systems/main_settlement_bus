import { eventFlush, deriveIndexerSequenceState } from '../../../../../helpers/autobaseTestHelpers.js';
import OperationValidationScenarioBase from '../base/OperationValidationScenarioBase.js';
import CompleteStateMessageOperations from '../../../../../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import { config } from '../../../../../helpers/config.js';

export default class InitializationDisabledScenario extends OperationValidationScenarioBase {
	constructor({
		title,
		setupScenario,
		buildValidPayload,
		assertStateUnchanged,
		expectedLogs
	}) {
		super({
			title,
			setupScenario,
			buildValidPayload,
			mutatePayload: passThroughPayload,
			applyInvalidPayload: disableInitializationAndApply,
			assertStateUnchanged,
			expectedLogs
		});
	}
}

function passThroughPayload(_t, payload) {
	return payload;
}

async function disableInitializationAndApply(context, invalidPayload) {
	const adminNode = context.adminBootstrap ?? context.bootstrap;
	if (!adminNode) {
		throw new Error('Initialization disabled scenario requires admin bootstrap context.');
	}

	const txValidity = await deriveIndexerSequenceState(adminNode.base);
	const disablePayload = await new CompleteStateMessageOperations(adminNode.wallet, config).assembleDisableInitializationMessage(
		adminNode.base.local.key,
		txValidity
	);

	await adminNode.base.append(disablePayload);
	await adminNode.base.update();
	await eventFlush();

	await adminNode.base.append(invalidPayload);
	await adminNode.base.update();
	await eventFlush();
}
