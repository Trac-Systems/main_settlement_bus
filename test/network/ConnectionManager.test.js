import sinon from "sinon";
import { hook, test } from 'brittle'
import { default as EventEmitter } from "bare-events"
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5 } from "../fixtures/apply.fixtures.js";
import ConnectionManager from "../../src/core/network/services/ConnectionManager.js";

const createConnection = (key) => {
    const emitter = new EventEmitter()
    emitter.messenger = {
        send: sinon.stub().resolves(),
    }
    emitter.isConnected = true

    return { key, connection: emitter }
}

let connections, connectionManager
hook('Initialize state', async () => {
    connections = [
        createConnection(testKeyPair1.publicKey),
        createConnection(testKeyPair2.publicKey),
        createConnection(testKeyPair3.publicKey),
        createConnection(testKeyPair4.publicKey),
    ]

    connectionManager = new ConnectionManager({ maxValidators: 6 })

    connections.forEach(({ key, connection }) => {
        connectionManager.whiteList(key)
        connectionManager.addValidator(key, connection)
    });

});

test('ConnectionManager', () => {
    test('addValidator', async t => {
        sinon.restore()
        t.is(connectionManager.connectionCount(), connections.length, 'should have the same length')

        const data = createConnection(testKeyPair5.publicKey)
        connectionManager.whiteList(data.key)
        connectionManager.addValidator(data.key, data.connection)
        t.is(connectionManager.connectionCount(), connections.length + 1, 'should have the same length')
    })

    test('send', async t => {
        sinon.restore()

        connectionManager.send([1,2,3,4])
        t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
    })
})