import { jest } from '@jest/globals';
import request from 'supertest';
import { createServer } from '../../../../rpc/create_server.js';

describe('Consensus config RPC routing', () => {
    const signedConfig = { schemaVersion: 1, configData: { difficulty: 55000000, discriminantBitSize: 2048 } };
    const unsignedConfig = { schemaVersion: 1, configData: { difficulty: 60000000, discriminantBitSize: 4096 } };
    let server;
    let getConsensusConfig;

    beforeEach(() => {
        getConsensusConfig = jest.fn(async confirmed => confirmed ? signedConfig : unsignedConfig);
        server = createServer({ getConsensusConfig }, {});
    });

    afterEach(async () => {
        if (server.listening) await new Promise(resolve => server.close(resolve));
        jest.restoreAllMocks();
    });

    it.each([
        ['', true, signedConfig],
        ['?confirmed=true', true, signedConfig],
        ['?confirmed=false', false, unsignedConfig],
    ])('reads the requested view for /consensus-config%s', async (query, confirmed, config) => {
        const response = await request(server).get('/v1/consensus-config' + query);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(config);
        expect(getConsensusConfig).toHaveBeenCalledTimes(1);
        expect(getConsensusConfig).toHaveBeenCalledWith(confirmed);
    });

    it('returns JSON null before genesis initialization', async () => {
        getConsensusConfig.mockResolvedValue(null);
        const response = await request(server).get('/v1/consensus-config');
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.text).toBe('null');
    });

    it('rejects invalid confirmed values without reading state', async () => {
        const response = await request(server).get('/v1/consensus-config?confirmed=maybe');
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe('Parameter "confirmed" must be exactly "true" or "false"');
        expect(getConsensusConfig).not.toHaveBeenCalled();
    });

    it('returns HTTP 500 when the config read fails', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        getConsensusConfig.mockRejectedValue(new Error('corrupt consensus config'));
        const response = await request(server).get('/v1/consensus-config');
        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'An error occurred processing the request.' });
    });

    it('does not match extra path segments or other HTTP methods', async () => {
        expect((await request(server).get('/v1/consensus-config/extra')).statusCode).toBe(404);
        expect((await request(server).post('/v1/consensus-config')).statusCode).toBe(404);
        expect(getConsensusConfig).not.toHaveBeenCalled();
    });
});
