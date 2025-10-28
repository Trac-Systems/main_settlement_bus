import sinon from "sinon";
import { hook, test } from 'brittle'
import { default as EventEmitter } from "bare-events"
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5, testKeyPair6 } from "../fixtures/apply.fixtures.js";
import ConnectionManager from "../../src/core/network/services/ConnectionManager.js";
import { tick } from "../utils/setupApplyTests.js";

const createConnection = (key) => {
    const emitter = new EventEmitter()
    emitter.messenger = {
        send: sinon.stub().resolves(),
    }
    emitter.connected = true

    return { key, connection: emitter }
}

const makeManager = (maxValidators = 6) => {
    const connectionManager = new ConnectionManager({ maxValidators })

    connections.forEach(({ key, connection }) => {
        connectionManager.addValidator(key, connection)
    });

    return connectionManager
}

const reset = () => {
    sinon.restore()
    connections.forEach(connection => {
        connection.connection.messenger.send.resetHistory()
    })
}

let connections
hook('Initialize state', async () => {
    connections = [
        createConnection(testKeyPair1.publicKey),
        createConnection(testKeyPair2.publicKey),
        createConnection(testKeyPair3.publicKey),
        createConnection(testKeyPair4.publicKey),
    ]
});

test('ConnectionManager', () => {
    test('addValidator', async t => {
        test('adds a validator', async t => {
            reset()
            const connectionManager = makeManager()
            t.is(connectionManager.connectionCount(), connections.length, 'should have the same length')

            const data = createConnection(testKeyPair5.publicKey)
            connectionManager.addValidator(data.key, data.connection)
            t.is(connectionManager.connectionCount(), connections.length + 1, 'should have the same length')
        })

        test('dont surpass maxConnections', async t => {
            reset()
            const maxConnections = 5
            const connectionManager = makeManager(maxConnections)
            t.is(connectionManager.connectionCount(), connections.length, 'should have the same length')

            const toAdd = createConnection(testKeyPair5.publicKey)
            connectionManager.addValidator(toAdd.key, toAdd.connection)
            t.is(connectionManager.connectionCount(), maxConnections, 'should match the max connections')

            const toNotAdd = createConnection(testKeyPair6.publicKey)
            connectionManager.addValidator(toNotAdd.key, toNotAdd.connection)
            t.is(connectionManager.connectionCount(), maxConnections, 'should not increase length')
        })
    })

    test('connected', async t => {
        test('true', async t => {
            reset()
            const connectionManager = makeManager()
            connections.forEach(con => {
                t.ok(connectionManager.connected(con.key), 'should respond true')
            })
        })

        test('false', async t => {
            reset()
            const connectionManager = makeManager()
            t.ok(!connectionManager.connected(testKeyPair6.publicKey), 'should respond false')
        })
    })

    test('send', async t => {
        test('triggers send on messenger', async t => {
            reset()
            const connectionManager = makeManager()

            connectionManager.send([1,2,3,4])
            t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
        })

        test('rotate the messenger', async t => {
            reset()
            const connectionManager = makeManager()

            for (let i = 0; i < 10; i++) {
                connectionManager.send([1,2,3,4])
                t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            }
        })

        test('resets rotation', async t => {
            reset()
            const connectionManager = makeManager()

            for (let i = 0; i < 10; i++) {
                connectionManager.send([1,2,3,4])
                t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            }

            for (let i = 0; i < 10; i++) {
                connectionManager.send([1,2,3,4])
                t.ok(connections[1].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            }

            for (let i = 0; i < 10; i++) {
                connectionManager.send([1,2,3,4])
                t.ok(connections[2].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            }

            for (let i = 0; i < 10; i++) {
                connectionManager.send([1,2,3,4])
                t.ok(connections[3].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            }

            t.is(connections[0].connection.messenger.send.callCount, 10, 'first should have been called 10 times')
            t.is(connections[1].connection.messenger.send.callCount, 10, 'second should have been called 10 times')
            t.is(connections[2].connection.messenger.send.callCount, 10, 'third should have been called 10 times')
            t.is(connections[3].connection.messenger.send.callCount, 10, 'fourth should have been called 10 times')

            connectionManager.send([1,2,3,4])
            t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            t.is(connections[0].connection.messenger.send.callCount, 11, 'first should have been called 11 times')
        })
    })

    test('rotate', async t => {
        test('resets the rotation', async t => {
            reset()
            const connectionManager = makeManager()

            connectionManager.send([1,2,3,4]) // this shouldnt trigger rotation
            t.ok(connections[0].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
            connectionManager.rotate() // rotate
            connectionManager.send([1,2,3,4])
            t.ok(connections[1].connection.messenger.send.calledWith([1,2,3,4]), 'first on the list should have been called')
        })
    })

    test('on close', async t => {
        test('removes from list', async t => {
            reset()
            const connectionManager = makeManager()

            const connectionCount = connectionManager.connectionCount()

            connections[1].connection.emit('close')
            await tick()
            t.is(connectionCount, connectionManager.connectionCount() + 1, 'first on the list should have been called')
        })
    })
})