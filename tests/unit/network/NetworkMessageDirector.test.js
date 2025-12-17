import { test } from 'brittle';
import b4a from 'b4a';
import PeerWallet from 'trac-wallet';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import NetworkMessageDirector from '../../../src/messages/network/v1/NetworkMessageDirector.js';
import { MessageHeader, MessageType } from '../../../src/utils/protobuf/network.cjs';
import { ResultCode as NetworkResultCode } from '../../../src/utils/constants.js';
import {
    createMessage,
    encodeCapabilities,
    safeWriteUInt32BE,
    sessionIdToBuffer,
    timestampToBuffer
} from '../../../src/utils/buffer.js';
import { addressToBuffer } from '../../../src/core/state/utils/address.js';
import { testKeyPair1 } from '../../fixtures/apply.fixtures.js';

function createWallet() {
    const keyPair = {
        publicKey: b4a.from(testKeyPair1.publicKey, 'hex'),
        secretKey: b4a.from(testKeyPair1.secretKey, 'hex')
    };
    return NetworkWalletFactory.provide({
        enableWallet: false,
        keyPair,
        networkPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX
    });
}

function uniqueResultCodes() {
    return [...new Set(Object.values(NetworkResultCode))].sort((a, b) => a - b);
}

test('NetworkMessageDirector builds validator connection request and verifies signature', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];

    const header = await director.buildValidatorConnectionRequest(sessionId, wallet.address, caps);
    t.is(header.type, MessageType.VALIDATOR_CONNECTION_REQUEST);
    t.is(header.session_id, sessionId);
    t.alike(header.capabilities, caps);

    const msg = createMessage(
        header.type,
        sessionIdToBuffer(header.session_id),
        timestampToBuffer(header.timestamp),
        addressToBuffer(wallet.address),
        header.validator_connection_request.nonce,
        encodeCapabilities(caps)
    );
    const hash = await PeerWallet.blake3(msg);
    t.ok(wallet.verify(header.validator_connection_request.signature, hash, wallet.publicKey));
});

test('NetworkMessageDirector builds liveness request and verifies signature', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const data = b4a.from('ping', 'utf8');

    const header = await director.buildLivenessRequest(sessionId, data, caps);
    t.is(header.type, MessageType.LIVENESS_REQUEST);
    t.is(header.session_id, sessionId);
    t.alike(header.capabilities, caps);

    const msg = createMessage(
        header.type,
        sessionIdToBuffer(header.session_id),
        timestampToBuffer(header.timestamp),
        header.liveness_request.nonce,
        encodeCapabilities(caps)
    );
    const hash = await PeerWallet.blake3(msg);
    t.ok(wallet.verify(header.liveness_request.signature, hash, wallet.publicKey));
});

test('NetworkMessageDirector iterates liveness response ResultCode values', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const data = b4a.from('ping', 'utf8');

    for (const code of uniqueResultCodes()) {
        const header = await director.buildLivenessResponse(sessionId, data, caps, code);
        t.is(header.type, MessageType.LIVENESS_RESPONSE);
        t.is(header.liveness_response.result, code);

        const msg = createMessage(
            header.type,
            sessionIdToBuffer(header.session_id),
            timestampToBuffer(header.timestamp),
            header.liveness_response.nonce,
            safeWriteUInt32BE(code, 0),
            encodeCapabilities(caps)
        );
        const hash = await PeerWallet.blake3(msg);
        t.ok(wallet.verify(header.liveness_response.signature, hash, wallet.publicKey));

        const decoded = MessageHeader.decode(MessageHeader.encode(header));
        t.is(decoded.liveness_response.result, code);
    }
});

test('NetworkMessageDirector builds broadcast transaction request and verifies signature', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const data = b4a.from('deadbeef', 'hex');
    const caps = ['cap:b', 'cap:a'];

    const header = await director.buildBroadcastTransactionRequest(sessionId, data, caps);
    t.is(header.type, MessageType.BROADCAST_TRANSACTION_REQUEST);
    t.is(header.session_id, sessionId);
    t.alike(header.capabilities, caps);
    t.alike(header.broadcast_transaction_request.data, data);

    const message = createMessage(
        header.type,
        sessionIdToBuffer(sessionId),
        timestampToBuffer(header.timestamp),
        data,
        header.broadcast_transaction_request.nonce,
        encodeCapabilities(caps)
    );
    const hash = await PeerWallet.blake3(message);
    t.ok(wallet.verify(header.broadcast_transaction_request.signature, hash, wallet.publicKey));

    const decoded = MessageHeader.decode(MessageHeader.encode(header));
    t.is(decoded.type, MessageType.BROADCAST_TRANSACTION_REQUEST);
});

test('NetworkMessageDirector iterates broadcast transaction response ResultCode values', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];

    for (const code of uniqueResultCodes()) {
        const header = await director.buildBroadcastTransactionResponse(sessionId, caps, code);
        t.is(header.type, MessageType.BROADCAST_TRANSACTION_RESPONSE);
        t.is(header.broadcast_transaction_response.result, code);

        const msg = createMessage(
            header.type,
            sessionIdToBuffer(header.session_id),
            timestampToBuffer(header.timestamp),
            header.broadcast_transaction_response.nonce,
            safeWriteUInt32BE(code, 0),
            encodeCapabilities(caps)
        );
        const hash = await PeerWallet.blake3(msg);
        t.ok(wallet.verify(header.broadcast_transaction_response.signature, hash, wallet.publicKey));

        const decoded = MessageHeader.decode(MessageHeader.encode(header));
        t.is(decoded.broadcast_transaction_response.result, code);
    }
});

test('NetworkMessageDirector iterates validator connection response ResultCode values', async t => {
    const wallet = createWallet();
    const director = new NetworkMessageDirector(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const otherAddress =
        'trac1xm76l9qaujh7vqktk8302mw9sfrxau3l45w62hqfl4kasswt6yts0autkh';

    for (const code of uniqueResultCodes()) {
        const header = await director.buildValidatorConnectionResponse(
            sessionId,
            otherAddress,
            caps,
            code
        );
        t.is(header.type, MessageType.VALIDATOR_CONNECTION_RESPONSE);
        t.is(header.validator_connection_response.result, code);

        const msg = createMessage(
            header.type,
            sessionIdToBuffer(header.session_id),
            timestampToBuffer(header.timestamp),
            addressToBuffer(otherAddress),
            header.validator_connection_response.nonce,
            safeWriteUInt32BE(code, 0),
            encodeCapabilities(caps)
        );
        const hash = await PeerWallet.blake3(msg);
        t.ok(wallet.verify(header.validator_connection_response.signature, hash, wallet.publicKey));
    }
});
