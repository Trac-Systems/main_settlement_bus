import b4a from 'b4a';

import { setupStateNetwork } from '../../../../helpers/StateNetworkFactory.js';
import {
    defaultOpenHyperbeeView,
    deriveIndexerSequenceState,
    eventFlush,
    seedBootstrapIndexer,
} from '../../../../helpers/autobaseTestHelpers.js';
import { applyStateMessageFactory } from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import { safeDecodeLedgerConfigRootRecord } from '../../../../../src/codecs/apply/ledgerConfigCodec.js';
import { createZeroCommitId } from '../../../../../src/core/ledger-config/ledgerConfigConstants.js';
import { AUTOBASE_VALUE_ENCODING, EntryType } from '../../../../../src/utils/constants.js';
import { config } from '../../../../helpers/config.js';
import { buildAddAdminRequesterPayload } from '../addAdmin/addAdminScenarioHelpers.js';

export function proofOfTimeSnapshot(difficulty = 55_000_000, discriminantSize = 2048) {
    const difficultyBuffer = b4a.alloc(4);
    const discriminantBuffer = b4a.alloc(2);
    difficultyBuffer.writeUInt32BE(difficulty, 0);
    discriminantBuffer.writeUInt16BE(discriminantSize, 0);
    return {
        formatVersion: 1,
        commitmentScheme: 'binary-merkle-v1',
        schemaId: 'trac/autobase-proof-of-time/v1',
        entries: [
            {key: b4a.from('vdf/difficulty'), value: difficultyBuffer},
            {key: b4a.from('vdf/discriminant-size-bits'), value: discriminantBuffer},
        ],
    };
}

export async function setupSetLedgerConfigScenario(t) {
    const context = await setupStateNetwork({
        nodes: 2,
        valueEncoding: AUTOBASE_VALUE_ENCODING,
        open: defaultOpenHyperbeeView,
    });
    seedBootstrapIndexer(context);
    t.teardown(async () => context.teardown());
    await appendAndUpdate(context.adminBootstrap.base, await buildAddAdminRequesterPayload(context));
    return context;
}

export async function buildSetLedgerConfigPayload(
    context,
    snapshot = proofOfTimeSnapshot(),
    previousCommitId = createZeroCommitId(),
    wallet = context.adminBootstrap.wallet
) {
    const txValidity = await deriveIndexerSequenceState(context.adminBootstrap.base);
    const payload = await applyStateMessageFactory(wallet, config)
        .buildCompleteSetLedgerConfigMessage(
            wallet.address,
            txValidity,
            previousCommitId,
            snapshot
        );
    return safeEncodeApplyOperation(payload);
}

export async function appendAndUpdate(base, payload) {
    await base.append(payload);
    await base.update();
    await eventFlush();
}

export async function readCurrentRecord(base) {
    const current = await base.view.get(EntryType.LEDGER_CONFIG_CURRENT);
    if (current === null) return null;
    const rootKey = EntryType.LEDGER_CONFIG_ROOT + b4a.toString(current.value, 'hex');
    const root = await base.view.get(rootKey);
    return {
        current: current.value,
        rootKey,
        record: root ? safeDecodeLedgerConfigRootRecord(root.value) : null,
    };
}

export async function assertNotRecorded(t, base, encodedPayload) {
    const operation = safeDecodeApplyOperation(encodedPayload);
    const transactionEntry = await base.view.get(b4a.toString(operation.lco.tx, 'hex'));
    t.is(transactionEntry, null, 'rejected ledger config has no standard transaction record');
}
