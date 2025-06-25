import MessageDirector from './messageDirector.js';
import MessageBuilder from './messageBuilder.js';
import { safeEncodeAppyOperation } from '../functions.js';
//facade
class MsgUtils {
    static async assembleAddAdminMessage(adminEntry, writingKey, wallet, bootstrap) {
        try {
            const builder = new MessageBuilder(wallet);
            const director = new MessageDirector();
            director.builder = builder;
            const payload = await director.buildAddAdminMessage(adminEntry, writingKey, bootstrap, wallet.publicKey);
            console.log(" payload:", payload);

            const encodedPayload = safeEncodeAppyOperation(payload);
            console.log("Encoded payload:", encodedPayload);
        } catch (error) {
            console.error(`Failed to assemble admin message via MsgUtils: ${error.message}`);
            return null;
        }
    }
}

export default MsgUtils;