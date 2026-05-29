import Worker from "bare-worker";
  
if (!Worker.isMainThread) {
    const { loadWasm } = await import('./vdf.wasm.js');
    const wasm = await loadWasm();
    
    Worker.parentPort.on("message", ({ discriminantSizeBits, challenge, difficulty }) => {
        const vdf = new wasm.WesolowskiVDFParams(discriminantSizeBits);
        const solution = vdf.solve(challenge, difficulty);
        Worker.parentPort.postMessage({ solution });
    });
}
  
export class VDFService {
    #worker;

    constructor() {
        this.#worker = new Worker(__filename);
    } 

    calculateVDF(challenge, difficulty, discriminantSizeBits) {
        return new Promise((resolve, reject) => {
            this.#worker.once("message", (result) => resolve(result));
            this.#worker.once("error", (err) => reject(err));
            this.#worker.postMessage({ discriminantSizeBits, challenge, difficulty });
        });
    }
}