'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const hapi = require('hapi');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

describe('logging plugin test', () => {
    let plugin;
    let server;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach((done) => {
        /* eslint-disable global-require */
        plugin = require('../../plugins/logging');
        /* eslint-enable global-require */

        server = new hapi.Server();
        server.connection({
            port: 1234
        });

        server.register([plugin], (err) => {
            done(err);
        });
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
        assert.isOk(server.registrations.good);
    });
});
