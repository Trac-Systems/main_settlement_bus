class PartialHtlcValidator {
    #config;

    constructor(_state, _selfAddress, config) {
        this.#config = config;
    }

    async validate(payload) {
        return true;
    }
}

export default PartialHtlcValidator;

