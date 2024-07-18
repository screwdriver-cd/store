'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

sinon.assert.expose(assert, { prefix: '' });

describe('auth plugin test', () => {
    let plugin;
    let server;
    let options;

    beforeEach(() => {
        // eslint-disable-next-line global-require
        plugin = require('../../plugins/auth');

        options = {
            jwtPublicKey: fs.readFileSync(path.join(__dirname, './data/auth.test.crt'), 'utf8'),
            jwtMaxAge: '1h'
        };

        server = Hapi.server({
            port: 1234
        });
    });

    afterEach(async () => {
        await server.stop();
        server = null;
    });

    it('registers the plugin', async () => {
        try {
            await server.register({ plugin, options });
        } catch (err) {
            assert.fail(err);
        }

        assert.isOk(server.registrations['hapi-auth-jwt2']);
    });

    it('throws an error on incorrect public key format', async () => {
        options.jwtPublicKey = 35345;

        try {
            await server.register({ plugin, options });

            assert.fail('Error should be thrown');
        } catch (err) {
            assert.isOk(err);
        }
    });

    it('can validate a route', async () => {
        const privateKey = fs.readFileSync(path.join(__dirname, './data/auth.test.key'), 'utf8');
        const token = jwt.sign({ data: 'some data' }, privateKey, {
            algorithm: 'RS256'
        });

        let response;

        await server.register({ plugin, options });

        server.route({
            method: 'GET',
            path: '/',
            options: {
                auth: 'token'
            },
            handler() {
                return 'success';
            }
        });

        try {
            response = await server.inject({
                method: 'GET',
                url: '/',
                headers: {
                    Authorization: token
                }
            });
        } catch (err) {
            assert.fail(err);
        }

        assert.equal(200, response.statusCode);
        assert.equal('success', response.result);
    });

    it('jwt expiration', async () => {
        const privateKey = fs.readFileSync(path.join(__dirname, './data/auth.test.key'), 'utf8');
        const token = jwt.sign({ data: 'some data' }, privateKey, {
            algorithm: 'RS256'
        });

        let response;

        await server.register({
            plugin,
            options: { ...options, jwtMaxAge: '0h' }
        });

        server.route({
            method: 'GET',
            path: '/',
            options: {
                auth: 'token'
            },
            handler() {
                return 'success';
            }
        });

        try {
            response = await server.inject({
                method: 'GET',
                url: '/',
                headers: {
                    Authorization: token
                }
            });
        } catch (err) {
            assert.fail(err);
        }

        assert.equal(401, response.statusCode);
        assert.equal('Unauthorized', response.statusMessage);
    });
});
