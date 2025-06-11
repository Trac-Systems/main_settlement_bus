import Hyperbee from 'hyperbee';

export class Bee {
    
    #bee;

    constructor(store) {
        this.#bee = new Hyperbee(store.get('view'), {
            extension: false,
            keyEncoding: 'utf-8',
            valueEncoding: 'json'
        })
    }

    close() {
        if (this.#bee) this.#bee.close();
    }
}