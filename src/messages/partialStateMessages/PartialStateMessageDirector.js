import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'

class PartialStateMessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof StateBuilder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildPartialBootstrapDeploymentMessage(address, bootstrap) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .withAddress(address)
            .withExternalBootstrap(bootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }
}

export default PartialStateMessageDirector;
