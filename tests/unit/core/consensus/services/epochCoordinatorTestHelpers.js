import sinon from 'sinon';
import b4a from 'b4a';

export const CONFIG = Object.freeze({
    epochInterval: 1000,
    epochBackoffDelay: 1000,
    epochSignatureTimeout: 5000,
    epochAppendTimeout: 5000,
    epochRemoteProposalTimeout: 5000,
    networkId: 1,
    addressPrefix: 'trac',
    vdfDifficulty: 100,
    vdfDiscriminantSizeBits: 2048,
    logLevel: 'silent',
});

export const makeConfirmation = () => ({
    signature: b4a.alloc(64, 0xbb),
    approver: b4a.alloc(21, 0x01),
});

export const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

export const drainMicrotasks = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

export function makeEmitter() {
    const listeners = new Map();
    const emitter = {
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(handler);
            return emitter;
        },
        once(event, handler) {
            const wrapper = (...args) => {
                emitter.off(event, wrapper);
                return handler(...args);
            };
            return emitter.on(event, wrapper);
        },
        off(event, handler) {
            const handlers = listeners.get(event) ?? [];
            listeners.set(event, handlers.filter(candidate => candidate !== handler));
            return emitter;
        },
        removeListener(event, handler) {
            return emitter.off(event, handler);
        },
        async emit(event, ...args) {
            for (const handler of [...(listeners.get(event) ?? [])]) {
                await handler(...args);
            }
        },
        listenerCount(event) {
            return listeners.get(event)?.length ?? 0;
        },
    };

    return emitter;
}

export function makeState(overrides = {}) {
    const state = Object.assign(makeEmitter(), {
        indexerCount: sinon.stub().resolves(1),
        getCurrentEpoch: sinon.stub().resolves(5n),
        getEpoch: sinon.stub().resolves(b4a.alloc(32, 0xaa)),
        refresh: sinon.stub().resolves(),
        getSignedConsensusConfig: sinon.stub().resolves({
            schemaVersion: 1,
            configData: {
                difficulty: 100,
                discriminantBitSize: 2048,
            },
        }),
        ...overrides,
    });

    state.requireCurrentEpoch = async () => {
        const epoch = await state.getCurrentEpoch();
        if (epoch === null || epoch === undefined) {
            throw new Error('Current epoch is not initialized. Genesis epoch has not been set.');
        }
        return epoch;
    };

    state.requireEpoch = async (count) => {
        const epochHash = await state.getEpoch(count);
        if (epochHash === null || epochHash === undefined) {
            throw new Error(`Cannot read epoch ${count}: epoch is not initialized or does not exist.`);
        }
        return epochHash;
    };

    state.requireSignedConsensusConfig = async () => {
        const consensusConfig = await state.getSignedConsensusConfig();
        if (consensusConfig === null || consensusConfig === undefined) {
            throw new Error('Consensus config is not initialized.');
        }
        return consensusConfig;
    };

    return state;
}

export function makeOperations(overrides = {}) {
    return {
        calculateVDF: sinon.stub().resolves({
            solution: b4a.alloc(516, 0xff),
            difficulty: 100,
            discriminantSizeBits: 2048,
        }),
        createProofProposal: sinon.stub().resolves({
            proof_proposal: { epoch: b4a.alloc(8) },
        }),
        approvers: sinon.stub().resolves([{ key: b4a.alloc(32, 0x02) }]),
        collectSignature: sinon.stub().resolves(makeConfirmation()),
        buildSetEpochPayload: sinon.stub().resolves(b4a.alloc(64, 0xdd)),
        appendSetEpoch: sinon.stub().resolves(),
        ...overrides,
    };
}
