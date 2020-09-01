'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

describe('swagger plugin test', () => {
    let plugin;
    let server;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        // eslint-disable-next-line global-require
        plugin = require('../../plugins/swagger');

        server = Hapi.server({
            port: 1234
        });

        return server.register(plugin);
    });

    afterEach(async () => {
        await server.stop();
        server = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('registers the plugin', () => {
        assert.isOk(server.registrations['hapi-swagger']);
    });

    describe('GET /swagger.json', () => {
        it('returns 200 with OK', () => (
            server.inject({
                url: '/swagger.json'
            }).then((response) => {
                assert.equal(response.statusCode, 200);
                assert.isOk(response.result.swagger);
            })
        ));
    });
});
