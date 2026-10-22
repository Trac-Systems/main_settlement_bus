import ReadyResource from 'ready-resource';

const READY_RESOURCE_EVENTS = ['ready', 'close'];

export class StateMachine extends ReadyResource {
    #state;
    #context = {};
    #discardState;
    #listeners = new Map();
    #transitions;
    #handlers;
    #transition = null;

    constructor(transitions, initialState, discardState, handlers = {}) {
        super();
        if (!transitions) throw new Error('StateMachine: transitions is required');
        if (!initialState) throw new Error('StateMachine: initialState is required');
        if (discardState === undefined) throw new Error('StateMachine: discardState is required (pass null to disable context clearing)');

        this.#transitions = transitions;
        this.#state = initialState;
        this.#discardState = discardState;
        this.#handlers = handlers;
    }

    async _close() {
        this.clearListeners();
    }

    get state() {
        return this.#state;
    }

    get context() {
        return this.#context;
    }

    appendContext(payload = {}) {
        Object.assign(this.#context, payload);
        return this.#context;
    }

    shouldRun() {
        return this.closing === null && !this.closed;
    }

    async send(event, payload = {}) {
        if (!this.shouldRun()) return false;

        const next = this.#transitions[this.#state]?.[event];
        if (!next) return false;

        this.appendContext(payload);

        const prev = this.#state;
        const transition = { machine: this, prev, next, context: this.#context };
        this.#transition = transition;
        this.#state = next;
        await this.#emit(event, transition);

        // Another transition may have run while an event listener was awaited.
        if (!this.shouldRun() || this.#transition !== transition) return false;

        if (this.#discardState !== null && next === this.#discardState) {
            this.#context = {};
        }

        await this.#dispatch(next);

        return transition;
    }

    // The initial state is assigned directly in the constructor, not reached via send(),
    // so its handler never fires on its own - nothing ever "transitions into" it. This
    // dispatches to the current state's handler once, the same way any other transition
    // does, so callers never need to know which state that is.
    async enter(payload = {}) {
        if (!this.shouldRun()) return false;

        this.appendContext(payload);

        const transition = { machine: this, prev: null, next: this.#state, context: this.#context };
        this.#transition = transition;
        await this.#emit('ENTER', transition);

        if (!this.shouldRun() || this.#transition !== transition) return false;

        await this.#dispatch(transition.next);

        return transition;
    }

    async #dispatch(state) {
        const handler = this.#handlers[state];
        if (handler) await handler(this.#context, this);
    }

    on(event, fn) {
        if (READY_RESOURCE_EVENTS.includes(event)) {
            super.on(event, fn);
            return this;
        }

        if (!this.#listeners.has(event)) this.#listeners.set(event, []);

        this.#listeners.get(event).push(fn);
        return this;
    }

    clearListeners() {
        this.#listeners.clear();
        return this;
    }

    async #emit(event, data) {
        for (const fn of this.#listeners.get(event) ?? []) {
            if (!this.shouldRun() || this.#transition !== data) return;
            await fn(data);
        }
        for (const fn of this.#listeners.get('*') ?? []) {
            if (!this.shouldRun() || this.#transition !== data) return;
            await fn({ event, ...data });
        }
    }
}
