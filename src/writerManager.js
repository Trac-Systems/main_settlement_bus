import ReadyResource from 'ready-resource';

//TODO ADD THROWS
//TODO FOR NOW IT'S FINE. IT MUST BE INTEGRATED WITH TRAC WALLET
//TODO: How about nonce if edDSA is deterministic?
//TODO: if enable_wallet is false then user shouldn't be allowd to add or remove writer
/**
 * WriterManager manages writer nodes in the TRAC NETWORK, handling events, adding/removing writers, and managing the bootstrap process.
 * It interacts with the MainSettlementBus instance to perform key operations.
 */

const MS_TO_WAIT = 5000;

export class WriterManager extends ReadyResource {
    /**
     * Initializes the WriterManager with the given MainSettlementBus instance.
     * @param {MainSettlementBus} msbInstance - An instance of the MainSettlementBus class.
     */
    constructor(msbInstance) {
        super();
        this.base = msbInstance.base;
        this.wallet = msbInstance.wallet;
        this.swarm = msbInstance.swarm;
        this.bootstrap = msbInstance.bootstrap;
        this.writingKey = msbInstance.writingKey;

        this.#initBootstrap(msbInstance);

    }

    /**
    * Initializes the bootstrap initialization process if the node is a bootstrap node and can be only executed by the bootstrap node.
    * @returns {Promise<void>} Resolves once the bootstrap initialization is complete.
    */
    async #initBootstrap(msbInstance) {
        try {

            if (this.writingKey && this.writingKey === this.bootstrap) {

                const bootStrapEntry = await this.getBootstrapEntry();
                if (bootStrapEntry === null) {

                    const message = Buffer.concat([
                        Buffer.from(JSON.stringify(this.base.localWriter.core.manifest)),
                        Buffer.from(this.writingKey, 'hex'),
                        Buffer.from(this.wallet.publicKey, 'hex')
                    ]);

                    //SEND BOOTSTRAP TRAC MANIFEST
                    await this.base.append({
                        type: 'initBootstrap',
                        key: 'bootstrap',
                        value: {
                            wk: this.writingKey,
                            hpm: this.base.localWriter.core.manifest,
                            skp: this.wallet.publicKey,
                            pop1: this.wallet.sign(message, this.base.localWriter.core.keyPair.secretKey),
                            pop2: this.wallet.sign(message)
                        }
                    });
                }
                console.log(`Bootstrap node ${this.writingKey} is ready to accept writers`);
                await this.#WriterEventListener(msbInstance);
            }
        } catch (error) {
            console.error(`err in `, error);
        }
    }

    /**
     * Listens for writer events and processes them by appending the parsed request to the base.
     * At this moment only Bootstrap is listening for writer events.
     * @private
     */
    async #WriterEventListener(msbInstance) {
        msbInstance.on('writerEvent', async (parsedRequest) => {
            await this.base.append(parsedRequest);
        });
    }

    /**
     * Adds the current node as a writer if it is not already a writer.
     * The node must connect to the bootstrap node to complete the operation.
     * @returns {Promise<void>} Resolves once the writer has been added or if the operation fails.
     */
    async addMe() {
        try {

            if (this.writingKey === this.bootstrap) {
                console.log('Bootstrap node cannot add itself');
                return;
            }

            const writerEntry = await this.base.view.get(this.wallet.publicKey);
            if (writerEntry !== null && writerEntry.value.isValid) {
                console.log(`Cannot perform operation because node is already writer`);
                return;
            }

            const bootstrapEntry = await this.getBootstrapEntry();
            if (!bootstrapEntry?.value?.hpm?.signers?.[0]?.publicKey?.data) {
                console.log(`Bootstrap key not found`);
                return;
            }

            const bootstrapPubKey = Buffer.from((bootstrapEntry.value.hpm.signers[0].publicKey.data)).toString('hex');

            this.swarm.connections.forEach(async conn => {
                if (conn.connected && conn.remotePublicKey.toString('hex') === bootstrapPubKey) {

                    const message = Buffer.concat([
                        Buffer.from(JSON.stringify(this.base.local.core.manifest)),
                        Buffer.from(this.writingKey, 'hex'),
                        Buffer.from(this.wallet.publicKey, 'hex')
                        //TODO: ADD NONCE?
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'addWriter',
                        key: this.wallet.publicKey,
                        value: {
                            wk: this.writingKey,
                            hpm: this.base.local.core.manifest,
                            pop1: this.wallet.sign(message, this.base.local.core.header.keyPair.secretKey),
                            pop2: this.wallet.sign(message),
                            //TODO: ADD NONCE?
                        }

                    }));

                    setTimeout(async () => {
                        const updatedWriterEntry = await this.base.view.get(this.wallet.publicKey);
                        if (updatedWriterEntry !== null && updatedWriterEntry.value.isValid) {
                            console.log(`Writer ${this.writingKey} was successfully added.`);
                        } else {
                            console.warn(`Writer ${this.writingKey} was NOT added.`);
                        }
                    }, MS_TO_WAIT);
                }
            })
        } catch (error) {
            console.error(`err in `, error);
        }
    }
    /**
     * Removes the current node as a writer.
     * The node must connect to the bootstrap node to complete the removal operation.
     * @returns {Promise<void>} Resolves once the writer has been removed or if the operation fails.
     */
    async removeMe() {
        try {

            if (this.writingKey === this.bootstrap) {
                console.log('Bootstrap node cannot remove itself');
                return;
            }

            const writerEntry = await this.base.view.get(this.wallet.publicKey);
            if (writerEntry === null || !writerEntry.value.isValid) {
                console.log(`Your key does not exist in the database  or you can't remove it`);
                return;
            }

            const bootstrapEntry = await this.getBootstrapEntry();

            if (bootstrapEntry === null || !bootstrapEntry.value?.hpm?.signers?.[0]?.publicKey?.data) {
                console.log(`Bootstrap key not found`);
                return;
            }

            const bootstrapPubKey = Buffer.from(bootstrapEntry.value.hpm.signers[0].publicKey.data).toString('hex');

            this.swarm.connections.forEach(async conn => {
                if (conn.connected && conn.remotePublicKey.toString('hex') === bootstrapPubKey) {

                    const message = Buffer.concat([
                        Buffer.from(this.wallet.publicKey, 'hex') // TODO: TO REDUCE THE SIZE OF THE MESSAGE WE CAN SEND SIMPLE STRING SUCHAS  "REMOVE". You can just HASH the message and sign the hash.
                        //TODO: ADD NONCE?
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'removeWriter',
                        key: this.wallet.publicKey,
                        value: {
                            pop: this.wallet.sign(message),
                            //TODO: ADD NONCE?
                        }
                    }));
                }
            })

            setTimeout(async () => {
                const updatedWriterEntry = await this.base.view.get(this.wallet.publicKey);
                if (updatedWriterEntry !== null && !updatedWriterEntry.value.isValid) {
                    console.log(`Key successfully removed`);
                } else {
                    console.log(`Failed to remove key`);
                }
            }, MS_TO_WAIT);

        } catch (error) {
            console.error(`err in `, error);
        }
    }

    async addIndexer(peerTracPublicKey, peerWritingKey) {
        if (this.writingKey !== this.bootstrap) {
            console.log('Only bootstrap node can add indexer');
            return;
        }

        const writerEntry = await this.base.view.get(peerTracPublicKey);
        if (writerEntry === null || writerEntry.value.isValid === false || writerEntry.value.wk !== peerWritingKey || (writerEntry.value.isValid === true && writerEntry.value.isIndexer === true)) {
            console.log(`Writer ${peerTracPublicKey}:${this.writingKey} can not become an indxer`);
            return;
        } 

        const message = Buffer.concat([
            Buffer.from(peerTracPublicKey, 'hex'),
            Buffer.from(peerWritingKey, 'hex')
        ]);

        const indexerRequest = {
            type: 'addIndexer',
            key: this.wallet.publicKey,
            value: {
                ptpk: peerTracPublicKey,
                pwk: peerWritingKey,
                pop: this.wallet.sign(message)
            }
        }
        await this.base.append(indexerRequest);
        //TODO: ADD TIMEOUT

    }

    async removeIndexer(peerTracPublicKey, peerWritingKey) {
        if (this.writingKey !== this.bootstrap) {
            console.log('Only bootstrap node can add indexer');
            return;
        }
        const writerEntry = await this.base.view.get(peerTracPublicKey);

        if (writerEntry === null || writerEntry.value.isValid === false || writerEntry.value.wk !== peerWritingKey || (writerEntry.value.isValid === true && writerEntry.value.isIndexer === false)) {
            console.log(`Writer ${peerTracPublicKey}:${this.writingKey} can lose indexer status`);
            return;
        } 

        const message = Buffer.concat([
            Buffer.from(peerTracPublicKey, 'hex'),
            Buffer.from(peerWritingKey, 'hex')
        ]);

        const indexerRequest = {
            type: 'removeIndexer',
            key: this.wallet.publicKey,
            value: {
                ptpk: peerTracPublicKey,
                pwk: peerWritingKey,
                pop: this.wallet.sign(message)
            }
        }
        await this.base.append(indexerRequest);
                //TODO: ADD TIMEOUT


    }
    /**
     * Retrieves the bootstrap entry from the base view.
     * 
     * @returns {Promise<Object|null>} The bootstrap entry if it exists, otherwise null.
     */
    async getBootstrapEntry() {
        return await this.base.view.get('bootstrap');
    }

    /**
     * Handles incoming writer events by parsing the data and emitting a writerEvent.
     * 
     * @param {MainSettlementBus} msbInstance - An instance of the MainSettlementBus class.
     * @param {Buffer} data - The data received from the connection.
     */
    static async handleIncomingWriterEvent(msbInstance, data) {
        try {
            const bufferData = data.toString();
            const parsedRequest = JSON.parse(bufferData);
            if (parsedRequest.type === 'addWriter' || parsedRequest.type === 'removeWriter') {
                msbInstance.emit('writerEvent', parsedRequest);
            }
        } catch (error) {
            // for now ignore the error
        }
    }
}

export default WriterManager;
