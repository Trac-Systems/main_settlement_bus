import { test } from 'brittle';
import b4a from 'b4a';
import PeerWallet from 'trac-wallet';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

import NetworkWalletFactory from '../../../src/core/network/identity/NetworkWalletFactory.js';
import NetworkMessageBuilder from '../../../src/messages/network/v1/NetworkMessageBuilder.js';
import { MessageHeader, MessageType } from '../../../src/utils/protobuf/network.cjs';
import {
    NetworkOperationType,
    ResultCode as NetworkResultCode
} from '../../../src/utils/constants.js';
import { errorMessageIncludes } from '../../helpers/regexHelper.js';
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

test('NetworkMessageBuilder builds validator connection request and verifies signature', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];

    await builder
        .setType(NetworkOperationType.VALIDATOR_CONNECTION_REQUEST)
        .setSessionId(sessionId)
        .setTimestamp()
        .setIssuerAddress(wallet.address)
        .setCapabilities(caps)
        .buildPayload();

    const header = builder.getResult();
    t.is(header.type, MessageType.VALIDATOR_CONNECTION_REQUEST);
    t.is(header.session_id, sessionId);
    t.alike(header.capabilities, caps);
    t.ok(b4a.isBuffer(header.validator_connection_request.nonce));
    t.ok(b4a.isBuffer(header.validator_connection_request.signature));

    const message = createMessage(
        header.type,
        sessionIdToBuffer(sessionId),
        timestampToBuffer(header.timestamp),
        addressToBuffer(wallet.address),
        header.validator_connection_request.nonce,
        encodeCapabilities(caps)
    );
    const hash = await PeerWallet.blake3(message);
    t.ok(wallet.verify(header.validator_connection_request.signature, hash, wallet.publicKey));

    const roundTrip = MessageHeader.decode(MessageHeader.encode(header));
    t.is(roundTrip.type, MessageType.VALIDATOR_CONNECTION_REQUEST);
});

test('NetworkMessageBuilder iterates validator connection response ResultCode values', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);

    const otherAddress = 'trac1xm76l9qaujh7vqktk8302mw9sfrxau3l45w62hqfl4kasswt6yts0autkh';
    const caps = ['cap:b', 'cap:a'];

    for (const code of uniqueResultCodes()) {
        builder.reset();
        await builder
            .setType(NetworkOperationType.VALIDATOR_CONNECTION_RESPONSE)
            .setSessionId(1)
            .setTimestamp()
            .setIssuerAddress(otherAddress)
            .setCapabilities(caps)
            .setResultCode(code)
            .buildPayload();

        const header = builder.getResult();
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

        const decoded = MessageHeader.decode(MessageHeader.encode(header));
        t.is(decoded.validator_connection_response.result, code);
    }
});

test('NetworkMessageBuilder iterates liveness response ResultCode values', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);
    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const data = b4a.from('ping', 'utf8');

    for (const code of uniqueResultCodes()) {
        builder.reset();
        await builder
            .setType(NetworkOperationType.LIVENESS_RESPONSE)
            .setSessionId(sessionId)
            .setTimestamp()
            .setData(data)
            .setCapabilities(caps)
            .setResultCode(code)
            .buildPayload();

        const header = builder.getResult();
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

test('NetworkMessageBuilder builds liveness request and verifies signature (data not signed)', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const data = b4a.from('ping', 'utf8');

    await builder
        .setType(NetworkOperationType.LIVENESS_REQUEST)
        .setSessionId(sessionId)
        .setTimestamp()
        .setData(data)
        .setCapabilities(caps)
        .buildPayload();

    const header = builder.getResult();
    t.is(header.type, MessageType.LIVENESS_REQUEST);
    t.ok(b4a.isBuffer(header.liveness_request.nonce));
    t.ok(b4a.isBuffer(header.liveness_request.signature));

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

test('NetworkMessageBuilder iterates broadcast transaction response ResultCode values', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);
    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];

    for (const code of uniqueResultCodes()) {
        builder.reset();
        await builder
            .setType(NetworkOperationType.BROADCAST_TRANSACTION_RESPONSE)
            .setSessionId(sessionId)
            .setTimestamp()
            .setCapabilities(caps)
            .setResultCode(code)
            .buildPayload();

        const header = builder.getResult();
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

test('NetworkMessageBuilder builds broadcast transaction request and verifies signature', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);

    const sessionId = 1;
    const caps = ['cap:b', 'cap:a'];
    const data = b4a.from('deadbeef', 'hex');

    await builder
        .setType(NetworkOperationType.BROADCAST_TRANSACTION_REQUEST)
        .setSessionId(sessionId)
        .setTimestamp()
        .setData(data)
        .setCapabilities(caps)
        .buildPayload();

    const header = builder.getResult();
    t.is(header.type, MessageType.BROADCAST_TRANSACTION_REQUEST);
    t.alike(header.broadcast_transaction_request.data, data);

    const msg = createMessage(
        header.type,
        sessionIdToBuffer(header.session_id),
        timestampToBuffer(header.timestamp),
        data,
        header.broadcast_transaction_request.nonce,
        encodeCapabilities(caps)
    );
    const hash = await PeerWallet.blake3(msg);
    t.ok(wallet.verify(header.broadcast_transaction_request.signature, hash, wallet.publicKey));
});

test('NetworkMessageBuilder validates required inputs', async t => {
    const wallet = createWallet();
    const builder = new NetworkMessageBuilder(wallet);

    await t.exception(
        () => builder.setType(undefined),
        errorMessageIncludes('Invalid operation type')
    );

    await t.exception(
        () => builder.setCapabilities('not-an-array'),
        errorMessageIncludes('Capabilities must be a string array.')
    );

    await t.exception(
        () =>
            builder
                .setType(NetworkOperationType.BROADCAST_TRANSACTION_REQUEST)
                .setSessionId(1)
                .setTimestamp()
                .setCapabilities([])
                .buildPayload(),
        errorMessageIncludes('Data must be set before building broadcast transaction request')
    );
});
