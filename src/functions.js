import BlindPairing from "blind-pairing";

//TODO: if something is missing, add additonal sanitization
// todo : check also this  parsed.op === 'pre-tx' 
export function sanitizePreTransaction(parsedTx) {
    return (
        typeof parsedTx === 'object' && parsedTx !== null &&
        typeof parsedTx.op === 'string' &&
        typeof parsedTx.tx === 'string' &&
        typeof parsedTx.w === 'string' &&
        typeof parsedTx.i === 'string' &&
        typeof parsedTx.ipk === 'object' && parsedTx.ipk !== null && Array.isArray(parsedTx.ipk.data) &&
        parsedTx.ipk.type === 'Buffer' &&
        typeof parsedTx.is === 'object' && parsedTx.is !== null && Array.isArray(parsedTx.is.data) &&
        parsedTx.is.type === 'Buffer' &&
        parsedTx.ipk.data.every(num => typeof num === 'number' && num >= 0 && num <= 255) &&
        parsedTx.is.data.every(num => typeof num === 'number' && num >= 0 && num <= 255)
    );
}

export async function addWriter(input, peer){
    try {
        const splitted = input.split(' ');
        const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(Buffer.from(splitted[splitted.length - 1], 'hex'));
        console.log(invite.toString('hex'), publicKey.toString('hex'), discoveryKey.toString('hex'));
        const _this = peer;
        const member = peer.invite.addMember({
            discoveryKey,
            async onadd(candidate) {
                console.log('Candiate id is', candidate.inviteId.toString('hex'))
                candidate.open(publicKey)
                console.log('Add candidate:', candidate.userData.toString('hex'))
                candidate.confirm({ key: Buffer.from(splitted[splitted.length - 1], 'hex') })
                await _this.base.append({ type: 'addWriter', key: splitted[splitted.length - 1] });
                await _this.base.update();
            }
        })
        console.log('Awaiting invite broadcast...');
        await member.flushed();
        console.log('Invite id...', invite.toString('hex'));
        const adding = peer.invite.addCandidate({
            invite: invite,
            userData: Buffer.from(splitted[splitted.length - 1], 'hex'),
            async onadd(result) {
                console.log('Invited!')
            }
        })
        console.log('Awaiting pairing...');
        await adding.pairing;
        console.log('Paired!');
    } catch (e) {
        console.log(e.message);
    }
}