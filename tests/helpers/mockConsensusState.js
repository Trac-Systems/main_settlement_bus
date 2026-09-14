// Simulate a future State build without adding an override to production apply.
// Only requested config cases are added; the existing V1 rules stay real.
export async function loadStateWithMockConsensus(mocks, configCases) {
    const { registerHooks } = await import('node:module');
    const { default: esmock } = await import('esmock');
    const stateUrl = new URL('../../src/core/state/State.js', import.meta.url);
    let loaded = false;

    const hook = registerHooks({
        load(url, context, nextLoad) {
            const result = nextLoad(url, context);
            const target = new URL(url);
            if (target.origin !== stateUrl.origin || target.pathname !== stateUrl.pathname ||
                !target.searchParams.has('esmk')) return result;

            const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString();
            const method = '    #validateConsensusConfigApply(consensusConfig) {';
            const start = source.indexOf(method);
            const end = source.indexOf('\n    }', start);
            if (loaded || start === -1 || end === -1 || source.indexOf(method, start + method.length) !== -1) {
                throw new Error('Cannot locate the unique private apply config validator in State.');
            }

            const validator = source.slice(start, end);
            const selector = 'switch (safeReadUint8(consensusConfig.sv)) {';
            if (validator.split(selector).length !== 2) {
                throw new Error('The private apply config validator switch changed; update the mock State fixture.');
            }

            loaded = true;
            return {
                ...result,
                source: source.slice(0, start) + validator.replace(selector, `${selector}\n${configCases}`) + source.slice(end),
            };
        },
    });

    try {
        const State = await esmock('./State.js', stateUrl.href, mocks);
        if (!loaded) throw new Error('Mock consensus cases were not loaded into State.');
        return State;
    } finally {
        hook.deregister();
    }
}
