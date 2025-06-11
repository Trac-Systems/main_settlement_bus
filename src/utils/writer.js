import b4a from 'b4a';

export const addWriter = async (op, batch, base) => {
    const nodeEntry = await batch.get(op.key);
    if (nodeEntry === null || !nodeEntry.value.isWriter) {
        await base.addWriter(b4a.from(op.value.wk, 'hex'), { isIndexer: false })
        await batch.put(op.key, {
            pub: op.value.pub,
            wk: op.value.wk,
            isWriter: true,
            isIndexer: false
        });
        let length = await batch.get('wrl');
        if (null === length) {
            length = 0;
        } else {
            length = length.value;
        }
        await batch.put('wri/' + length, op.value.pub);
        await batch.put('wrl', length + 1);
        console.log(`Writer added: ${op.key}:${op.value.wk}`);
    }
}

export const removeWriter = async (op, batch, base) => {
    let nodeEntry = await batch.get(op.key)
    if (nodeEntry !== null) {
        nodeEntry = nodeEntry.value;
        await base.removeWriter(b4a.from(nodeEntry.wk, 'hex'));
        nodeEntry.isWriter = false;
        if (nodeEntry.isIndexer) {
            nodeEntry.isIndexer = false;
            const indexersEntry = await batch.get(EntryType.INDEXERS);
            if (null !== indexersEntry && indexersEntry.value.includes(op.key)) {
                const idx = indexersEntry.value.indexOf(op.key);
                if (idx !== -1) {
                    indexersEntry.value.splice(idx, 1);
                    await batch.put(EntryType.INDEXERS, indexersEntry.value);
                }
            }
        }

        await batch.put(op.key, nodeEntry);
        console.log(`Writer removed: ${op.key}${op.value.wk ? `:${op.value.wk}` : ''}`);

    }
}