'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe('builds plugin test', () => {
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
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 503);
            });
        });

        it('saves an artifact', async () => {
            options.url = `/builds/${mockBuildID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            const getResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo`,
                credentials: {
                    username: mockBuildID,
                    scope: ['user']
                }
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['x-foo'], 'bar');
            assert.equal(getResponse.headers['content-type'], 'application/x-ndjson');
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, 'THIS IS A TEST');

            const downloadResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo?download=true`,
                credentials: {
                    username: mockBuildID,
                    scope: ['user']
                }
            });

            assert.equal(downloadResponse.statusCode, 200);
            assert.equal(
                downloadResponse.headers['content-disposition'], 'attachment; filename="foo"'
            );
        });

        it('saves an artifact without headers for text/plain type', async () => {
            options.url = `/builds/${mockBuildID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/builds/${mockBuildID}/foo`,
                credentials: {
                    username: mockBuildID,
                    scope: ['user']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
                assert.isNotOk(getResponse.headers['x-foo']);
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        it('saves an artifact and fetches it with pipeline scoped jwt', async () => {
            options.url = `/builds/${mockBuildID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/builds/${mockBuildID}/foo`,
                credentials: {
                    username: mockBuildID,
                    scope: ['pipeline']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });
    });
});
