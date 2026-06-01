export async function createVDFService() {
    const { VDFService } = await import("./VDFService.js");
    return new VDFService();
}
