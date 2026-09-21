import test from 'brittle';
import Corestore from 'corestore';
import Autobase from 'autobase';
import State from '../../../src/core/state/State.js';

test('State diagnostics is opt-in and starts/stops with State; apply errors retain their identity', async t => {
    for (const enabled of [false, true]) {
        const store = new Corestore(await t.tmp());
        const logs = [];
        const state = new State(store, null, null, {
            enable_indexer_diagnostics: enabled,
            diagnostics_write: line => logs.push(JSON.parse(line)),
        });
        try {
            await state.ready();
            if (enabled) {
                t.ok(state.diagnostics.timer);
                t.ok(logs.some(log => log.event === 'msb.diag.started'));
                t.ok(logs.some(log => log.event === 'msb.diag.snapshot'));
            } else {
                t.is(state.diagnostics, null);
                t.is(state.base.ack, Autobase.prototype.ack);
            }
            const failure = new Error('injected view batch failure');
            let actual;
            try {
                await state.applyHandler([], { batch() { throw failure; } }, state.base);
            } catch (error) { actual = error; }
            t.is(actual, failure);
            t.is(logs.filter(log => log.event === 'msb.diag.apply.failed').length, enabled ? 1 : 0);
        } finally {
            await state.close();
            await store.close();
        }
        if (enabled) {
            t.is(state.diagnostics.timer, null);
            t.is(state.diagnostics.stopped, true);
            t.is(state.base.ack, Autobase.prototype.ack);
        }
    }
});
