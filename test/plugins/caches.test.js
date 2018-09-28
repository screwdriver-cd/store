'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe('events plugin test', () => {
    const mockEventID = 1899999;
    let plugin;
    let server;
    let awsClientMock;
    let configMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        configMock = {
            get: sinon.stub().returns({
                plugin: 's3'
            })
        };

        awsClientMock = sinon.stub().returns({
            updateLastModified: sinon.stub().yields(null),
            compareChecksum: sinon.stub().yields(null, false)
        });

        mockery.registerMock('../helpers/aws', awsClientMock);
        mockery.registerMock('config', configMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/caches');

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

        return server.register({
            plugin,
            options: {
                expiresInSec: '100',
                maxByteSize: '5368709120'
            } })
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
        assert.isOk(server.registrations.caches);
    });

    describe('GET /events/:id/:cacheName', () => {
        it('returns 404 if not found', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                },
                url: `/events/${mockEventID}/foo`
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

                return badServer.register({
                    plugin,
                    options: {
                        expiresInSec: '100',
                        maxByteSize: '512'
                    } });
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
                        eventId: mockEventID,
                        scope: ['build']
                    },
                    url: `/events/${mockEventID}/foo`
                }).then((response) => {
                    assert.equal(response.statusCode, 500);
                })
            ));
        });
    });

    describe('PUT /events/:id/:cacheName', () => {
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
                    eventId: mockEventID,
                    scope: ['build']
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/events/122222/foo';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/events/${mockEventID}/foo`;
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

        it('saves a cache', async () => {
            options.url = `/events/${mockEventID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/events/${mockEventID}/foo`,
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['x-foo'], 'bar');
                assert.equal(getResponse.headers['content-type'], 'application/x-ndjson');
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        it('saves a cache without headers for text/plain type', async () => {
            options.url = `/events/${mockEventID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/events/${mockEventID}/foo`,
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
                assert.isNotOk(getResponse.headers['x-foo']);
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        it('saves a cache and fetches it with build scoped jwt', async () => {
            options.url = `/events/${mockEventID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/events/${mockEventID}/foo`,
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        describe('local file and remote file are the same', () => {
            let cacheConfigMock;
            let cacheAwsClientMock;
            let cachePlugin;
            let cacheServer;

            beforeEach(() => {
                mockery.deregisterAll();
                mockery.resetCache();

                cacheConfigMock = {
                    get: sinon.stub().returns({
                        plugin: 's3'
                    })
                };

                cacheAwsClientMock = sinon.stub().returns({
                    updateLastModified: sinon.stub().yields(null),
                    compareChecksum: sinon.stub().yields(null, true)
                });

                mockery.registerMock('../helpers/aws', cacheAwsClientMock);
                mockery.registerMock('config', cacheConfigMock);

                // eslint-disable-next-line global-require
                cachePlugin = require('../../plugins/caches');

                cacheServer = Hapi.server({
                    cache: {
                        engine: catmemory,
                        maxByteSize: 512,
                        allowMixedContent: true
                    },
                    port: 1235
                });

                cacheServer.auth.scheme('custom', () => ({
                    authenticate: (request, h) => h.authenticated()
                }));
                cacheServer.auth.strategy('token', 'custom');
                cacheServer.auth.strategy('session', 'custom');

                return cacheServer.register({
                    plugin: cachePlugin,
                    options: {
                        expiresInSec: '100',
                        maxByteSize: '5368709120'
                    } })
                    .then(() => cacheServer.start());
            });

            afterEach(() => {
                cacheServer = null;
                mockery.deregisterAll();
                mockery.resetCache();
            });

            it('does not save cache if checksums are equal', async () => {
                options.url = `/events/${mockEventID}/foo`;

                options.headers['content-type'] = 'application/x-ndjson';
                const putResponse = await cacheServer.inject(options);

                assert.equal(putResponse.statusCode, 202);

                return cacheServer.inject({
                    url: `/events/${mockEventID}/foo`,
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
                }).then((getResponse) => {
                    assert.equal(getResponse.statusCode, 404);
                });
            });
        });
    });
});
