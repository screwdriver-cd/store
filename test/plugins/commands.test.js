'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('hapi');
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

    beforeEach(() => {
        // eslint-disable-next-line global-require
        plugin = require('../../plugins/commands');

        server = Hapi.server({
            cache: {
                engine: catmemory,
                maxByteSize: 512,
                allowMixedContent: true
            },
            port: 1234
        });

        server.auth.scheme('custom', () => ({
            authenticate: (request, h) => h.authenticated()
        }));
        server.auth.strategy('token', 'custom');
        server.auth.strategy('session', 'custom');

        return server.register({ plugin })
            .then(() => server.start());
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
                    authenticate: (request, h) => h.authenticated()
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
                        scope: ['user']
                    },
                    url: `/commands/${mockCommandNamespace}/`
                        + `${mockCommandName}/${mockCommandVersion}`
                }).then((response) => {
                    assert.equal(response.statusCode, 500);
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

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;
            // @note this pushes the payload size over the 512 byte limit
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 503);
            });
        });

        it('saves an artifact', async () => {
            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`,
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    scope: ['user']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['x-foo'], 'bar');
                assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });
    });

    describe('DELETE /commands/:namespace/:name/:version', () => {
        let getOptions;
        let postOptions;
        let deleteOptions;

        beforeEach(() => {
            getOptions = {
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    scope: ['user']
                },
                url: `/commands/${mockCommandNamespace}/foo/1.2.5`
            };
            postOptions = {
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
                },
                url: `/commands/${mockCommandNamespace}/foo/1.2.5`
            };
            deleteOptions = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    scope: ['user']
                },
                url: `/commands/${mockCommandNamespace}/foo/1.2.5`
            };
        });

        it('returns 200 if not found', () => server.inject(getOptions).then((getResponse) => {
            assert.equal(getResponse.statusCode, 404);

            return server.inject(deleteOptions).then((deleteResponse) => {
                assert.equal(deleteResponse.statusCode, 204);
            });
        }));

        it('deletes an artifact', () => server.inject(postOptions).then((postResponse) => {
            assert.equal(postResponse.statusCode, 202);

            return server.inject(getOptions).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);

                return server.inject(deleteOptions).then((deleteResponse) => {
                    assert.equal(deleteResponse.statusCode, 204);

                    return server.inject(getOptions).then((getResponse2) => {
                        assert.equal(getResponse2.statusCode, 404);
                    });
                });
            });
        }));
    });
});
