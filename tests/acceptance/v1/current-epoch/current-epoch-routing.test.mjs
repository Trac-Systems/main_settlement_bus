import { jest } from '@jest/globals';
import request from 'supertest';
import { createServer } from '../../../../rpc/create_server.js';

describe('Current epoch RPC routing', () => {
    let server;
    let getCurrentEpoch;

    beforeEach(() => {
        getCurrentEpoch = jest.fn(async confirmed => confirmed ? '0' : '18446744073709551615');
        server = createServer({ getCurrentEpoch }, {});
    });

    afterEach(async () => {
        if (server.listening) await new Promise(resolve => server.close(resolve));
        jest.restoreAllMocks();
    });

    it.each([
        ['', true, '0'],
        ['?confirmed=true', true, '0'],
        ['?confirmed=false', false, '18446744073709551615'],
    ])('reads the requested view for /current-epoch%s', async (query, confirmed, epoch) => {
        const response = await request(server).get('/v1/current-epoch' + query);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ current_epoch: epoch });
        expect(getCurrentEpoch).toHaveBeenCalledTimes(1);
        expect(getCurrentEpoch).toHaveBeenCalledWith(confirmed);
    });

    it('returns null before genesis initialization', async () => {
        getCurrentEpoch.mockResolvedValue(null);
        const response = await request(server).get('/v1/current-epoch');
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ current_epoch: null });
    });

    it('rejects an invalid confirmation parameter without reading the epoch', async () => {
        const response = await request(server).get('/v1/current-epoch?confirmed=maybe');
        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe('Parameter "confirmed" must be exactly "true" or "false"');
        expect(getCurrentEpoch).not.toHaveBeenCalled();
    });

    it('returns an HTTP error when the epoch read fails', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        getCurrentEpoch.mockRejectedValue(new Error('epoch read failed'));
        const response = await request(server).get('/v1/current-epoch');
        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'An error occurred processing the request.' });
    });

    it('does not match extra path segments or other HTTP methods', async () => {
        expect((await request(server).get('/v1/current-epoch/extra')).statusCode).toBe(404);
        expect((await request(server).post('/v1/current-epoch')).statusCode).toBe(404);
        expect(getCurrentEpoch).not.toHaveBeenCalled();
    });
});
