import test from 'brittle';
import { installSignedAutobaseStore } from '../../../src/core/state/State.js';

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
