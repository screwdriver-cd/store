'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');

sinon.assert.expose(assert, { prefix: '' });

describe('stats plugin test', () => {
    let plugin;
    let server;
    let mockStats;
    let mockBuild;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        mockStats = {
            reads: 15,
            writes: 10
        };

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/stats');

        server = Hapi.server({
            port: 1234
        });

        mockBuild = {
            plugin: {
                name: 'builds',
                // eslint-disable-next-line no-shadow
                async register(server) {
                    server.expose('stats', mockStats);
                }
            }
        };

        return server.register([mockBuild, plugin]);
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
        assert.isOk(server.registrations.stats);
    });

    describe('GET /stats', () => {
        it('returns 200 with stats', () =>
            server
                .inject({
                    url: '/stats'
                })
                .then(response => {
                    assert.equal(response.statusCode, 200);
                    assert.deepEqual(response.result, {
                        builds: mockStats
                    });
                }));
    });
});
