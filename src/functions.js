
//TODO: if something is missing, add additonal sanitization
// parsed.op === 'pre-tx' -> moved out of the scope this check because we can re-use this function in the apply
// TODO: Split sanitization on pre and post TX
export function sanitizeTransaction(parsedTx) {
    return (
        typeof parsedTx === 'object' &&
        parsedTx !== null &&
        typeof parsedTx.op === 'string' &&
        typeof parsedTx.tx === 'string' &&
        typeof parsedTx.w === 'string' &&
        typeof parsedTx.i === 'string' &&
        typeof parsedTx.ipk === 'string' &&
        typeof parsedTx.is === 'string'
    );
}

export async function addWriter(input, peer){
    const splitted = input.split(' ');
    if(splitted[0] === '/add_writer'){
        await peer.base.append({ type: 'addWriter', key: splitted[splitted.length - 1] });
    } else if(splitted[0] === '/add_writer2') {
        await peer.base.append({ type: 'addWriter2', key: splitted[splitted.length - 1] });
    }
}