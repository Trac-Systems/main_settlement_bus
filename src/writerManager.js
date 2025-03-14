import ReadyResource from 'ready-resource';
import crypto from 'hypercore-crypto';

//TODO ADD THROWS
//TODO FOR NOW IT'S FINE. IT MUST BE INTEGRATED WITH TRAC WALLET
//TODO: How about nonce if edDSA is deterministic?

/**
 * WriterManager manages writer nodes in the TRAC NETWORK, handling events, adding/removing writers, and managing the bootstrap process.
 * It interacts with the MainSettlementBus instance to perform key operations.
 */
export class WriterManager extends ReadyResource {
    /**
     * Initializes the WriterManager with the given MainSettlementBus instance.
     * @param {MainSettlementBus} msbInstance - An instance of the MainSettlementBus class.
     */
    constructor(msbInstance) {
        super();
        this.base = msbInstance.base;
        this.signingKeyPair = msbInstance.signingKeyPair; //TODO: REMOVE BECAUSE WE CANT STORE KEYS LIKE THAT.
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

                const bootStrapManifest = await this.base.view.get('bootstrap');
                if (bootStrapManifest === null) {

                    const message = Buffer.concat([
                        Buffer.from(JSON.stringify(this.base.localWriter.core.manifest)),
                        Buffer.from(this.writingKey, 'hex'),
                        this.signingKeyPair.publicKey
                    ]);

                    //SEND BOOTSTRAP TRAC MANIFEST
                    await this.base.append({
                        type: 'initBootstrap',
                        key: 'bootstrap',
                        value: {
                            wk: this.writingKey,
                            hpm: this.base.localWriter.core.manifest,
                            skp: this.signingKeyPair.publicKey.toString('hex'),
                            pop1: crypto.sign(message, this.base.localWriter.core.keyPair.secretKey),
                            pop2: crypto.sign(message, this.signingKeyPair.secretKey)
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

            const writerEntry = await this.base.view.get(this.signingKeyPair.publicKey.toString('hex')); //TODO REMOVE LINE TO FUNCTION
            if (writerEntry !== null && writerEntry.value.isValid) {
                console.log(`Cannot perform operation because node is already writer`);
                return;
            }

            const bootstrapEntry = await this.base.view.get('bootstrap');
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
                        this.signingKeyPair.publicKey
                        //TODO: ADD NONCE?
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'addWriter',
                        key: this.signingKeyPair.publicKey.toString('hex'),
                        value: {
                            wk: this.writingKey,
                            hpm: this.base.local.core.manifest,
                            pop1: crypto.sign(message, this.base.local.core.header.keyPair.secretKey),
                            pop2: crypto.sign(message, this.signingKeyPair.secretKey)
                            //TODO: ADD NONCE?
                        }
                    }));

                    setTimeout(async () => {
                        const updatedWriterEntry = await this.base.view.get(this.signingKeyPair.publicKey.toString('hex'));
                        if (updatedWriterEntry !== null && updatedWriterEntry.value.isValid) {
                            console.log(`Writer ${this.writingKey} was successfully added.`);
                        } else {
                            console.warn(`Writer ${this.writingKey} was NOT added.`);
                        }
                    }, 5000);
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

            const writerEntry = await this.base.view.get(this.signingKeyPair.publicKey.toString("hex"));
            if (writerEntry === null || !writerEntry.value.isValid) {
                console.log(`Your key does not exist in the database  or you can't remove it`);
                return;
            }

            const bootstrapEntry = await this.base.view.get('bootstrap');

            if (bootstrapEntry === null || !bootstrapEntry.value?.hpm?.signers?.[0]?.publicKey?.data) {
                console.log(`Bootstrap key not found`);
                return;
            }

            const bootstrapPubKey = Buffer.from(bootstrapEntry.value.hpm.signers[0].publicKey.data).toString('hex');

            this.swarm.connections.forEach(async conn => {
                if (conn.connected && conn.remotePublicKey.toString('hex') === bootstrapPubKey) {

                    const message = Buffer.concat([
                        this.signingKeyPair.publicKey // TODO: TO REDUCE THE SIZE OF THE MESSAGE WE CAN SEND SIMPLE STRING SUCHAS  "REMOVE".
                        //TODO: ADD NONCE?
                    ]);

                    //SEND TRAC MANIFEST
                    conn.write(JSON.stringify({
                        type: 'removeWriter',
                        key: this.signingKeyPair.publicKey.toString("hex"),
                        value: {
                            pop: crypto.sign(message, this.signingKeyPair.secretKey),
                            //TODO: ADD NONCE?
                        }
                    }));
                }
            })

            setTimeout(async () => {
                const updatedWriterEntry = await this.base.view.get(this.signingKeyPair.publicKey.toString("hex"));
                if (updatedWriterEntry !== null && !updatedWriterEntry.value.isValid) {
                    console.log(`Key successfully removed`);
                } else {
                    console.log(`Failed to remove key`);
                }
            }, 5000);

        } catch (error) {
            console.error(`err in `, error);
        }
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
