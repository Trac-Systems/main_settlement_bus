import PartialStateMessageBuilder from './PartialStateMessageBuilder.js';
import PartialStateMessageDirector from './PartialStateMessageDirector.js';

class PartialStateMessageOperations {

    static async assembleBootstrapDeployment(wallet, bootstrap) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildPartialBootstrapDeploymentMessage(wallet.address, bootstrap);
        } catch (error) {
            throw new Error(`Failed to assemble partial bootstrap deployment message: ${error.message}`);
        }
    }
}

export default PartialStateMessageOperations;
