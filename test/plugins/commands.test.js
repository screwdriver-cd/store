'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe('commands plugin test', () => {
    const mockCommandNamespace = 'foo';
    const mockCommandName = 'bar';
    const mockCommandVersion = '1.2.3';
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
        plugin = require('../../plugins/commands');
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
        assert.isOk(server.registrations.commands);
    });

    describe('GET /commands/:namespace/:name/:version', () => {
        it('returns 404 if not found', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    scope: ['user']
                },
                url: `/commands/${mockCommandNamespace}/foo/0.0`
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
                    headers: {
                        'x-foo': 'bar'
                    },
                    credentials: {
                        scope: ['user']
                    },
                    url: `/commands/${mockCommandNamespace}/`
                        + `${mockCommandName}/${mockCommandVersion}`
                }).then((reply) => {
                    assert.equal(reply.statusCode, 500);
                })
            ));
        });
    });

    describe('POST /commands/:namespace/:name/:version', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'POST',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    scope: ['build'],
                    pipelineId: 123
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/commands/foo/bar/1.2.3';
            options.credentials.scope = ['user'];

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;
            // @note this pushes the payload size over the 512 byte limit
            options.payload += 'WEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'WEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 503);
            });
        });

        it('saves an artifact', () => {
            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 202);

                return server.inject({
                    url: `/commands/${mockCommandNamespace}/`
                        + `${mockCommandName}/${mockCommandVersion}`,
                    headers: {
                        'x-foo': 'bar'
                    },
                    credentials: {
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

    describe('DELETE /commands/:namespace/:name/:version', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    scope: ['user']
                }
            };
        });

        it('returns 404 if not found', () => {
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    scope: ['user']
                },
                url: `/commands/${mockCommandNamespace}/foo/0.0`
            }).then((reply) => {
                assert.equal(reply.statusCode, 404);
            });
        });

        it('deletes an artifact', () => {
            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;

            return server.inject(options).then((reply) => {
                assert.equal(reply.statusCode, 204);

                return server.inject({
                    url: `/commands/${mockCommandNamespace}/`
                        + `${mockCommandName}/${mockCommandVersion}`,
                    headers: {
                        'x-foo': 'bar'
                    },
                    credentials: {
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
