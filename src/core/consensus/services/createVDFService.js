export async function createVDFService() {
    if (typeof globalThis.Bare !== 'undefined') {
        const { VDFBare } = await import('./VDFBare.js');
        return new VDFBare();
    } else {
        const { VDFNode } = await import('./VDFNode.js');
        return new VDFNode();
    }
}
