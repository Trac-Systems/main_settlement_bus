import b4a from 'b4a';
import { setupStateNetwork } from '../../../../helpers/StateNetworkFactory.js';
import {
    defaultOpenHyperbeeView,
    deriveIndexerSequenceState,
    eventFlush,
    seedBootstrapIndexer
} from '../../../../helpers/autobaseTestHelpers.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    encodeApplyOperation
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { decodeVdfParameters } from '../../../../../src/core/state/utils/epochProof.js';
import {
    AUTOBASE_VALUE_ENCODING,
    EntryType
} from '../../../../../src/utils/constants.js';
import { uint16ToBuffer, uint32ToBuffer } from '../../../../../src/utils/buffer.js';
import { config } from '../../../../helpers/config.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';

export const INITIAL_VDF_DIFFICULTY = 55_000_000;
export const INITIAL_VDF_DISCRIMINANT_SIZE = 2048;
export const UPDATED_VDF_DIFFICULTY = 60_000_000;

export async function setupSetVdfParamsScenario(t, { initializeGenesis = true } = {}) {
    const context = await setupStateNetwork({
        nodes: 2,
        valueEncoding: AUTOBASE_VALUE_ENCODING,
        open: defaultOpenHyperbeeView
    });

    seedBootstrapIndexer(context);
    t.teardown(async () => context.teardown());

    await appendAndUpdate(context.adminBootstrap.base, await buildAddAdminRequesterPayload(context));
    if (initializeGenesis) {
        await initializeGenesisEpoch(context);
    }

    return context;
}

export async function buildSetVdfParamsPayload(
    context,
    difficulty = UPDATED_VDF_DIFFICULTY,
    wallet = context.adminBootstrap.wallet
) {
    const txValidity = await deriveIndexerSequenceState(context.adminBootstrap.base);
    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetVdfParamsMessage(
            wallet.address,
            txValidity,
            uint32ToBuffer(difficulty)
        );

    return encodeApplyOperation(payload);
}

export async function appendAndUpdate(base, payload) {
    await base.append(payload);
    await base.update();
    await eventFlush();
}

export async function assertVdfParams(t, base, expectedDifficulty, expectedDiscriminantSize) {
    const entry = await base.view.get(EntryType.VDF_PARAMS);
    t.ok(entry, 'VDF params entry exists');

    const decoded = decodeVdfParameters(entry.value);
    t.ok(decoded, 'VDF params entry decodes');
    t.is(decoded.difficulty.readUInt32BE(0), expectedDifficulty, 'VDF difficulty matches');
    t.is(
        decoded.discriminantBitSize.readUInt16BE(0),
        expectedDiscriminantSize,
        'VDF discriminant size is preserved'
    );
}

export async function assertOperationRecorded(t, base, payload, expected) {
    const operation = safeDecodeApplyOperation(payload);
    t.ok(operation?.vpo?.tx, 'SET_VDF_PARAMS payload decodes');

    const entry = await base.view.get(operation.vpo.tx.toString('hex'));
    if (expected) {
        t.ok(entry, 'SET_VDF_PARAMS transaction is recorded');
    } else {
        t.is(entry, null, 'SET_VDF_PARAMS transaction is not recorded');
    }
}

export async function assertVdfParamsMissing(t, base) {
    const entry = await base.view.get(EntryType.VDF_PARAMS);
    t.is(entry, null, 'VDF params remain uninitialized');
}

export function mutateVdfDifficulty(payload, difficulty) {
    const operation = safeDecodeApplyOperation(payload);
    operation.vpo.df = uint32ToBuffer(difficulty);
    return safeEncodeApplyOperation(operation);
}

async function initializeGenesisEpoch(context) {
    const adminNode = context.adminBootstrap;
    const txValidity = await deriveIndexerSequenceState(adminNode.base);
    const payload = await applyStateMessageFactory(adminNode.wallet, config)
        .buildCompleteSetGenesisEpochMessage(
            adminNode.wallet.address,
            txValidity,
            uint32ToBuffer(INITIAL_VDF_DIFFICULTY),
            uint16ToBuffer(INITIAL_VDF_DISCRIMINANT_SIZE)
        );

    await appendAndUpdate(adminNode.base, encodeApplyOperation(payload));

    const entry = await adminNode.base.view.get(EntryType.VDF_PARAMS);
    if (!entry || !b4a.isBuffer(entry.value)) {
        throw new Error('Failed to initialize VDF params for SET_VDF_PARAMS scenario.');
    }
}
