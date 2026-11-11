import test from 'brittle';
import b4a from 'b4a';
import { loadStateWithMockConsensus } from '../../helpers/mockConsensusState.js';

if (typeof globalThis.Bare !== 'undefined') {
    test('Mock consensus loader coverage requires Node module mocking', t => {
        t.pass('skipped in Bare because esmock depends on node:module');
    });
} else {
    test('Mock consensus State works after another esmock call and keeps validators isolated', async t => {
        const { default: esmock } = await import('esmock');
        await esmock('../../../src/core/state/State.js', {});

        let vdfValidationCalls = 0;
        const StateWithV2 = await loadStateWithMockConsensus({
            '../../codecs/consensus/v1/vdfConfigCodec.js': {
                safeDecodeVdfConfig: () => {
                    vdfValidationCalls++;
                    return null;
                },
            },
        }, {
            1: () => true,
            2: config => b4a.equals(config.cd, b4a.from([2, 42])),
        });
        const stateWithV2 = Object.create(StateWithV2.prototype);
        const v2Config = { sv: b4a.from([2]), cd: b4a.from([2, 42]) };

        t.ok(stateWithV2._validateConsensusConfigApply(v2Config), 'the requested V2 validator is active');
        t.absent(stateWithV2._validateConsensusConfigApply({ sv: b4a.from([2]), cd: b4a.from([2, 0]) }),
            'the synthetic validator still rejects malformed config data');
        t.absent(stateWithV2._validateConsensusConfigApply({ ...v2Config, sv: b4a.from([2, 0]) }),
            'synthetic versions keep the production schema-version width check');
        t.absent(stateWithV2._validateConsensusConfigApply(null), 'missing config remains invalid');
        t.is(vdfValidationCalls, 0, 'synthetic validation does not invoke VDF');

        t.absent(stateWithV2._validateConsensusConfigApply({ sv: b4a.from([1]), cd: b4a.alloc(0) }),
            'synthetic validators cannot override production V1 validation');
        t.is(vdfValidationCalls, 1, 'production validation retains the requested dependency mock');

        const StateWithV3 = await loadStateWithMockConsensus({}, {
            3: config => b4a.equals(config.cd, b4a.from([3, 42])),
        });
        const stateWithV3 = Object.create(StateWithV3.prototype);
        t.ok(stateWithV3._validateConsensusConfigApply({ sv: b4a.from([3]), cd: b4a.from([3, 42]) }),
            'a later mock can register a different synthetic version');
        t.absent(stateWithV3._validateConsensusConfigApply(v2Config), 'synthetic validators do not leak between mocks');

        const { default: State } = await import('../../../src/core/state/State.js');
        t.absent(Object.create(State.prototype)._validateConsensusConfigApply(v2Config),
            'the production State still rejects unsupported versions');
    });
}
