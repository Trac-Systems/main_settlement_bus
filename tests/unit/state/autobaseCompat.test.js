import test from 'brittle';
import { installSignedAutobaseStore, installSignedCorestoreStorageFactory } from '../../../src/core/state/State.js';

test('MSB Autobase store wrapper covers genesis direct state appends after ready', async (t) => {
    const appendCalls = [];
    const makeSession = () => ({
        manifest: { signers: [] },
        core: { header: { manifest: { signers: [] } } },
        state: null,
        async ready() {
            this.state = {
                async append(values, opts = {}) {
                    appendCalls.push({ values, opts });
                }
            };
        },
        async append() {
            throw new Error('test must exercise direct state append');
        },
        session() {
            return makeSession();
        }
    });
    const view = {
        core: makeSession(),
        batch: null,
        atomicBatch: null,
        createSession() {
            this.batch = makeSession();
            return this.batch.session();
        }
    };
    const store = {
        getLocal() {
            return makeSession();
        },
        getViewByName() {
            return view;
        },
        get(name) {
            return this.getViewByName(name).createSession();
        },
        atomize() {
            return this;
        }
    };

    installSignedAutobaseStore(store);
    const viewSession = store.get('view');
    await viewSession.ready();
    await viewSession.state.append(['encoded-genesis']);

    t.is(appendCalls.length, 1, 'state append is wrapped');
    t.is(appendCalls[0].opts.signature.length, 0, 'genesis state append receives an empty signature buffer');
});

test('MSB Autobase store wrapper covers migrated view core heads', async (t) => {
    const heads = [];
    const viewCoreSession = {
        manifest: { signers: [] },
        core: {
            header: { manifest: { signers: [] } },
            storage: {
                write() {
                    return {
                        setHead(head) {
                            heads.push(head);
                        }
                    };
                }
            }
        },
        async ready() {},
        async append() {}
    };
    const store = {
        getViewCore() {
            return viewCoreSession;
        }
    };

    installSignedAutobaseStore(store);
    const migrated = store.getViewCore();
    await migrated.ready();
    migrated.core.storage.write().setHead({
        fork: 0,
        length: 1,
        rootHash: Buffer.alloc(32, 8),
        signature: null
    });

    t.is(heads.length, 1, 'migrated view core storage transaction is wrapped');
    t.is(heads[0].signature.length, 0, 'null prologue head signature becomes an empty signature buffer');
});

test('MSB Autobase store wrapper covers named session head creation', async (t) => {
    const heads = [];
    const viewCoreSession = {
        manifest: { signers: [] },
        core: {
            header: { manifest: { signers: [] } },
            storage: {
                write() {
                    return { setHead() {} };
                },
                async createSession(name, head) {
                    heads.push({ name, head });
                    return {};
                }
            }
        },
        async ready() {},
        async append() {}
    };
    const store = {
        getViewCore() {
            return viewCoreSession;
        }
    };

    installSignedAutobaseStore(store);
    const migrated = store.getViewCore();
    await migrated.ready();
    await migrated.core.storage.createSession('batch', {
        fork: 0,
        length: 1,
        rootHash: Buffer.alloc(32, 9),
        signature: null
    });

    t.is(heads.length, 1, 'named session creation is wrapped');
    t.is(heads[0].head.signature.length, 0, 'null session head signature becomes an empty signature buffer');
});

test('MSB Autobase store wrapper covers atomic session head creation', async (t) => {
    const heads = [];
    const viewCoreSession = {
        manifest: { signers: [] },
        core: {
            header: { manifest: { signers: [] } },
            storage: {
                write() {
                    return { setHead() {} };
                },
                async createAtomicSession(atom, head) {
                    heads.push({ atom, head });
                    return {};
                }
            }
        },
        async ready() {},
        async append() {}
    };
    const store = {
        getViewCore() {
            return viewCoreSession;
        }
    };

    installSignedAutobaseStore(store);
    const migrated = store.getViewCore();
    await migrated.ready();
    await migrated.core.storage.createAtomicSession({ view: {} }, {
        fork: 0,
        length: 1,
        rootHash: Buffer.alloc(32, 10),
        signature: null
    });

    t.is(heads.length, 1, 'atomic session creation is wrapped');
    t.is(heads[0].head.signature.length, 0, 'null atomic session head signature becomes an empty signature buffer');
});

test('MSB Autobase store wrapper covers core state atomic session heads', async (t) => {
    const heads = [];
    const viewCoreSession = {
        manifest: { signers: [] },
        core: {
            header: { manifest: { signers: [] } },
            storage: {
                write() {
                    return { setHead() {} };
                }
            },
            state: {
                storage: {
                    write() {
                        return { setHead() {} };
                    },
                    async createAtomicSession(atom, head) {
                        heads.push({ atom, head });
                        return {};
                    }
                }
            }
        },
        async ready() {},
        async append() {}
    };
    const store = {
        getViewCore() {
            return viewCoreSession;
        }
    };

    installSignedAutobaseStore(store);
    const migrated = store.getViewCore();
    await migrated.ready();
    await migrated.core.state.storage.createAtomicSession({ view: {} }, {
        fork: 0,
        length: 1,
        rootHash: Buffer.alloc(32, 11),
        signature: null
    });

    t.is(heads.length, 1, 'core state atomic session creation is wrapped');
    t.is(heads[0].head.signature.length, 0, 'null state atomic session head signature becomes an empty signature buffer');
});

test('MSB Corestore factory wrapper covers created HypercoreStorage instances', async (t) => {
    const heads = [];
    const hypercoreStorage = {
        write() {
            return { setHead() {} };
        },
        async createAtomicSession(atom, head) {
            heads.push({ atom, head });
            return {};
        }
    };
    const corestore = {
        storage: {
            async create() {
                return hypercoreStorage;
            }
        }
    };

    installSignedCorestoreStorageFactory(corestore);
    const storage = await corestore.storage.create();
    await storage.createAtomicSession({ view: {} }, {
        fork: 0,
        length: 1,
        rootHash: Buffer.alloc(32, 12),
        signature: null
    });

    t.is(heads.length, 1, 'created HypercoreStorage instance is wrapped');
    t.is(heads[0].head.signature.length, 0, 'factory-normalized atomic head has an empty signature buffer');
});
