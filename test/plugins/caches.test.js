'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('hapi');
const mockery = require('mockery');
const catmemory = require('catbox-memory');

sinon.assert.expose(assert, { prefix: '' });

describe('events plugin test', () => {
    const mockEventID = 1899999;
    const mockJobID = 10000;
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
            updateLastModified: sinon.stub().yields(null)
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

    describe('Invalid scope', () => {
        it('returns 403 if scope is not valid', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    eventId: 5555,
                    scope: ['build']
                },
                url: `/caches/invalid/${mockEventID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 403);
            })
        ));
    });

    describe('GET /caches/events/:id/:cacheName', () => {
        it('returns 404 if not found', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                },
                url: `/caches/events/${mockEventID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 404);
            })
        ));

        it('returns 403 if credentials is not valid', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    eventId: 5555,
                    scope: ['build']
                },
                url: `/caches/events/${mockEventID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 403);
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
                    url: `/caches/events/${mockEventID}/foo`
                }).then((response) => {
                    assert.equal(response.statusCode, 500);
                })
            ));
        });
    });

    describe('GET /caches/jobs/:id/:cacheName', () => {
        it('returns 404 if not found', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                },
                url: `/caches/jobs/${mockJobID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 404);
            })
        ));

        it('returns 403 if credentials is not valid', () => (
            server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    jobId: 5555,
                    scope: ['build']
                },
                url: `/caches/jobs/${mockJobID}/foo`
            }).then((response) => {
                assert.equal(response.statusCode, 403);
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
                        jobId: mockJobID,
                        scope: ['build']
                    },
                    url: `/caches/jobs/${mockJobID}/foo`
                }).then((response) => {
                    assert.equal(response.statusCode, 500);
                })
            ));
        });
    });

    describe('PUT /caches/events/:id/:cacheName', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'PUT',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'application/zip',
                    ignore: 'true'
                },
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/caches/events/122222/foo';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/caches/events/${mockEventID}/foo`;
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
            options.url = `/caches/events/${mockEventID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/events/${mockEventID}/foo`,
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

        it('saves a cache without headers for application/zip type', async () => {
            options.url = `/caches/events/${mockEventID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/events/${mockEventID}/foo`,
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['content-type'], 'application/zip');
                assert.isNotOk(getResponse.headers['x-foo']);
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        it('saves a cache and fetches it with build scoped jwt', async () => {
            options.url = `/caches/events/${mockEventID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/events/${mockEventID}/foo`,
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });
    });

    describe('PUT /caches/jobs/:id/:cacheName', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'PUT',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'application/zip',
                    ignore: 'true'
                },
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/caches/jobs/122222/foo';

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/caches/jobs/${mockJobID}/foo`;
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
            options.url = `/caches/jobs/${mockJobID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/jobs/${mockJobID}/foo`,
                credentials: {
                    jobId: mockJobID,
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

        it('saves a cache without headers for application/zip type', async () => {
            options.url = `/caches/jobs/${mockJobID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/jobs/${mockJobID}/foo`,
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['content-type'], 'application/zip');
                assert.isNotOk(getResponse.headers['x-foo']);
                assert.isNotOk(getResponse.headers.ignore);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });

        it('saves a cache and fetches it with build scoped jwt', async () => {
            options.url = `/caches/jobs/${mockJobID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server.inject({
                url: `/caches/jobs/${mockJobID}/foo`,
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.result, 'THIS IS A TEST');
            });
        });
    });

    describe('DELETE /caches/events/:id/:cacheName', () => {
        let getOptions;
        let putOptions;
        let deleteOptions;

        beforeEach(() => {
            getOptions = {
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                },
                url: `/caches/events/${mockEventID}/foo`
            };
            putOptions = {
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
                },
                url: `/caches/events/${mockEventID}/foo`
            };
            deleteOptions = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    eventId: mockEventID,
                    scope: ['build']
                },
                url: `/caches/events/${mockEventID}/foo`
            };
        });

        it('returns 200 if not found', () => server.inject(getOptions).then((getResponse) => {
            assert.equal(getResponse.statusCode, 404);

            return server.inject(deleteOptions).then((deleteResponse) => {
                assert.equal(deleteResponse.statusCode, 200);
            });
        }));

        it('returns 403 if credentials is not valid', () => {
            deleteOptions.credentials.eventId = 5555;

            return server.inject(deleteOptions).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('deletes an event cache', () => server.inject(putOptions).then((postResponse) => {
            assert.equal(postResponse.statusCode, 202);

            return server.inject(getOptions).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);

                return server.inject(deleteOptions).then((deleteResponse) => {
                    assert.equal(deleteResponse.statusCode, 200);

                    return server.inject(getOptions).then((getResponse2) => {
                        assert.equal(getResponse2.statusCode, 404);
                    });
                });
            });
        }));
    });

    describe('DELETE /caches/jobs/:id/:cacheName', () => {
        let getOptions;
        let putOptions;
        let deleteOptions;

        beforeEach(() => {
            getOptions = {
                headers: {
                    'x-foo': 'bar'
                },
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                },
                url: `/caches/jobs/${mockJobID}/foo`
            };
            putOptions = {
                method: 'PUT',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                },
                url: `/caches/jobs/${mockJobID}/foo`
            };
            deleteOptions = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                credentials: {
                    jobId: mockJobID,
                    scope: ['build']
                },
                url: `/caches/jobs/${mockJobID}/foo`
            };
        });

        it('returns 200 if not found', () => server.inject(getOptions).then((getResponse) => {
            assert.equal(getResponse.statusCode, 404);

            return server.inject(deleteOptions).then((deleteResponse) => {
                assert.equal(deleteResponse.statusCode, 200);
            });
        }));

        it('returns 403 if credentials is not valid', () => {
            deleteOptions.credentials.jobId = 5555;

            return server.inject(deleteOptions).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('deletes a job cache', () => server.inject(putOptions).then((postResponse) => {
            assert.equal(postResponse.statusCode, 202);

            return server.inject(getOptions).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);

                return server.inject(deleteOptions).then((deleteResponse) => {
                    assert.equal(deleteResponse.statusCode, 200);

                    return server.inject(getOptions).then((getResponse2) => {
                        assert.equal(getResponse2.statusCode, 404);
                    });
                });
            });
        }));
    });
});
