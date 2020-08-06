'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

describe('status plugin test', () => {
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
        plugin = require('../../plugins/status');

        server = Hapi.server({
            port: 1234
        });

        return server.register(plugin);
    });

    afterEach(() => {
        server = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('registers the plugin', () => {
        assert.isOk(server.registrations.status);
    });

    describe('GET /status', () => {
        it('returns 200 with OK', () => (
            server.inject({
                url: '/status'
            }).then((response) => {
                assert.equal(response.statusCode, 200);
                assert.deepEqual(response.result, 'OK');
            })
        ));
    });
});
