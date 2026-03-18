import { ZERO_WK } from "../src/utils/buffer.js";
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

    async handleBalance(address, confirmedFlag) {
        const nodeInfo = await this.#msb.getBalance(address, confirmedFlag !== "false");

        if (nodeInfo) {
            console.log({
                Address: address,
                Balance: bigIntToDecimalString(BigInt(nodeInfo.balance))
            });
            return nodeInfo;
        }

        console.log("Node Entry:", {
            WritingKey: ZERO_WK.toString("hex"),
            IsWhitelisted: false,
            IsWriter: false,
            IsIndexer: false,
            balance: bigIntToDecimalString(0n)
        });
    }

    async handleTxv() {
        const txv = await this.#msb.getTxv();
        console.log("Current TXV:", txv);
        return txv;
    }

    handleConfirmedLength() {
        const confirmedLength = this.#msb.getConfirmedLength();
        console.log("Confirmed_length:", confirmedLength);
        return confirmedLength;
    }

    handleUnconfirmedLength() {
        const unconfirmedLength = this.#msb.getUnconfirmedLength();
        console.log("Unconfirmed_length:", unconfirmedLength);
        return unconfirmedLength;
    }

    async handleTxHashes(start, end) {
        return this.#msb.getTxHashes(start, end);
    }

    async handleTxDetails(hash) {
        const txDetails = await this.#msb.getTxDetails(hash);
        if (!txDetails) {
            console.log(`No payload found for tx hash: ${hash}`);
            return null;
        }

        return txDetails;
    }

    async handleExtendedTxDetails(hash, confirmed) {
        const txDetails = await this.#msb.getExtendedTxDetails(hash, confirmed);
        if (!txDetails) {
            throw new Error(`No payload found for tx hash: ${hash}`);
        }

        return txDetails;
    }
}
