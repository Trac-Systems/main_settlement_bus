import { bigIntToDecimalString } from "../src/utils/amountSerialization.js";

export class Handlers {
    #msb
    #config

    constructor(msb, config) {
        this.#msb = msb
        this.#config = config
    }

    handleFee() {
        const fee = this.#msb.handleGetFee()
        console.log("Current FEE:", bigIntToDecimalString(fee));
    }
}
