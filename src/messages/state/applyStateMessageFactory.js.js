import ApplyStateMessageDirector from "./ApplyStateMessageDirector.js";
import ApplyStateMessageBuilder from "./ApplyStateMessageBuilder.js";

export const createApplyStateMessageFactory = (wallet, config) =>{
    return new ApplyStateMessageDirector(new ApplyStateMessageBuilder(wallet, config))
}