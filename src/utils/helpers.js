export function isHexString(string) {
    return typeof string === 'string' && string.length > 1 && /^[0-9a-fA-F]+$/.test(string) && string.length % 2 === 0;
}

export async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const safeJsonStringify = (value) => {
    try {
        return JSON.stringify(value);
    } catch (error) {
        console.error(error);
    }
    return null;
}

export const safeJsonParse = (str) => {
    try {
        return JSON.parse(str);
    } catch (error) {
        console.error(error);
    }
    return undefined;
}
