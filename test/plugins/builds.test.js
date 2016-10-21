'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe('builds plugin test', () => {
    const mockBuildID = '80754af91bfb6d1073585b046fe0a474ce868509';
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
        plugin = require('../../plugins/builds');
        /* eslint-enable global-require */

        server = new hapi.Server({
            cache: {
                engine: catmemory,
                maxByteSize: 512,
                allowMixedContent: true
            }
        });
        server.connection({
            port: 1234
        });

        server.auth.scheme('custom', () => ({
            authenticate: (request, reply) => reply.continue({})
        }));
        server.auth.strategy('token', 'custom');
        server.auth.strategy('session', 'custom');

        server.register({
            register: plugin
        }, (err) => {
            if (err) {
                return done(err);
            }

            return server.start(done);
        });
    });

    afterEach(() => {
        server.stop();
        server = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('registers the plugin', () => {
        assert.isOk(server.registrations.builds);
    });

    describe('GET /builds/:id/:artifact', () => {
        it('returns 404 if not found', () => (
            server.inject({
                url: `/builds/${mockBuildID}/foo`
            }).then((reply) => {
                assert.equal(reply.statusCode, 404);
            })
        ));

        describe('caching is not setup right', () => {
            let badServer;

            beforeEach((done) => {
                badServer = new hapi.Server({
                    cache: {
                        engine: catmemory,
                        maxByteSize: 9999999999,
                        allowMixedContent: true
                    }
                });
                badServer.connection({
                    port: 12345
                });

                badServer.auth.scheme('custom', () => ({
                    authenticate: (request, reply) => reply.continue({})
                }));
                badServer.auth.strategy('token', 'custom');
                badServer.auth.strategy('session', 'custom');

                badServer.register({
                    register: plugin
                }, done);
            });

            afterEach(() => {
                badServer = null;
            });

            it('returns 500 if caching fails', () => (
                badServer.inject({
                    url: `/builds/${mockBuildID}/foo`
                }).then((reply) => {
                    assert.equal(reply.statusCode, 500);
                })
            ));
        });
    });

    describe('PUT /builds/:id/:artifact', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'PUT',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    username: mockBuildID,
                    scope: ['build']
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/builds/8843d7f92416211de9ebb963ff4ce28125932878/foo';

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/builds/${mockBuildID}/foo`;
            options.payload += 'WEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 503);
            });
        });

        it('saves an artifact', () => {
            options.url = `/builds/${mockBuildID}/foo`;

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 202);

                return server.inject({
                    url: `/builds/${mockBuildID}/foo`
                }).then((reply2) => {
                    assert.equal(reply2.statusCode, 200);
                    assert.equal(reply2.headers['x-foo'], 'bar');
                    assert.equal(reply2.headers['content-type'], 'text/plain; charset=utf-8');
                    assert.isNotOk(reply2.headers.ignore);
                    assert.equal(reply2.result, 'THIS IS A TEST');
                });
            });
        });
    });
});
