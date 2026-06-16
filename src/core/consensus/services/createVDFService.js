export async function createVDFService() {
    if (typeof globalThis.Bare !== 'undefined') {
        const { VDFBareService } = await import('./VDFBareService.js');
        return new VDFBareService();
    } else {
        const { VDFNodeService } = await import('./VDFNodeService.js');
        return new VDFNodeService();
    }
}
