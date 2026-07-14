import sinon from "sinon";
import { hook, test } from 'brittle'
import { default as EventEmitter } from "bare-events"
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5, testKeyPair6, testKeyPair7, testKeyPair8 } from "../../../fixtures/apply.fixtures.js";
import ValidatorConnectionManager from "../../../../src/core/network/services/ValidatorConnectionManager.js";
import ValidatorHealthCheckService from "../../../../src/core/network/services/ValidatorHealthCheckService.js";
import { PeerConnectionManagerError } from "../../../../src/core/shared/PeerConnectionManager.js";
import { tick } from "../../../helpers/setupApplyTests.js";
import b4a from 'b4a'
import { createConfig, ENV } from "../../../../src/config/env.js";
import { ResultCode } from "../../../../src/utils/constants.js";

const createConnection = (key) => {
    const emitter = new EventEmitter()
    emitter.protocolSession = {
        has: (name) => name === 'legacy',
        send: sinon.stub().resolves(),
        isProbed: () => true,
        probe: sinon.stub().resolves(),
        isHealthCheckSupported: () => false,
        close: sinon.stub(),
    };
    emitter.connected = true
    emitter.remotePublicKey = b4a.from(key, 'hex')

    return { key: b4a.from(key, 'hex'), connection: emitter }
}

const createV1Connection = (key, sendHealthCheckStub = sinon.stub().resolves(ResultCode.OK)) => {
    const emitter = new EventEmitter()
    emitter.protocolSession = {
        sendHealthCheck: sendHealthCheckStub,
        isProbed: () => true,
        probe: sinon.stub().resolves(),
        isHealthCheckSupported: () => false,
        close: sinon.stub(),
    };
    emitter.connected = true
    emitter.remotePublicKey = b4a.from(key, 'hex')
    emitter.end = sinon.stub()

    return { key: b4a.from(key, 'hex'), connection: emitter }
}

const makeMessages = () => ({
    createProtomux: (connection) => connection.protocolSession,
    attachChannel(connection) {
        if (!connection.protocolSession) {
            connection.protocolSession = this.createProtomux(connection);
        }
        return connection.protocolSession;
    }
})

const makeLogger = () => ({
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
})

let connections

const makeManager = (maxValidators = 6, conns = null) => {
    const merged = createConfig(ENV.DEVELOPMENT, { maxValidators })
    const validatorConnectionManager = new ValidatorConnectionManager(maxValidators, merged, makeLogger(), makeMessages())
    const activeConnections = conns ?? connections;

    activeConnections.forEach(({ key, connection }) => {
        validatorConnectionManager.add(key, connection)
    });

    return validatorConnectionManager
}

// The health check service is now created and driven internally by ValidatorConnectionManager,
// so exercising it means opening the manager for real and advancing its own interval timer.
const HEALTH_CHECK_INTERVAL_MS = 10

const makeHealthCheckManager = async () => {
    const merged = createConfig(ENV.DEVELOPMENT, { maxValidators: 6, validatorHealthCheckInterval: HEALTH_CHECK_INTERVAL_MS })
    const validatorConnectionManager = new ValidatorConnectionManager(6, merged, makeLogger(), makeMessages())
    await validatorConnectionManager.ready()
    return validatorConnectionManager
}

const reset = () => {
    sinon.restore()
    connections.forEach(connection => {
        connection.connection.protocolSession.send.resetHistory()
    })
}
hook('Initialize state', async () => {
    connections = [
        createConnection(testKeyPair1.publicKey),
        createConnection(testKeyPair2.publicKey),
        createConnection(testKeyPair3.publicKey),
        createConnection(testKeyPair4.publicKey),
    ]
});

test('ConnectionManager', () => {
    test('add', async () => {
        test('adds a validator', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            t.is(validatorConnectionManager.connectionCount(), connections.length, 'should have the same length')
            const data = createConnection(testKeyPair5.publicKey)
            validatorConnectionManager.add(data.key, data.connection)
            t.is(validatorConnectionManager.connectionCount(), connections.length + 1, 'should have the same length')
        })

        test('dont surpass maxConnections', async t => {
            reset()
            const maxConnections = 5
            const validatorConnectionManager = makeManager(maxConnections)
            t.is(validatorConnectionManager.connectionCount(), connections.length, 'should have the same length')

            const toAdd = createConnection(testKeyPair5.publicKey)
            validatorConnectionManager.add(toAdd.key, toAdd.connection)
            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'should match the max connections')

            const toNotAdd = createConnection(testKeyPair6.publicKey)
            validatorConnectionManager.add(toNotAdd.key, toNotAdd.connection)
            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'should not increase length')
        })

        test('does not add new validator when pool is full', async t => {
            reset()
            const maxConnections = 2
            const localConnections = [
                createConnection(testKeyPair1.publicKey),
                createConnection(testKeyPair2.publicKey),
            ]

            const validatorConnectionManager = makeManager(maxConnections)
            localConnections.forEach(({ key, connection }) => {
                validatorConnectionManager.add(key, connection)
            })

            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'pool should be full')

            const newConn = createConnection(testKeyPair3.publicKey)
            validatorConnectionManager.add(newConn.key, newConn.connection)

            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'should stay at max size')
            t.not(validatorConnectionManager.connected(newConn.key), 'new validator should not be in the pool')

            const remainingOld = localConnections.filter(c => validatorConnectionManager.connected(c.key)).length
            t.is(remainingOld, 2, 'all of the old validators should remain')
        })
    })

    test('connected', async () => {
        test('true', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            connections.forEach(con => {
                t.ok(validatorConnectionManager.connected(con.key), 'should respond true')
            })
        })

        test('false', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            t.ok(!validatorConnectionManager.connected(testKeyPair6.publicKey), 'should respond false')
        })
    })

    test('sendSingleMessage', async () => {
        test('returns exact resultCode from protocolSession.send', async t => {
            reset()
            const data = createConnection(testKeyPair1.publicKey)
            data.connection.protocolSession.send = sinon.stub().resolves(ResultCode.TIMEOUT)
            const validatorConnectionManager = makeManager(6, [data])

            const result = await validatorConnectionManager.sendSingleMessage({ payload: 1 }, testKeyPair1.publicKey)

            t.is(result, ResultCode.TIMEOUT, 'should return the exact result code from protocol session')
            t.ok(data.connection.protocolSession.send.calledOnce, 'should invoke protocolSession.send')
        })

        test('throws PeerConnectionManagerError when validator is disconnected', async t => {
            reset()
            const validatorConnectionManager = makeManager()

            try {
                await validatorConnectionManager.sendSingleMessage({ payload: 1 }, testKeyPair8.publicKey)
                t.fail('expected sendSingleMessage to throw')
            } catch (error) {
                t.ok(error instanceof PeerConnectionManagerError, 'should throw PeerConnectionManagerError')
                t.ok(error.message.includes('is not connected'), 'should include disconnected validator details')
            }
        })

    })

    // Note: These tests were commented out because validatorConnectionManager.send is being deprecated. When it is completely removed, the tests should be deleted.
    // test('send', async t => {
    //     // test('triggers send on messenger', async t => {
    //     //     reset()
    //     //     const validatorConnectionManager = makeManager()

    //     //     const target = validatorConnectionManager.send([1,2,3,4])

    //     //     const totalCalls = connections.reduce((sum, con) => sum + con.connection.protocolSession.send.callCount, 0)
    //     //     t.is(totalCalls, 1, 'should send to exactly one validator')
    //     //     t.ok(target, 'should return a target public key')
    //     // })

    //     test('does not throw on individual send errors', async t => {
    //         reset()
    //         const errorConnections = [
    //             createConnection(testKeyPair7.publicKey),
    //             createConnection(testKeyPair8.publicKey),
    //         ]

    //         errorConnections.forEach(con => {
    //             con.connection.protocolSession.send = sinon.stub().throws(new Error())
    //         })

    //         const validatorConnectionManager = makeManager(5, errorConnections)

    //         t.is(errorConnections.length, 2, 'should have two connections')
    //         validatorConnectionManager.send([1,2,3,4])
    //         t.ok(true, 'send should not throw even if individual sends fail')
    //     })
    // })

    test('on close', async () => {
        test('removes from list', async t => {
            reset()
            const validatorConnectionManager = makeManager()

            const connectionCount = validatorConnectionManager.connectionCount()

            connections[1].connection.connected = false
            connections[1].connection.emit('close')
            await tick()
            t.is(connectionCount, validatorConnectionManager.connectionCount() + 1, 'first on the list should have been called')
        })
    })

    test('remove', async () => {
        test('removes a validator by public key', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            const previousCount = validatorConnectionManager.connectionCount()
            const lastValidator = connections.shift()

            t.ok(validatorConnectionManager.connected(lastValidator.key), 'should be connected')
            validatorConnectionManager.remove(lastValidator.key)

            t.is(validatorConnectionManager.connectionCount(), previousCount - 1, 'should reduce the connection count')
            t.ok(!validatorConnectionManager.connected(lastValidator.key), 'should be connected')
        })

        test('can detach a validator without ending the socket', async t => {
            reset()
            const data = createV1Connection(testKeyPair5.publicKey)
            const validatorConnectionManager = makeManager(6, [data])

            validatorConnectionManager.remove(data.key, { endConnection: false })

            t.absent(validatorConnectionManager.connected(data.key), 'validator should be removed from the pool')
            t.is(data.connection.end.callCount, 0, 'socket should remain open for in-flight responses')
        })
    })

    test('on close', async () => {
        test('removes from list', async t => {
            reset()
            const validatorConnectionManager = makeManager()

            const connectionCount = validatorConnectionManager.connectionCount()

            connections[1].connection.connected = false
            connections[1].connection.emit('close')
            await tick()
            t.is(connectionCount, validatorConnectionManager.connectionCount() + 1, 'first on the list should have been called')
        })
    })

    test('health checks (strict)', async () => {
        test('keeps validator on OK response', async t => {
            const clock = sinon.useFakeTimers();
            const stopSpy = sinon.spy(ValidatorHealthCheckService.prototype, 'stop');
            try {
                const validatorConnectionManager = await makeHealthCheckManager();
                const v1Conn = createV1Connection(testKeyPair1.publicKey, sinon.stub().resolves(ResultCode.OK));
                v1Conn.connection.protocolSession.isHealthCheckSupported = () => true;
                await validatorConnectionManager.add(v1Conn.key, v1Conn.connection);

                await clock.tickAsync(HEALTH_CHECK_INTERVAL_MS);

                t.ok(validatorConnectionManager.connected(v1Conn.key));
                t.ok(v1Conn.connection.protocolSession.sendHealthCheck.calledOnce);
                t.is(stopSpy.callCount, 0);
            } finally {
                clock.restore();
                sinon.restore();
            }
        });

        test('removes validator on non-OK response', async t => {
            const clock = sinon.useFakeTimers();
            const stopSpy = sinon.spy(ValidatorHealthCheckService.prototype, 'stop');
            try {
                const validatorConnectionManager = await makeHealthCheckManager();
                const v1Conn = createV1Connection(testKeyPair2.publicKey, sinon.stub().resolves(ResultCode.TIMEOUT));
                v1Conn.connection.protocolSession.isHealthCheckSupported = () => true;
                await validatorConnectionManager.add(v1Conn.key, v1Conn.connection);

                await clock.tickAsync(HEALTH_CHECK_INTERVAL_MS);

                t.ok(!validatorConnectionManager.connected(v1Conn.key));
                t.ok(stopSpy.callCount >= 1);
            } finally {
                clock.restore();
                sinon.restore();
            }
        });

        test('removes validator on send rejection', async t => {
            const clock = sinon.useFakeTimers();
            const stopSpy = sinon.spy(ValidatorHealthCheckService.prototype, 'stop');
            try {
                const validatorConnectionManager = await makeHealthCheckManager();
                const v1Conn = createV1Connection(testKeyPair3.publicKey, sinon.stub().rejects(new Error('boom')));
                v1Conn.connection.protocolSession.isHealthCheckSupported = () => true;
                await validatorConnectionManager.add(v1Conn.key, v1Conn.connection);

                await clock.tickAsync(HEALTH_CHECK_INTERVAL_MS);

                t.ok(!validatorConnectionManager.connected(v1Conn.key));
                t.ok(stopSpy.callCount >= 1);
            } finally {
                clock.restore();
                sinon.restore();
            }
        });
    })

    test('edge branches', async () => {
        test('remove missing validator keeps state unchanged', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            const before = validatorConnectionManager.connectionCount()
            validatorConnectionManager.remove(testKeyPair8.publicKey)
            t.is(validatorConnectionManager.connectionCount(), before)
        })

        test('remove handles connection.end throwing and still deletes validator', async t => {
            reset()
            const data = createConnection(testKeyPair7.publicKey)
            data.connection.end = sinon.stub().throws(new Error('end boom'))
            const validatorConnectionManager = makeManager(6, [data])

            t.ok(validatorConnectionManager.connected(data.key))
            validatorConnectionManager.remove(data.key)
            t.absent(validatorConnectionManager.connected(data.key))
        })

        test('sent counters handle missing validators safely', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            t.is(validatorConnectionManager.getSentCount(testKeyPair8.publicKey), 0)
            validatorConnectionManager.incrementSentCount(testKeyPair8.publicKey)
            t.is(validatorConnectionManager.getSentCount(testKeyPair8.publicKey), 0)
        })

        test('health check removes validator when protocolSession is missing', async t => {
            const clock = sinon.useFakeTimers();
            try {
                const validatorConnectionManager = await makeHealthCheckManager();
                // Legacy connections don't expose sendHealthCheck; force isHealthCheckSupported to
                // simulate a connection that was scheduled for checks but lost its protocol session.
                const data = createConnection(testKeyPair6.publicKey)
                data.connection.protocolSession.isHealthCheckSupported = () => true
                await validatorConnectionManager.add(data.key, data.connection)

                await clock.tickAsync(HEALTH_CHECK_INTERVAL_MS)

                t.absent(validatorConnectionManager.connected(data.key))
            } finally {
                clock.restore();
                sinon.restore();
            }
        })

        test('remove tolerates health check service errors', async t => {
            reset()
            const hasStub = sinon.stub(ValidatorHealthCheckService.prototype, 'has').throws(new Error('has boom'))
            try {
                const data = createConnection(testKeyPair5.publicKey)
                const validatorConnectionManager = makeManager(6, [data])

                validatorConnectionManager.remove(data.key)

                t.absent(validatorConnectionManager.connected(data.key))
            } finally {
                hasStub.restore()
            }
        })
    })
})
