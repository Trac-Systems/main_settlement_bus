/**
 * Creates the VDF service for the current runtime. Bare and Pear use separate processes. Node uses a
 * worker thread. The caller waits for ready() before use and calls close() when the service is no
 * longer needed.
 *
 * @returns {Promise<import('./VDFService.js').VDFService>} VDF service ready to be opened.
 */
export async function createVDFService() {
    if (typeof globalThis.Bare !== 'undefined') {
        const { VDFBare } = await import('./VDFBare.js');
        return new VDFBare();
    } else {
        const { VDFNode } = await import('./VDFNode.js');
        return new VDFNode();
    }
}
