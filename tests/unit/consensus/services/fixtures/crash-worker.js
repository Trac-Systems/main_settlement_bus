import { workerData } from 'worker_threads';

workerData.port.on('message', () => {
    process.exit(1);
});