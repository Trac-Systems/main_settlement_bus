import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import {applyStateMessageFactory} from '../../../../../src/messages/state/applyStateMessageFactory.js';
import {
    safeDecodeApplyOperation,
    safeEncodeApplyOperation,
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import addressUtils from '../../../../../src/core/state/utils/address.js';
import nodeEntryUtils from '../../../../../src/core/state/utils/nodeEntry.js';
import * as escrowEntryUtils from '../../../../../src/core/state/utils/escrowEntry.js';
import {$TNK} from '../../../../../src/core/state/utils/balance.js';
import {EntryType} from '../../../../../src/utils/constants.js';
import {uint64ToBuffer} from '../../../../../src/utils/buffer.js';
import {deriveIndexerSequenceState, eventFlush} from '../../../../helpers/autobaseTestHelpers.js';
import {config} from '../../../../helpers/config.js';
import {createHtlcLockTransactionHash} from '../../../../helpers/htlcLock.js';
import {
    initializeBalances,
    setupAdminNetwork,
} from '../common/commonScenarioHelper.js';
import {
    applyWithEntryOverrides,
    appendAndUpdate,
    buildSetGenesisEpochPayload,
} from '../setGenesisEpoch/setGenesisEpochScenarioHelpers.js';

export const DEFAULT_PRINCIPAL = $TNK(2n);
export const DEFAULT_SURCHARGE = $TNK(1n);
export const DEFAULT_REFUND_EPOCH = uint64ToBuffer(10n);
export const DEFAULT_PREIMAGE = b4a.alloc(32, 0x31);
export const DEFAULT_POLICY_HASH = b4a.alloc(32, 0x41);

export async function setupHtlcLockScenario(
    t,
    {initializeEpoch = true, makerBalance = $TNK(10n)} = {}
) {
    const context = await setupAdminNetwork(t, {nodes: 3});
    const validatorPeer = context.adminBootstrap;
    const makerPeer = context.peers[1];
    const claimantPeer = context.peers[2];

    if (initializeEpoch) {
        await appendAndUpdate(
            validatorPeer.base,
            await buildSetGenesisEpochPayload(context)
        );
    }

    await initializeBalances(context, [[makerPeer.wallet.address, makerBalance]]);
    await context.sync();

    context.htlcLockScenario = {validatorPeer, makerPeer, claimantPeer};
    return context;
}

export async function buildHtlcLockPayload(
    context,
    {
        amount = DEFAULT_PRINCIPAL,
        feeAmount = DEFAULT_SURCHARGE,
        feeRecipient = context.htlcLockScenario.claimantPeer.wallet.address,
        hashLock = tracCryptoApi.hash.sha256(DEFAULT_PREIMAGE),
        refundEpoch = DEFAULT_REFUND_EPOCH,
        policyHash = DEFAULT_POLICY_HASH,
        nonce,
        cosignerPeer = null,
    } = {}
) {
    const {validatorPeer, makerPeer, claimantPeer} = context.htlcLockScenario;
    const txValidity = await deriveIndexerSequenceState(validatorPeer.base);
    const signerSet = [makerPeer.wallet.publicKey];
    const lock = {
        claimAddress: claimantPeer.wallet.address,
        refundAddress: makerPeer.wallet.address,
        amount,
        feeAmount,
        feeRecipient,
        hashLock,
        refundEpoch,
        policyHash,
        signerSet,
        threshold: 1,
        ...(nonce && {nonce}),
    };

    if (cosignerPeer) {
        const effectiveNonce = nonce ?? b4a.alloc(32, 0x51);
        lock.nonce = effectiveNonce;
        lock.signerSet = [makerPeer.wallet.publicKey, cosignerPeer.wallet.publicKey];
        lock.threshold = 2;

        const wireTerms = {
            txv: txValidity,
            ca: addressUtils.addressToBuffer(claimantPeer.wallet.address, config.addressPrefix),
            ra: addressUtils.addressToBuffer(makerPeer.wallet.address, config.addressPrefix),
            am: amount,
            fa: feeAmount,
            ...(feeRecipient && {
                fr: addressUtils.addressToBuffer(feeRecipient, config.addressPrefix),
            }),
            hl: hashLock,
            re: refundEpoch,
            ...(policyHash && {ph: policyHash}),
            ss: lock.signerSet,
            th: b4a.from([lock.threshold]),
            in: effectiveNonce,
        };
        const tx = await createHtlcLockTransactionHash(
            config.networkId,
            addressUtils.addressToBuffer(makerPeer.wallet.address, config.addressPrefix),
            wireTerms
        );
        lock.cosignerSignatures = [cosignerPeer.wallet.sign(tx)];
    }

    const partial = await applyStateMessageFactory(makerPeer.wallet, config)
        .buildPartialHtlcLockOperationMessage(
            makerPeer.wallet.address,
            txValidity,
            lock
        );
    const complete = await applyStateMessageFactory(validatorPeer.wallet, config)
        .buildCompleteHtlcLockOperationMessage(partial.address, partial.hlo);
    return safeEncodeApplyOperation(complete);
}

export async function appendHtlcLock(context, payload) {
    const {validatorPeer} = context.htlcLockScenario;
    await validatorPeer.base.append(payload);
    await validatorPeer.base.update();
    await eventFlush();
}

export async function appendHtlcLockAtCurrentEpoch(context, payload, currentEpoch) {
    await applyWithEntryOverrides(
        context,
        payload,
        new Map([[EntryType.EPOCH_CURRENT, uint64ToBuffer(currentEpoch)]])
    );
}

export async function appendHtlcLockBatch(context, payloads) {
    const {validatorPeer} = context.htlcLockScenario;
    await validatorPeer.base.append(payloads);
    await validatorPeer.base.update();
    await eventFlush();
}

export async function readNodeEntry(base, address) {
    const entry = await base.view.get(address);
    return entry ? nodeEntryUtils.decode(entry.value) : null;
}

export async function readLockState(base, payload) {
    const operation = safeDecodeApplyOperation(payload);
    const lockIdHex = operation?.hlo?.tx?.toString('hex');
    if (!lockIdHex) return {escrow: null, operation: null};

    const [escrowRecord, operationRecord] = await Promise.all([
        base.view.get(EntryType.HTLC_ESCROW + lockIdHex),
        base.view.get(lockIdHex),
    ]);
    return {
        escrow: escrowRecord
            ? escrowEntryUtils.decode(escrowRecord.value, config.addressPrefix)
            : null,
        escrowRecord,
        operation: operationRecord,
    };
}

export function decodeHtlcLockPayload(payload) {
    return safeDecodeApplyOperation(payload);
}
