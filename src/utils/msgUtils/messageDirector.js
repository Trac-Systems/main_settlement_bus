import Builder from './builder.js';
import { OperationType } from '../protobuf/applyOperations.cjs'

class MessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof Builder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(adminEntry, writingKey, bootstrap, tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.withOperationType(OperationType.ADD_ADMIN)
            .withTracPubKey(tracPublicKey)
            .withAdminEntry(adminEntry)
            .withWriterKey(writingKey)
            .withBootstrap(bootstrap)
            .buildValueAndSign();
            
        return this.#builder.getPayload();
    }
}

export default MessageDirector;