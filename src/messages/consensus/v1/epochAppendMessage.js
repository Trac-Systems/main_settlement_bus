import b4a from 'b4a';
import { encodeEpochAppendIntent } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { uint16ToBuffer, uint32ToBuffer, uint64ToBuffer } from '../../../utils/buffer.js';
import { ConsensusOperationType } from '../../../utils/constants.js';
import { EPOCH_APPENDER_SELECTION_VERSION } from '../../../core/consensus/epochAppenderSelection/epochAppenderSelectionState.js';

/** Convert the signed request identity to protobuf fields without serializing local membership. */
export function toAppendIntent(request) {
    return {
        network_id: uint16ToBuffer(request.networkId),
        bootstrap: b4a.from(request.bootstrap, 'hex'),
        epoch: uint64ToBuffer(BigInt(request.targetEpoch)),
        parent_hash: b4a.from(request.parentHash, 'hex'),
        membership_context: b4a.from(request.membershipContext, 'hex'),
        config_hash: b4a.from(request.configHash, 'hex'),
        request_id: request.requestId,
        payload_hash: b4a.from(request.payloadHash, 'hex'),
        logical_counter: uint64ToBuffer(request.logicalCounter),
        requester: b4a.from(request.requester, 'hex'),
        selection_version: request.selectionVersion ?? EPOCH_APPENDER_SELECTION_VERSION,
    };
}

/** Restore the wire identity; validators resolve membership separately from signed state. */
export function fromAppendIntent(intent) {
    return {
        networkId: intent.network_id.readUInt16BE(0),
        bootstrap: b4a.toString(intent.bootstrap, 'hex'),
        targetEpoch: intent.epoch.readBigUInt64BE(0).toString(),
        parentHash: b4a.toString(intent.parent_hash, 'hex'),
        membershipContext: b4a.toString(intent.membership_context, 'hex'),
        configHash: b4a.toString(intent.config_hash, 'hex'),
        requestId: intent.request_id,
        payloadHash: b4a.toString(intent.payload_hash, 'hex'),
        logicalCounter: intent.logical_counter.readBigUInt64BE(0),
        requester: b4a.toString(intent.requester, 'hex'),
        selectionVersion: intent.selection_version,
    };
}

/** Domain separation and length framing bind the entire header, intent and responder. */
export function appendSignatureData(message) {
    const body = message.type === ConsensusOperationType.REQUEST ? message.request : message.reply;
    const session = b4a.from(message.session_id);
    const parts = [
        b4a.from('msb/epoch-appender-election/v2\0'),
        uint32ToBuffer(message.type),
        uint32ToBuffer(session.length),
        session,
        uint64ToBuffer(BigInt(message.timestamp)),
        encodeEpochAppendIntent(body.intent),
        body.responder ?? b4a.alloc(0),
    ];
    if (message.type === ConsensusOperationType.REPLY) {
        parts.push(uint32ToBuffer(body.vote_status), body.observed_counter, encodeEpochAppendIntent(body.vote));
    }
    return b4a.concat(parts);
}
