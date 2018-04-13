'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const hapi = require('hapi');
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

    beforeEach((done) => {
        mockStats = {
            reads: 15,
            writes: 10
        };

        /* eslint-disable global-require */
        plugin = require('../../plugins/stats');
        /* eslint-enable global-require */

        server = new hapi.Server();
        server.connection({
            port: 1234
        });

        mockBuild = {
            register: (srv, opt, next) => {
                srv.expose('stats', mockStats);
                next();
            }
        };
        mockBuild.register.attributes = {
            name: 'builds'
        };

        server.register([
            mockBuild,
            { register: plugin }
        ], (err) => {
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
        assert.isOk(server.registrations.stats);
    });

    describe('GET /stats', () => {
        it('returns 200 with stats', () => (
            server.inject({
                url: '/stats'
            }).then((reply) => {
                assert.equal(reply.statusCode, 200);
                assert.deepEqual(reply.result, {
                    builds: mockStats
                });
            })
        ));
    });
});
