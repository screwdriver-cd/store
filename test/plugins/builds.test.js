'use strict';

const fs = require('fs');
const path = require('path');
const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');
const { Engine: CatboxMemory } = require('@hapi/catbox-memory');
const Boom = require('@hapi/boom');
const mockBuildID = 1899999;

sinon.assert.expose(assert, { prefix: '' });

describe('builds plugin test', () => {
    let plugin;
    let server;
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
        mockery.registerMock('config', configMock);
        // eslint-disable-next-line global-require
        plugin = require('../../plugins/builds');

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

        return server.register({ plugin }).then(() => server.start());
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
        it('returns 200 if unzip_worker scope token is used', async () => {
            const id = `${mockBuildID}-foo`;
            const content = 'HELLO WORLD';
            const cache = server.cache({
                segment: 'builds',
                expiresIn: 100,
                shared: true
            });

            await cache.set(id, content);

            return server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            username: mockBuildID,
                            scope: ['unzip_worker']
                        }
                    },
                    url: `/builds/${mockBuildID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 200);
                });
        });

        it('returns 404 if not found', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            username: mockBuildID,
                            scope: ['user']
                        }
                    },
                    url: `/builds/${mockBuildID}/foo`
                })
                .then(response => {
                    assert.equal(response.statusCode, 404);
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

                return badServer.register({ plugin });
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
                                username: mockBuildID,
                                scope: ['user']
                            }
                        },
                        url: `/builds/${mockBuildID}/foo`
                    })
                    .then(response => {
                        assert.equal(response.statusCode, 500);
                    }));
        });

        it('type=preview ending with html', async () => {
            const id = `${mockBuildID}-foo.html`;
            const content = '<html><head></head><body>HELLO WORLD</body></html>';
            const htmlContent = fs.readFileSync(path.join(__dirname, './data/helloworld.html'), 'utf8');
            const cache = server.cache({
                segment: 'builds',
                expiresIn: 100,
                shared: true
            });

            await cache.set(id, content);

            const getResponse = await server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                },
                url: `/builds/${mockBuildID}/foo.html?type=preview`
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['content-type'], 'text/html; charset=utf-8');
            assert.isNotOk(getResponse.headers['x-foo']);
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, htmlContent);
            assert.isOk(getResponse.result.includes(content));
        });

        it('type=preview not ending with html', async () => {
            const id = `${mockBuildID}-foo`;
            const content = 'HELLO WORLD';
            const cache = server.cache({
                segment: 'builds',
                expiresIn: 100,
                shared: true
            });

            await cache.set(id, content);

            const getResponse = await server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                },
                url: `/builds/${mockBuildID}/foo?type=preview`
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['content-type'], 'application/octet-stream');
            assert.isNotOk(getResponse.headers['x-foo']);
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, content);
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['build']
                    }
                }
            };
        });

        it('returns 202 if unzip_worker scope token is used', async () => {
            options.url = `/builds/${mockBuildID}/foo`;
            options.auth.credentials.scope = ['unzip_worker'];

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 202);
            });
        });

        it('returns 403 if wrong creds', () => {
            options.url = '/builds/122222/foo';

            return server.inject(options).then(response => {
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

            return server.inject(options).then(response => {
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['x-foo'], 'bar');
            assert.equal(getResponse.headers['content-type'], 'application/octet-stream');
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, 'THIS IS A TEST');

            const downloadResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo?type=download`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(downloadResponse.statusCode, 200);
            assert.equal(downloadResponse.headers['content-disposition'], 'attachment; filename="foo"');
        });

        it('saves an artifact of Japanese filename', async () => {
            options.url = `/builds/${mockBuildID}/日本語.txt`;

            options.headers['content-type'] = 'text/plain; charset=utf-8';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            const getResponse = await server.inject({
                url: `/builds/${mockBuildID}/日本語.txt`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['x-foo'], 'bar');
            assert.equal(getResponse.headers['content-type'], 'text/plain; charset=utf-8');
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, 'THIS IS A TEST');

            const downloadResponse = await server.inject({
                url: `/builds/${mockBuildID}/日本語.txt?type=download`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(downloadResponse.statusCode, 200);
            assert.equal(
                downloadResponse.headers['content-disposition'],
                'attachment; filename="%E6%97%A5%E6%9C%AC%E8%AA%9E.txt"'
            );
        });

        it('saves an artifact without headers for text/plain type', async () => {
            options.url = `/builds/${mockBuildID}/foo`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            const getResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(getResponse.statusCode, 200);
            assert.equal(getResponse.headers['content-type'], 'application/octet-stream');
            assert.isNotOk(getResponse.headers['x-foo']);
            assert.isNotOk(getResponse.headers.ignore);
            assert.equal(getResponse.result, 'THIS IS A TEST');
        });

        it('saves an html artifact without headers for text/html type', async () => {
            options.url = `/builds/${mockBuildID}/foo.html`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            const downloadResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo.html?type=download`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(downloadResponse.statusCode, 200);
            assert.equal(downloadResponse.headers['content-type'], 'application/octet-stream');
            assert.isNotOk(downloadResponse.headers['x-foo']);
            assert.isNotOk(downloadResponse.headers.ignore);
            assert.equal(downloadResponse.result, 'THIS IS A TEST');

            const previewResponse = await server.inject({
                url: `/builds/${mockBuildID}/foo.html?type=preview`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['user']
                    }
                }
            });

            assert.equal(previewResponse.statusCode, 200);
            assert.equal(previewResponse.headers['content-type'], 'text/html; charset=utf-8');
            assert.isNotOk(previewResponse.headers['x-foo']);
            assert.isNotOk(previewResponse.headers.ignore);
            assert.isOk(previewResponse.result.includes('THIS IS A TEST'));
        });

        it('saves an artifact and fetches it with pipeline scoped jwt', async () => {
            options.url = `/builds/${mockBuildID}/foo`;

            options.headers['content-type'] = 'application/x-ndjson';
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/builds/${mockBuildID}/foo`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            username: mockBuildID,
                            scope: ['pipeline']
                        }
                    }
                })
                .then(getResponse => {
                    assert.equal(getResponse.statusCode, 200);
                    assert.equal(getResponse.result, 'THIS IS A TEST');
                });
        });
    });

    describe('DELETE /builds/:id/:artifact', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['unzip_worker']
                    }
                }
            };
        });

        it('delete an artifact zip', async () => {
            options.url = `/builds/${mockBuildID}/SD_ARTIFACT.zip`;

            const id = `${mockBuildID}-SD_ARTIFACT.zip`;
            const content = '';
            const cache = server.cache({
                segment: 'builds',
                expiresIn: 100,
                shared: true
            });

            await cache.set(id, content);

            const deleteResponse = await server.inject(options);

            assert.equal(deleteResponse.statusCode, 204);
        });

        it('returns 403 if wrong creds', () => {
            options.url = `/builds/${mockBuildID}/SD_ARTIFACT.zip`;
            options.auth.credentials.scope = ['build'];

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 204 if not found zip file', () => {
            options.url = `/builds/${mockBuildID}/SD_BAD_ARTIFACT.zip`;

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 204);
            });
        });
    });
});

describe('builds plugin test using s3', () => {
    let plugin;
    let server;
    let awsClientMock;
    let reqMock;
    let configMock;
    let getDownloadStreamMock;
    let uploadAsStreamMock;
    let removeObjectMock;

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
        removeObjectMock = sinon.stub().resolves(null);

        awsClientMock = sinon.stub().returns({
            updateLastModified: sinon.stub().yields(null),
            invalidateCache: sinon.stub().yields(null),
            getDownloadStream: getDownloadStreamMock,
            uploadAsStream: uploadAsStreamMock,
            removeObject: removeObjectMock
        });

        reqMock = sinon.stub();

        reqMock.yieldsAsync({
            statusCode: 403
        });

        mockery.registerMock('../helpers/aws', awsClientMock);
        mockery.registerMock('config', configMock);
        mockery.registerMock('request', reqMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/builds');

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

        return server.register({ plugin }).then(() => server.start());
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
        it('returns 200', () =>
            server
                .inject({
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            username: mockBuildID,
                            scope: ['user']
                        }
                    },
                    url: `/builds/${mockBuildID}/foo.zip`
                })
                .then(response => {
                    assert.calledWith(getDownloadStreamMock, {
                        cacheKey: `${mockBuildID}-foo.zip`
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
                            username: mockBuildID,
                            scope: ['user']
                        }
                    },
                    url: `/builds/${mockBuildID}/foo.zip`
                })
                .then(response => {
                    assert.calledWith(getDownloadStreamMock, {
                        cacheKey: `${mockBuildID}-foo.zip`
                    });
                    assert.equal(response.statusCode, 404);
                });
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
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['build']
                    }
                },
                url: `/builds/${mockBuildID}/foo.zip`
            };
        });

        it('streams .zip artifact without headers', async () => {
            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);
            assert.calledWith(
                uploadAsStreamMock,
                sinon.match({
                    cacheKey: `${mockBuildID}-foo.zip`
                })
            );

            const downloadResponse = await server.inject({
                url: `${options.url}?type=download`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
                }
            });

            assert.equal(downloadResponse.statusCode, 200);
            assert.equal(downloadResponse.headers['content-type'], 'application/octet-stream');
            assert.isNotOk(downloadResponse.headers['x-foo']);
            assert.isNotOk(downloadResponse.headers.ignore);
        });

        it('returns 503 if streaming failed', async () => {
            uploadAsStreamMock.rejects(new Error('failed'));

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 503);
            assert.calledWith(
                uploadAsStreamMock,
                sinon.match({
                    cacheKey: `${mockBuildID}-foo.zip`
                })
            );
        });
    });

    describe('DELETE /builds/:id/:artifact', () => {
        let options;

        beforeEach(() => {
            options = {
                method: 'DELETE',
                headers: {
                    'x-foo': 'bar',
                    ignore: 'true'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        username: mockBuildID,
                        scope: ['unzip_worker']
                    }
                }
            };
        });

        it('delete an artifact zip', async () => {
            options.url = `/builds/${mockBuildID}/SD_ARTIFACT.zip`;
            const deleteResponse = await server.inject(options);

            assert.equal(deleteResponse.statusCode, 204);
        });

        it('returns 403 if wrong creds', async () => {
            options.url = `/builds/${mockBuildID}/SD_ARTIFACT.zip`;
            options.auth.credentials.scope = ['build'];

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 204 if not found zip file', async () => {
            options.url = `/builds/${mockBuildID}/SD_BAD_ARTIFACT.zip`;

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 204);
            });
        });
    });
});
