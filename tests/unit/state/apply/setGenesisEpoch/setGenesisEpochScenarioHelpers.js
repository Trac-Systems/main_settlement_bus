import b4a from 'b4a';

import {
    safeDecodeApplyOperation,
    safeDecodeEpochProof,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { safeDecodeProofProposal } from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import { EntryType } from '../../../../../src/utils/constants.js';
import {
    deriveIndexerSequenceState,
} from '../../../../helpers/autobaseTestHelpers.js';
import { config } from '../../../../helpers/config.js';
import {
    appendAndUpdate,
    setupSetLedgerConfigScenario,
} from '../setLedgerConfig/setLedgerConfigScenarioHelpers.js';

const LEGACY_VDF_PARAMS_KEY = '/parameters/vdf';

export { appendAndUpdate };

export const setupSetGenesisEpochScenario = setupSetLedgerConfigScenario;

export async function buildSetGenesisEpochPayload(context, configId) {
    const admin = context.adminBootstrap;
    const txValidity = await deriveIndexerSequenceState(admin.base);
    const payload = await applyStateMessageFactory(admin.wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            admin.wallet.address,
            txValidity,
            configId
        );

    return safeEncodeApplyOperation(payload);
}

export async function assertGenesisEpochMissing(t, base, payload) {
    t.is(await base.view.get(EntryType.EPOCH_CURRENT), null, 'current epoch is not initialized');
    t.is(await base.view.get(EntryType.EPOCH + '0'), null, 'genesis epoch is not initialized');

    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.sgo?.tx, 'genesis payload decodes');
    t.is(
        await base.view.get(b4a.toString(operation.sgo.tx, 'hex')),
        null,
        'rejected genesis transaction is not recorded'
    );
}

export async function assertGenesisEpochApplied(t, base, payload, expectedConfigId) {
    const currentEpoch = await base.view.get(EntryType.EPOCH_CURRENT);
    t.ok(currentEpoch, 'current epoch is initialized');
    t.ok(b4a.equals(currentEpoch.value, b4a.alloc(8)), 'current epoch is zero');

    const epochZero = await base.view.get(EntryType.EPOCH + '0');
    t.ok(epochZero, 'genesis epoch hash is stored');
    const epochProofEntry = await base.view.get(
        EntryType.EPOCH_HASH + b4a.toString(epochZero.value, 'hex')
    );
    t.ok(epochProofEntry, 'genesis epoch proof is stored');

    const epochProof = safeDecodeEpochProof(epochProofEntry.value);
    const proposal = safeDecodeProofProposal(epochProof?.pd);
    t.ok(proposal, 'genesis proof proposal decodes');
    t.ok(
        b4a.equals(proposal.config_id, expectedConfigId),
        'genesis proof is anchored to the ledger config id'
    );

    const operation = safeDecodeApplyOperation(payload);
    t.ok(await base.view.get(b4a.toString(operation.sgo.tx, 'hex')), 'genesis transaction is recorded');
    t.is(await base.view.get(LEGACY_VDF_PARAMS_KEY), null, 'legacy VDF params are not stored');
}
