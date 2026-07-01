import sinon from "sinon";
import { hook, test } from 'brittle'
import { default as EventEmitter } from "bare-events"
import { testKeyPair1, testKeyPair2, testKeyPair3, testKeyPair4, testKeyPair5, testKeyPair6, testKeyPair7, testKeyPair8 } from "../../../fixtures/apply.fixtures.js";
import ValidatorConnectionManager, { ValidatorConnectionManagerError } from "../../../../src/core/network/services/ValidatorConnectionManager.js";
import { tick } from "../../../helpers/setupApplyTests.js";
import b4a from 'b4a'
import { createConfig, ENV } from "../../../../src/config/env.js";
import { EventType, ResultCode } from "../../../../src/utils/constants.js";

const createConnection = (key) => {
    const emitter = new EventEmitter()
    emitter.protocolSession = {
        has: (name) => name === 'legacy',
        send: sinon.stub().resolves(),
    };
    emitter.connected = true
    emitter.remotePublicKey = b4a.from(key, 'hex')

    return { key: b4a.from(key, 'hex'), connection: emitter }
}

const createV1Connection = (key, sendHealthCheckStub = sinon.stub().resolves(ResultCode.OK)) => {
    const emitter = new EventEmitter()
    emitter.protocolSession = {
        sendHealthCheck: sendHealthCheckStub
    };
    emitter.connected = true
    emitter.remotePublicKey = b4a.from(key, 'hex')
    emitter.end = sinon.stub()

    return { key: b4a.from(key, 'hex'), connection: emitter }
}

const makeHealthCheckService = () => {
    const emitter = new EventEmitter();
    emitter.has = sinon.stub().returns(true);
    emitter.stop = sinon.stub();
    return emitter;
};

let connections

const makeManager = (maxValidators = 6, conns = null) => {
    const merged = createConfig(ENV.DEVELOPMENT, { maxValidators })
    const validatorConnectionManager = new ValidatorConnectionManager(merged)
    const activeConnections = conns ?? connections;

    activeConnections.forEach(({ key, connection }) => {
        validatorConnectionManager.addValidator(key, connection)
    });

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
    test('addValidator', async () => {
        test('adds a validator', async t => {
            reset()
            const validatorConnectionManager = makeManager()
            t.is(validatorConnectionManager.connectionCount(), connections.length, 'should have the same length')
            const data = createConnection(testKeyPair5.publicKey)
            validatorConnectionManager.addValidator(data.key, data.connection)
            t.is(validatorConnectionManager.connectionCount(), connections.length + 1, 'should have the same length')
        })

        test('dont surpass maxConnections', async t => {
            reset()
            const maxConnections = 5
            const validatorConnectionManager = makeManager(maxConnections)
            t.is(validatorConnectionManager.connectionCount(), connections.length, 'should have the same length')

            const toAdd = createConnection(testKeyPair5.publicKey)
            validatorConnectionManager.addValidator(toAdd.key, toAdd.connection)
            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'should match the max connections')

            const toNotAdd = createConnection(testKeyPair6.publicKey)
            validatorConnectionManager.addValidator(toNotAdd.key, toNotAdd.connection)
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
                validatorConnectionManager.addValidator(key, connection)
            })

            t.is(validatorConnectionManager.connectionCount(), maxConnections, 'pool should be full')

            const newConn = createConnection(testKeyPair3.publicKey)
            validatorConnectionManager.addValidator(newConn.key, newConn.connection)

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

        test('throws ValidatorConnectionManagerError when validator is disconnected', async t => {
            reset()
            const validatorConnectionManager = makeManager()

            try {
                await validatorConnectionManager.sendSingleMessage({ payload: 1 }, testKeyPair8.publicKey)
                t.fail('expected sendSingleMessage to throw')
            } catch (error) {
                t.ok(error instanceof ValidatorConnectionManagerError, 'should throw ValidatorConnectionManagerError')
                t.ok(error.message.includes('is not connected'), 'should include disconnected validator details')
            }
        })

        test('throws ValidatorConnectionManagerError when protocolSession is missing', async t => {
            reset()
            const emitter = new EventEmitter()
            emitter.connected = true
            emitter.remotePublicKey = b4a.from(testKeyPair6.publicKey, 'hex')
            emitter.end = sinon.stub()
            const data = {
                key: b4a.from(testKeyPair6.publicKey, 'hex'),
                connection: emitter,
            }

            const validatorConnectionManager = makeManager(6, [data])

            try {
                await validatorConnectionManager.sendSingleMessage({ payload: 1 }, testKeyPair6.publicKey)
                t.fail('expected sendSingleMessage to throw')
            } catch (error) {
                t.ok(error instanceof ValidatorConnectionManagerError, 'should throw ValidatorConnectionManagerError')
                t.ok(error.message.includes('no valid connection found'), 'should include protocol session details')
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
            try {
                const v1Conn = createV1Connection(testKeyPair1.publicKey, sinon.stub().resolves(ResultCode.OK));
                const validatorConnectionManager = makeManager(6, [v1Conn]);
                const healthCheckService = makeHealthCheckService();
                validatorConnectionManager.subscribeToHealthChecks(healthCheckService);

                healthCheckService.emit(
                    EventType.VALIDATOR_HEALTH_CHECK,
                    testKeyPair1.publicKey,
                    "123456"
                );

                await tick();
                t.ok(validatorConnectionManager.connected(v1Conn.key));
                t.is(healthCheckService.stop.callCount, 0);
            } finally {
                sinon.restore();
            }
        });

        test('removes validator on non-OK response', async t => {
            try {
                const v1Conn = createV1Connection(testKeyPair2.publicKey, sinon.stub().resolves(ResultCode.TIMEOUT));
                const validatorConnectionManager = makeManager(6, [v1Conn]);
                const healthCheckService = makeHealthCheckService();
                validatorConnectionManager.subscribeToHealthChecks(healthCheckService);

                healthCheckService.emit(
                    EventType.VALIDATOR_HEALTH_CHECK,
                    testKeyPair2.publicKey,
                    "123456"
                );

                await tick();
                t.ok(!validatorConnectionManager.connected(v1Conn.key));
                t.ok(healthCheckService.stop.callCount >= 1);
            } finally {
                sinon.restore();
            }
        });

        test('removes validator on send rejection', async t => {
            try {
                const v1Conn = createV1Connection(testKeyPair3.publicKey, sinon.stub().rejects(new Error('boom')));
                const validatorConnectionManager = makeManager(6, [v1Conn]);
                const healthCheckService = makeHealthCheckService();
                validatorConnectionManager.subscribeToHealthChecks(healthCheckService);

                healthCheckService.emit(
                    EventType.VALIDATOR_HEALTH_CHECK,
                    testKeyPair3.publicKey,
                    "123456"
                );

                await tick();
                t.ok(!validatorConnectionManager.connected(v1Conn.key));
                t.ok(healthCheckService.stop.callCount >= 1);
            } finally {
                sinon.restore();
            }
        });

        test('ignores malformed health check events', async t => {
            try {
                const v1Conn = createV1Connection(testKeyPair5.publicKey, sinon.stub().resolves(ResultCode.OK));
                const validatorConnectionManager = makeManager(6, [v1Conn]);
                let handler = null;
                const healthCheckService = {
                    on: (_event, fn) => { handler = fn; },
                    off: () => {},
                    has: sinon.stub().returns(true),
                    stop: sinon.stub()
                };
                validatorConnectionManager.subscribeToHealthChecks(healthCheckService);

                const cases = [
                    { label: 'publicKey', publicKey: 123, requestId: 'abc' },
                    { label: 'requestId', publicKey: testKeyPair5.publicKey, requestId: 456 },
                    { label: 'undefined', publicKey: undefined, requestId: undefined },
                ];

                for (const testCase of cases) {
                    await handler(testCase.publicKey, testCase.requestId);
                    t.pass(`ignored malformed payload: ${testCase.label}`);
                }
            } finally {
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

        test('subscribeToHealthChecks validates service interface', async t => {
            reset()
            const validatorConnectionManager = makeManager()

            await t.exception(
                () => validatorConnectionManager.subscribeToHealthChecks({ on() {} }),
                /must implement on\/off/
            )
        })

        test('health check removes validator when protocolSession is missing', async t => {
            reset()
            const emitter = new EventEmitter()
            emitter.connected = true
            emitter.remotePublicKey = b4a.from(testKeyPair6.publicKey, 'hex')
            emitter.end = sinon.stub()
            const data = {
                key: b4a.from(testKeyPair6.publicKey, 'hex'),
                connection: emitter
            }

            const validatorConnectionManager = makeManager(6, [data])
            const healthCheckService = {
                on: (_event, fn) => { healthCheckService.handler = fn; },
                off: () => {},
                has: sinon.stub().returns(true),
                stop: sinon.stub(),
                handler: null,
            }

            validatorConnectionManager.subscribeToHealthChecks(healthCheckService)
            await healthCheckService.handler(testKeyPair6.publicKey, 'hc-1')

            t.absent(validatorConnectionManager.connected(data.key))
            t.ok(healthCheckService.stop.called)
        })

        test('remove tolerates health check service errors', async t => {
            reset()
            const data = createConnection(testKeyPair5.publicKey)
            const validatorConnectionManager = makeManager(6, [data])
            const healthCheckService = {
                on: (_event, fn) => { healthCheckService.handler = fn; },
                off: () => {},
                has: sinon.stub().throws(new Error('has boom')),
                stop: sinon.stub(),
                handler: null,
            }
            validatorConnectionManager.subscribeToHealthChecks(healthCheckService)

            validatorConnectionManager.remove(data.key)

            t.absent(validatorConnectionManager.connected(data.key))
        })
    })
})
