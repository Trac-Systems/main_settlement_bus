export async function verifyDag(base, swarm, wallet, writerKey) {
    try {
        console.log('--- Stats ---');
        const dagView = await base.view.core.treeHash();
        const lengthdagView = base.view.core.length;
        const dagSystem = await base.system.core.treeHash();
        const lengthdagSystem = base.system.core.length;
        console.log(`isIndexer: ${base.isIndexer}`);
        console.log(`isWriter: ${base.writable}`);
        console.log('wallet.publicKey:', wallet !== null ? wallet.publicKey : 'unset');
        console.log('msb.writerKey:', writerKey);
        console.log('swarm.connections.size:', swarm.connections.size);
        console.log('base.view.core.signedLength:', base.view.core.signedLength);
        console.log('base.view.core.length:', base.view.core.length);
        console.log("base.signedLength", base.signedLength);
        console.log("base.indexedLength", base.indexedLength);
        console.log("base.linearizer.indexers.length", base.linearizer.indexers.length);
        console.log(`base.key: ${base.key.toString('hex')}`);
        console.log('discoveryKey:', b4a.toString(base.discoveryKey, 'hex'));
        console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
        console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);
        const wl = await base.view.get('wrl');
        console.log('Total Registered Writers:', wl !== null ? wl.value : 0);

    } catch (error) {
        console.error('Error during DAG monitoring:', error.message);
    }
}

export function printHelp() {
    console.log('Available commands:');
    console.log('- /add_writer: add yourself as validator to this MSB once whitelisted.');
    console.log('- /remove_writer: remove yourself from this MSB.');
    console.log('- /add_admin: register admin entry with bootstrap key. (initial setup)');
    console.log('- /add_whitelist: add all specified whitelist addresses. (admin only)');
    console.log('- /add_indexer <address>: change a role of the selected writer node to indexer role. (admin only)');
    console.log('- /remove_indexer <address>: change a role of the selected indexer node to default role. (admin only)');
    console.log('- /ban_writer <address>: demote a whitelisted writer to default role and remove it from the whitelist. (admin only)');
    console.log('- /get_node_info <address>: get information about a node with the given address.');
    console.log('- /stats: check system stats such as writing key, DAG, etc.');
    console.log('- /exit: Exit the program.');
    console.log('- /help: display this help.');
}

export const printWalletInfo = (tracPublicKey, writingKey) => {
    console.log('');
    console.log('#####################################################################################');
    console.log('# MSB Address:    ', tracPublicKey.toString('hex'), '#');
    console.log('# MSB Writer:     ', writingKey.toString('hex'), '#');
    console.log('#####################################################################################');
}
