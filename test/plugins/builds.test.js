'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe.only('builds plugin test', () => {
    const mockBuildID = 1899999;
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
        plugin = require('../../plugins/builds');

        server = Hapi.server({
            cache: {
                engine: catmemory,
                maxByteSize: 512,
                allowMixedContent: true
            },
            port: 1234
        });

        server.auth.scheme('custom', function () {
            return {
                authenticate(request, h) {
                    console.log('helloooo, anyone home?');

                    return h.authenticated();
                }
            };
        });
        server.auth.strategy('token', 'custom');
        server.auth.strategy('session', 'custom');

        return server.register({ plugin })
            .then(() => {
                console.log('ready');

                return server.start();
            });
    });

    afterEach(() => server.stop()
        .then(() => {
            server = null;
            mockery.deregisterAll();
            mockery.resetCache();
        }));

    after(() => {
        mockery.disable();
    });

    it('registers the plugin', () => {
        assert.isOk(server.registrations.builds);
    });

    describe('GET /builds/:id/:artifact', () => {
        it('returns 404 if not found', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    username: mockBuildID,
                    scope: ['user']
                },
                url: `/builds/${mockBuildID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 404);
            })
        ));

        describe('caching is not setup right', () => {
            let badServer;

            beforeEach(() => {
                badServer = Hapi.server({
                    cache: {
                        engine: catmemory,
                        maxByteSize: 9999999999,
                        allowMixedContent: true
                    },
                    port: 12345
                });

                badServer.auth.scheme('custom', () => ({
                    authenticate: (request, h) => h.continue
                }));
                badServer.auth.strategy('token', 'custom');
                badServer.auth.strategy('session', 'custom');

                return badServer.register({ plugin });
            });

            afterEach(() => {
                badServer = null;
            });

            it('returns 500 if caching fails', () => (
                badServer.inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    },
                    url: `/builds/${mockBuildID}/foo`
                }).then((response) => {
                    assert.equal(response.statusCode, 500);
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
            options.url = '/builds/122222/foo';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/builds/${mockBuildID}/foo`;
            // @note this pushes the payload size over the 512 byte limit
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 503);
            });
        });

        it('saves an artifact', () => {
            options.url = `/builds/${mockBuildID}/foo`;

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 202);

                return server.inject({
                    url: `/builds/${mockBuildID}/foo`,
                    headers: {
                        'x-foo': 'bar'
                    },
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
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
