import b4a from 'b4a';

export async function verifyDag(state, network, wallet, writerKey, shouldListenToAdminEvents, shouldListenToWriterEvents) {
    try {
        console.log('---------- node & network stats ----------');
        const dagView = await state.base.view.core.treeHash();
        const lengthdagView = state.base.view.core.length;
        const dagSystem = await state.base.system.core.treeHash();
        const lengthdagSystem = state.base.system.core.length;

        console.log('wallet.publicKey:', wallet !== null ? wallet.publicKey.toString('hex') : 'unset');
        console.log('wallet.address:', wallet !== null ? wallet.address : 'unset');
        console.log('msb.writerKey:', writerKey.toString('hex'));
        console.log('swarm.connections.size:', network.swarm.connections.size);
        console.log('base.view.core.signedLength:', state.base.view.core.signedLength);
        console.log('base.view.core.length:', state.base.view.core.length);
        console.log("base.signedLength", state.base.signedLength);
        console.log("base.indexedLength", state.base.indexedLength);
        console.log("base.linearizer.indexers.length", state.base.linearizer.indexers.length);
        console.log(`base.key: ${state.base.key.toString('hex')}`);
        console.log('discoveryKey:', b4a.toString(state.base.discoveryKey, 'hex'));
        console.log(`VIEW Dag: ${dagView.toString('hex')} (length: ${lengthdagView})`);
        console.log(`SYSTEM Dag: ${dagSystem.toString('hex')} (length: ${lengthdagSystem})`);
        const wl = await state.getWriterLength();
        console.log('Total Registered Writers:', wl !== null ? wl : 0);

        console.log("---------- connections stats ----------");
        console.log("Admin Stream:", network.admin_stream ? "Connected" : "Not Connected");
        console.log("Admin Public Key:", network.admin ? network.admin.toString('hex') : "None");
        console.log("Validator Stream:", network.validator_stream ? "Connected" : "Not Connected");
        console.log("Validator Public Key:", network.validator ? network.validator.toString('hex') : "None");
        console.log("Custom Stream:", network.custom_stream ? "Connected" : "Not Connected");
        console.log("Custom Node Address:", network.custom_node ? network.custom_node.toString('hex') : "None");

        console.log("---------- flags ----------");
        console.log(`isIndexer: ${state.isIndexer()}`);
        console.log(`isWriter: ${state.isWritable()}`);
        console.log("shouldListenToAdminEvents: ", shouldListenToAdminEvents);
        console.log("shouldListenToWriterEvents: ", shouldListenToWriterEvents);

    } catch (error) {
        console.error('Error during DAG monitoring:', error.message);
    }
}

export function printHelp() {
    console.log('Available commands:');
    console.log('- /add_writer: add yourself as validator to this MSB once whitelisted.');
    console.log('- /remove_writer: remove yourself from this MSB.');
    console.log('- /add_admin: register admin entry with bootstrap key (initial setup), or use --recovery flag to recover admin role (admin only).');
    console.log('- /add_whitelist: add all specified whitelist addresses. (admin only)');
    console.log('- /add_indexer <address>: change a role of the selected writer node to indexer role. (admin only)');
    console.log('- /remove_indexer <address>: change a role of the selected indexer node to default role. (admin only)');
    console.log('- /ban_writer <address>: demote a whitelisted writer to default role and remove it from the whitelist. (admin only)');
    console.log('- /get_node_info <address>: get information about a node with the given address.');
    console.log('- /stats: check system stats such as writing key, DAG, etc.');
    console.log('- /exit: Exit the program.');
    console.log('- /help: display this help.');
}

export const printWalletInfo = (address, writingKey) => {
    console.log('');
    console.log('#####################################################################################');
    console.log('# MSB Address:   ', address.toString('hex'), ' #');
    console.log('# MSB Writer:    ', writingKey.toString('hex'), '#');
    console.log('#####################################################################################');
}
