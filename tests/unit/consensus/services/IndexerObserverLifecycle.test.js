import sinon from "sinon";
import { test } from "brittle";
import b4a from "b4a";
import tracCryptoApi from "trac-crypto-api";
import IndexerObserverService from "../../../../src/core/consensus/services/IndexerObserverService.js";

if (typeof setTimeout !== "undefined" && typeof setTimeout.restore === "function") {
    setTimeout.restore();
}

// A valid bech32 address produced from a known public key.
// getRegisteredWriterKey returns the ASCII bytes of the bech32 string (that's the real storage format).
const TEST_PUBLIC_KEY = b4a.alloc(32, 1);
const TEST_ADDRESS = tracCryptoApi.address.encode("trac", TEST_PUBLIC_KEY);
const TEST_ADDRESS_BUFFER = b4a.from(TEST_ADDRESS, "ascii");

async function cleanup(service) {
    if (service) {
        await service.stop(false);
    }
}

function createBaseMocks(overrides = {}) {
    const baseState = {
        getIndexersEntry: async () => [{ key: b4a.alloc(32, "k") }],
        getRegisteredWriterKey: async () => TEST_ADDRESS_BUFFER,
        getAdminEntry: async () => ({ address: "trac_admin" }),
    };

    const baseNetwork = {
        indexerConnectionManager: {
            connected: () => false,
        },
        isConnectionPending: () => false,
        tryConnect: async () => {},
    };

    return {
        network: {
            ...baseNetwork,
            ...overrides.network,
            indexerConnectionManager: {
                ...baseNetwork.indexerConnectionManager,
                ...(overrides.network?.indexerConnectionManager || {}),
            },
        },
        state: {
            ...baseState,
            ...(overrides.state || {}),
        },
        config: {
            pollInterval: 10,
            addressPrefix: "trac",
            ...(overrides.config || {}),
        },
    };
}

test("connects successfully (happy path)", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: { tryConnect: () => calls++ },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 50 && calls === 0; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.ok(calls > 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("does NOT connect if already connected", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: {
            indexerConnectionManager: { connected: () => true },
            tryConnect: () => calls++,
        },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.is(calls, 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("does NOT connect if already pending", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: {
            isConnectionPending: () => true,
            tryConnect: () => calls++,
        },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.is(calls, 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("does NOT connect to self", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: { tryConnect: () => calls++ },
    });

    // Pass the resolved address as self — observer must skip it
    const service = new IndexerObserverService(network, state, TEST_ADDRESS, config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.is(calls, 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("does NOT connect to admin", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: { tryConnect: () => calls++ },
        state: { getAdminEntry: async () => ({ address: TEST_ADDRESS }) },
    });

    // Self is different from the indexer entry — admin filter must block it
    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.is(calls, 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("returns early when no candidates available", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    let calls = 0;

    const { network, state, config } = createBaseMocks({
        network: { tryConnect: () => calls++ },
        state: { getIndexersEntry: async () => [] },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop(false);

        t.is(calls, 0);
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("does not start observer if it is already running", async (t) => {
    const { network, state, config } = createBaseMocks();
    const service = new IndexerObserverService(network, state, "self", config);

    await service.start();
    await service.start();
    await service.stop();

    t.pass();
});

test("gracefully catches exceptions in the worker loop", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    const { network, state, config } = createBaseMocks({
        state: {
            getIndexersEntry: async () => { throw new Error("Simulated DB Crash"); },
        },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop();

        t.pass();
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});

test("gracefully catches exceptions in tryConnect", async (t) => {
    const clock = sinon.useFakeTimers({ now: 0 });

    const { network, state, config } = createBaseMocks({
        network: {
            tryConnect: () => { throw new Error("Simulated Network Transport Error"); },
        },
    });

    const service = new IndexerObserverService(network, state, "self", config);

    try {
        await service.start();

        for (let i = 0; i < 20; i++) {
            clock.tick(10);
            await Promise.resolve();
        }

        await service.stop();

        t.pass();
    } finally {
        clock.restore();
        sinon.restore();
        await cleanup(service);
    }
});
