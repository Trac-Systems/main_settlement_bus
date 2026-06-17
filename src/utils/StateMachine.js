export class StateMachine {
    #state;
    #context = {};
    #discardState;
    #listeners = new Map();
    #transitions;

    constructor(transitions, initialState, discardState) {
        if (!transitions) throw new Error('StateMachine: transitions is required');
        if (!initialState) throw new Error('StateMachine: initialState is required');
        if (discardState === undefined) throw new Error('StateMachine: discardState is required (pass null to disable context clearing)');

        this.#transitions = transitions;
        this.#state = initialState;
        this.#discardState = discardState;
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

    can(event) {
        return Boolean(this.#transitions[this.#state]?.[event]);
    }

    async send(event, payload = {}) {
        const next = this.#transitions[this.#state]?.[event];
        if (!next) return false;

        this.appendContext(payload);

        const prev = this.#state;
        this.#state = next;
        await this.#emit(event, { machine: this, prev, next, context: this.#context });

        const transition = { machine: this, prev, next, context: this.#context };
        if (this.#discardState !== null && next === this.#discardState) {
            this.#context = {};
        }

        return transition;
    }

    on(event, fn) {
        if (!this.#listeners.has(event)) this.#listeners.set(event, []);

        this.#listeners.get(event).push(fn);
        return this;
    }

    clearListeners() {
        this.#listeners.clear();
        return this;
    }

    async #emit(event, data) {
        for (const fn of this.#listeners.get(event) ?? []) await fn(data);
        for (const fn of this.#listeners.get('*') ?? []) await fn({ event, ...data });
    }
}
