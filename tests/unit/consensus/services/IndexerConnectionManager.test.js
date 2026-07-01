import sinon from 'sinon';
import { test } from 'brittle';
import { default as EventEmitter } from 'bare-events';
import b4a from 'b4a';
import { testKeyPair1, testKeyPair2, testKeyPair3 } from '../../../fixtures/apply.fixtures.js';
import IndexerConnectionManager from '../../../../src/core/consensus/services/IndexerConnectionManager.js';

const mockConfig = { addressPrefix: 'trac' };
const mockLogger = { debug() {} };
const mockMessages = { createProtomux: (connection) => connection.protocolSession };

const makeConnection = (publicKeyHex) => {
    const emitter = new EventEmitter();
    emitter.protocolSession = {
        send: sinon.stub().resolves({ ok: true }),
        sendAndForget: sinon.stub(),
        close: sinon.stub(),
    };
    emitter.remotePublicKey = b4a.from(publicKeyHex, 'hex');
    return emitter;
};

const makeManager = (...keys) => {
    const manager = new IndexerConnectionManager(100, mockConfig, mockLogger, mockMessages);
    for (const key of keys) {
        manager.add(key, makeConnection(key));
    }
    return manager;
};

test('IndexerConnectionManager', () => {

    test('add', () => {
        test('adds a new indexer', async t => {
            const manager = new IndexerConnectionManager(10, mockConfig, mockLogger, mockMessages);
            const conn = makeConnection(testKeyPair1.publicKey);
            manager.add(testKeyPair1.publicKey, conn);
            t.ok(manager.connected(testKeyPair1.publicKey));
        });

        test('does not replace an already connected indexer', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            const existingConnection = manager.getConnection(testKeyPair1.publicKey);
            const conn = makeConnection(testKeyPair1.publicKey);
            manager.add(testKeyPair1.publicKey, conn);
            t.is(manager.getConnection(testKeyPair1.publicKey), existingConnection);
        });

        test('does not add a new indexer when maxIndexers limit is reached', async t => {
            const manager = new IndexerConnectionManager(1, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, makeConnection(testKeyPair1.publicKey));
            manager.add(testKeyPair2.publicKey, makeConnection(testKeyPair2.publicKey));
            t.absent(manager.connected(testKeyPair2.publicKey));
        });
    });

    test('remove', () => {
        test('removes an existing indexer', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.ok(manager.connected(testKeyPair1.publicKey));
            manager.remove(testKeyPair1.publicKey);
            t.absent(manager.connected(testKeyPair1.publicKey));
        });

        test('is a no-op for unknown key', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            manager.remove(testKeyPair2.publicKey);
            t.ok(manager.connected(testKeyPair1.publicKey));
        });
    });

    test('connected', () => {
        test('returns true for added indexer', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.ok(manager.connected(testKeyPair1.publicKey));
        });

        test('returns false for unknown key', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.absent(manager.connected(testKeyPair2.publicKey));
        });
    });

    test('getConnection', () => {
        test('returns the connection for a known indexer', async t => {
            const conn = makeConnection(testKeyPair1.publicKey);
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, conn);
            t.is(manager.getConnection(testKeyPair1.publicKey), conn);
        });

        test('returns undefined for unknown key', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.absent(manager.getConnection(testKeyPair2.publicKey));
        });
    });

    test('connectedPeers', () => {
        test('returns all connected public key hexes', async t => {
            const manager = makeManager(testKeyPair1.publicKey, testKeyPair2.publicKey, testKeyPair3.publicKey);
            const indexers = manager.connectedPeers();
            t.is(indexers.length, 3);
            t.ok(indexers.includes(testKeyPair1.publicKey));
            t.ok(indexers.includes(testKeyPair2.publicKey));
            t.ok(indexers.includes(testKeyPair3.publicKey));
        });

        test('returns empty array when no indexers connected', async t => {
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            t.alike(manager.connectedPeers(), []);
        });
    });

    test('send', () => {
        test('calls protocolSession.send with the message', async t => {
            const conn = makeConnection(testKeyPair1.publicKey);
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, conn);

            await manager.send(testKeyPair1.publicKey, { type: 'ping' });

            t.ok(conn.protocolSession.send.calledOnce);
            t.alike(conn.protocolSession.send.firstCall.args[0], { type: 'ping' });
        });

        test('throws when indexer is not connected', async t => {
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            await t.exception(() => manager.send(testKeyPair1.publicKey, {}), /no session for/);
        });

        test('throws when protocolSession is missing', async t => {
            const conn = new EventEmitter();
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, conn);
            await t.exception(() => manager.send(testKeyPair1.publicKey, {}), /no session for/);
        });
    });

    test('clear', () => {
        test('removes all indexers from the pool', async t => {
            const manager = makeManager(testKeyPair1.publicKey, testKeyPair2.publicKey, testKeyPair3.publicKey);
            t.is(manager.connectedPeers().length, 3);
            manager.clear();
            t.is(manager.connectedPeers().length, 0);
        });

        test('is a no-op on an empty pool', async t => {
            const manager = new IndexerConnectionManager(0, mockConfig, mockLogger, mockMessages);
            manager.clear();
            t.is(manager.connectedPeers().length, 0);
        });
    });

    test('sendAndForget', () => {
        test('calls protocolSession.sendAndForget with the message', async t => {
            const conn = makeConnection(testKeyPair1.publicKey);
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, conn);

            manager.sendAndForget(testKeyPair1.publicKey, { type: 'ping' });

            t.ok(conn.protocolSession.sendAndForget.calledOnce);
            t.alike(conn.protocolSession.sendAndForget.firstCall.args[0], { type: 'ping' });
        });

        test('is silent when indexer is not connected', async t => {
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.sendAndForget(testKeyPair1.publicKey, {});
            t.pass('did not throw');
        });

        test('is silent when protocolSession is missing', async t => {
            const conn = new EventEmitter();
            const manager = new IndexerConnectionManager(undefined, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, conn);
            manager.sendAndForget(testKeyPair1.publicKey, { type: 'ping' });
            t.pass('did not throw');
        });
    });

    test('exists', () => {
        test('returns true for an added indexer', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.ok(manager.exists(testKeyPair1.publicKey));
        });

        test('returns false for an unknown key', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            t.absent(manager.exists(testKeyPair2.publicKey));
        });

        test('returns false after removal', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            manager.remove(testKeyPair1.publicKey);
            t.absent(manager.exists(testKeyPair1.publicKey));
        });

        test('accepts buffer input', async t => {
            const manager = makeManager(testKeyPair1.publicKey);
            const bufferKey = b4a.from(testKeyPair1.publicKey, 'hex');
            t.ok(manager.exists(bufferKey));
        });
    });

    test('setMax', () => {
        test('increasing max allows more connections', async t => {
            const manager = new IndexerConnectionManager(1, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, makeConnection(testKeyPair1.publicKey));
            manager.add(testKeyPair2.publicKey, makeConnection(testKeyPair2.publicKey));
            t.absent(manager.connected(testKeyPair2.publicKey), 'blocked at limit=1');

            manager.setMax(2);
            manager.add(testKeyPair2.publicKey, makeConnection(testKeyPair2.publicKey));
            t.ok(manager.connected(testKeyPair2.publicKey), 'allowed after setMax(2)');
        });

        test('decreasing max blocks future additions but keeps existing', async t => {
            const manager = new IndexerConnectionManager(3, mockConfig, mockLogger, mockMessages);
            manager.add(testKeyPair1.publicKey, makeConnection(testKeyPair1.publicKey));
            manager.add(testKeyPair2.publicKey, makeConnection(testKeyPair2.publicKey));

            manager.setMax(2);
            manager.add(testKeyPair3.publicKey, makeConnection(testKeyPair3.publicKey));
            t.absent(manager.connected(testKeyPair3.publicKey), 'blocked after setMax(2)');
            t.ok(manager.connected(testKeyPair1.publicKey), 'existing connections are kept');
            t.ok(manager.connected(testKeyPair2.publicKey), 'existing connections are kept');
        });
    });
});
