'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');
const CatboxMemory = require('@hapi/catbox-memory');
const Boom = require('@hapi/boom');

sinon.assert.expose(assert, { prefix: '' });

describe('caches plugin test using memory', () => {
    const mockEventID = 1899999;
    const mockJobID = 10000;
    let plugin;
    let server;
    let reqMock;
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
                plugin: 'memory',
                s3: {}
            })
        };

        reqMock = sinon.stub();

        reqMock.yieldsAsync({
            statusCode: 403
        });

        mockery.registerMock('config', configMock);
        mockery.registerMock('request', reqMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/caches');

        server = Hapi.server({
            cache: {
                engine: new CatboxMemory({
                    maxByteSize: 512
                })
            },
            port: 1234
        });

        server.auth.scheme('custom', () => ({
            authenticate: (request, h) => h.authenticated()
        }));
        server.auth.strategy('token', 'custom');
        server.auth.strategy('session', 'custom');

        return server
            .register({
                plugin,
                options: {
                    expiresInSec: '100',
                    maxByteSize: '5368709120'
                }
            })
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
        it('returns 400 Bad Request if scope is not valid', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: 5555,
                            scope: ['build']
                        }
                    },
                    url: `/caches/invalid/${mockEventID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 400);
                }));
    });

    describe('GET /caches/events/:id/:cacheName', () => {
        it('returns 404 if not found', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    },
                    url: `/caches/events/${mockEventID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 404);
                }));

        it('returns 403 if credentials is not valid', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: 5555,
                            scope: ['build']
                        }
                    },
                    url: `/caches/events/${mockEventID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 403);
                }));

        describe('caching is not setup right', () => {
            let badServer;

            beforeEach(() => {
                badServer = Hapi.server({
                    cache: {
                        engine: new CatboxMemory({
                            maxByteSize: 9999999999
                        })
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
                    }
                });
            });

            afterEach(() => {
                badServer = null;
            });

            it('returns 500 if caching fails', () =>
                badServer
                    .inject({
                        headers: {
                            'x-foo': 'bar'
                        },
                        auth: {
                            strategy: 'token',
                            credentials: {
                                eventId: mockEventID,
                                scope: ['build']
                            }
                        },
                        url: `/caches/events/${mockEventID}/foo`
                    })
                    .then(response => {
                        assert.equal(response.statusCode, 500);
                    }));
        });
    });

    describe('GET /caches/jobs/:id/:cacheName', () => {
        it('returns 404 if not found', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: mockJobID,
                            scope: ['build']
                        }
                    },
                    url: `/caches/jobs/${mockJobID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 404);
                }));

        it('returns 200 if job is asking for parent cache', async () => {
            const options = {
                method: 'PUT',
                payload: 'THIS IS A TEST',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        jobId: mockJobID,
                        scope: ['build']
                    }
                }
            };

            options.url = `/caches/jobs/${mockJobID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/jobs/${mockJobID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: 5555,
                            prParentJobId: mockJobID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.result, 'THIS IS A TEST');
                });
        });

        it('returns 403 if credentials is not valid', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: 5555,
                            scope: ['build']
                        }
                    },
                    url: `/caches/jobs/${mockJobID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 403);
                }));

        describe('caching is not setup right', () => {
            let badServer;

            beforeEach(() => {
                badServer = Hapi.server({
                    cache: {
                        engine: new CatboxMemory({
                            maxByteSize: 9999999999
                        })
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
                    }
                });
            });

            afterEach(() => {
                badServer = null;
            });

            it('returns 500 if caching fails', () =>
                badServer
                    .inject({
                        headers: {
                            'x-foo': 'bar'
                        },
                        auth: {
                            strategy: 'token',
                            credentials: {
                                jobId: mockJobID,
                                scope: ['build']
                            }
                        },
                        url: `/caches/jobs/${mockJobID}/foo`
                    })
                    .then(response => {
                        assert.equal(response.statusCode, 500);
                    }));
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
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/caches/events/122222/foo';

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('saves a cache', async () => {
            options.url = `/caches/events/${mockEventID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/events/${mockEventID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.headers['x-foo'], 'bar');
                    assert.equal(getResponse.headers['content-type'], 'application/x-ndjson');
                    assert.isNotOk(getResponse.headers.ignore);
                    assert.equal(getResponse.result, 'THIS IS A TEST');
                });
        });

        it('saves a cache without headers for text/plain type', async () => {
            options.url = `/caches/events/${mockEventID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/events/${mockEventID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
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

            return server
                .inject({
                    url: `/caches/events/${mockEventID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
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
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        jobId: mockJobID,
                        scope: ['build']
                    }
                }
            };
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/caches/jobs/122222/foo';

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('saves a cache', async () => {
            options.url = `/caches/jobs/${mockJobID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/jobs/${mockJobID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: mockJobID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.headers['x-foo'], 'bar');
                    assert.equal(getResponse.headers['content-type'], 'application/x-ndjson');
                    assert.isNotOk(getResponse.headers.ignore);
                    assert.equal(getResponse.result, 'THIS IS A TEST');
                });
        });

        it('saves a cache without headers for text/plain type', async () => {
            options.url = `/caches/jobs/${mockJobID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/jobs/${mockJobID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: mockJobID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
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

            return server
                .inject({
                    url: `/caches/jobs/${mockJobID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            jobId: mockJobID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
                },
                url: `/caches/events/${mockEventID}/foo`
            };
        });

        it('returns 200 if not found', () =>
            server.inject(getOptions).then(getResponse => {
                assert.equal(getResponse.statusCode, 404);

                return server.inject(deleteOptions).then(deleteResponse => {
                    assert.equal(deleteResponse.statusCode, 204);
                });
            }));

        it('returns 403 if credentials is not valid', () => {
            deleteOptions.auth.credentials.eventId = 5555;

            return server.inject(deleteOptions).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('deletes an event cache', () =>
            server.inject(putOptions).then(postResponse => {
                assert.equal(postResponse.statusCode, 202);

                return server.inject(getOptions).then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);

                    return server.inject(deleteOptions).then(deleteResponse => {
                        assert.equal(deleteResponse.statusCode, 204);

                        return server.inject(getOptions).then(getResponse2 => {
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        jobId: mockJobID,
                        scope: ['build']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        jobId: mockJobID,
                        scope: ['build']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        jobId: mockJobID,
                        scope: ['build']
                    }
                },
                url: `/caches/jobs/${mockJobID}/foo`
            };
        });

        it('returns 200 if not found', () =>
            server.inject(getOptions).then(getResponse => {
                assert.equal(getResponse.statusCode, 404);

                return server.inject(deleteOptions).then(deleteResponse => {
                    assert.equal(deleteResponse.statusCode, 204);
                });
            }));

        it('returns 403 if credentials is not valid', () => {
            deleteOptions.auth.credentials.jobId = 5555;

            return server.inject(deleteOptions).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('deletes a job cache', () =>
            server.inject(putOptions).then(postResponse => {
                assert.equal(postResponse.statusCode, 202);

                return server.inject(getOptions).then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);

                    return server.inject(deleteOptions).then(deleteResponse => {
                        assert.equal(deleteResponse.statusCode, 204);

                        return server.inject(getOptions).then(getResponse2 => {
                            assert.equal(getResponse2.statusCode, 404);
                        });
                    });
                });
            }));
    });

    describe('DELETE /caches/:scope/:id', () => {
        let deleteOptions;

        beforeEach(() => {
            deleteOptions = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: 'testuser',
                        scope: ['sdapi']
                    }
                },
                url: `/caches/jobs/${mockJobID}`
            };
        });

        it('Returns 204 if successfully invalidate cache', () => {
            reqMock.yieldsAsync(null, {
                statusCode: 200,
                body: true
            });

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 204);
            });
        });

        it('Returns 403 if auth scope is different', () => {
            reqMock.yieldsAsync(null, {
                statusCode: 200,
                body: true
            });

            deleteOptions.auth.credentials = {
                username: 'testuser',
                scope: ['user']
            };

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 403);
            });
        });
    });
});

describe('caches plugin test using s3', () => {
    const mockEventID = 1899999;
    const mockJobID = 10000;
    let plugin;
    let server;
    let awsClientMock;
    let configMock;
    let getDownloadStreamMock;
    let uploadAsStreamMock;
    let invalidateCacheMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        configMock = {
            get: sinon.stub().returns({
                plugin: 's3',
                s3: {}
            })
        };

        getDownloadStreamMock = sinon.stub().resolves({ s3Stream: {}, s3Headers: {} });
        uploadAsStreamMock = sinon.stub().resolves(null);
        invalidateCacheMock = sinon.stub().yields(null);

        awsClientMock = sinon.stub().returns({
            updateLastModified: sinon.stub().yields(null),
            invalidateCache: invalidateCacheMock,
            getDownloadStream: getDownloadStreamMock,
            uploadAsStream: uploadAsStreamMock
        });

        mockery.registerMock('../helpers/aws', awsClientMock);
        mockery.registerMock('config', configMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/caches');

        server = Hapi.server({
            cache: {
                engine: new CatboxMemory({
                    maxByteSize: 512
                })
            },
            port: 1234
        });

        server.auth.scheme('custom', () => ({
            authenticate: (request, h) => h.authenticated()
        }));
        server.auth.strategy('token', 'custom');
        server.auth.strategy('session', 'custom');

        return server
            .register({
                plugin,
                options: {
                    expiresInSec: '100',
                    maxByteSize: '5368709120'
                }
            })
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

    describe('GET /caches/events/:id/:cacheName', () => {
        it('returns 200', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    },
                    url: `/caches/events/${mockEventID}/foo.zip`
                })
                .then(response => {
                    assert.calledWith(getDownloadStreamMock, {
                        cacheKey: `events/${mockEventID}/foo.zip`
                    });
                    assert.equal(response.statusCode, 200);
                }));

        it('returns 404 if not found', () => {
            getDownloadStreamMock.rejects(
                Boom.boomify(new Error('Not found'), {
                    statusCode: 404
                })
            );

            return server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    },
                    url: `/caches/events/${mockEventID}/foo.zip`
                })
                .then(response => {
                    assert.calledWith(getDownloadStreamMock, {
                        cacheKey: `events/${mockEventID}/foo.zip`
                    });
                    assert.equal(response.statusCode, 404);
                });
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
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        eventId: mockEventID,
                        scope: ['build']
                    }
                }
            };
        });

        it('streams .zip cache without headers', async () => {
            options.url = `/caches/events/${mockEventID}/foo.zip`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/caches/events/${mockEventID}/foo.zip`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            eventId: mockEventID,
                            scope: ['build']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.headers['content-type'], 'application/octet-stream');
                    assert.isNotOk(getResponse.headers['x-foo']);
                    assert.isNotOk(getResponse.headers.ignore);
                });
        });

        it('returns 503 if streaming failed', async () => {
            uploadAsStreamMock.rejects(new Error('failed'));

            options.url = `/caches/events/${mockEventID}/foo.zip`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 503);
        });
    });

    describe('DELETE /caches/:scope/:id', () => {
        let deleteOptions;

        beforeEach(() => {
            deleteOptions = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    'content-type': 'text/plain',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: 'testuser',
                        scope: ['sdapi']
                    }
                },
                url: `/caches/jobs/${mockJobID}`
            };
        });

        it('Returns 200 if successfully invalidate cache', () => {
            invalidateCacheMock.yields(null);

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 204);
            });
        });

        it('Returns 400 if scope is invalid', () => {
            deleteOptions.url = `/caches/builds/${mockJobID}`;

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 400);
            });
        });

        it('Returns 500 if user cannot invalidate cache', () => {
            const err = new Error('bad');

            invalidateCacheMock.yields(err, {});

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 500);
            });
        });

        it('Returns 403 if auth scope is different', () => {
            deleteOptions.auth.credentials = {
                username: 'testuser',
                scope: ['user']
            };

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 403);
            });
        });
    });
});
