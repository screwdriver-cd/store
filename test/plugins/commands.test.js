'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');
const CatboxMemory = require('@hapi/catbox-memory');
const Boom = require('@hapi/boom');

sinon.assert.expose(assert, { prefix: '' });

describe('commands plugin test', () => {
    const mockCommandNamespace = 'foo';
    const mockCommandName = 'bar';
    const mockCommandVersion = '1.2.3';
    let plugin;
    let server;
    let configMock;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(async () => {
        configMock = {
            get: sinon.stub()
                .returns({
                    plugin: 'memory'
                })
        };
        mockery.registerMock('config', configMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/commands');

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

        await server.register({ plugin });
        await server.start();
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
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
                        engine: new CatboxMemory({
                            maxByteSize: 9999999999
                        })
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
                    auth: {
                        strategy: 'token',
                        credentials: {
                            scope: ['user']
                        }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['build'],
                        pipelineId: 123
                    }
                }
            };
        });

        it('returns 403 if wrong `cred`s', () => {
            options.url = '/commands/foo/bar/1.2.3';
            options.auth.credentials.scope = ['user'];

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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['build'],
                        pipelineId: 123
                    }
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
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
describe('commands plugin test using s3', () => {
    const mockCommandNamespace = 'foo';
    const mockCommandName = 'bar';
    const mockCommandVersion = '1.2.3';
    let plugin;
    let server;
    let awsClientMock;
    let configMock;
    let getDownloadStreamMock;
    let uploadAsStreamMock;
    let deleteObjMock;
    let getDownloadMock;
    let uploadDirectMock;
    let data;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        configMock = {
            get: sinon.stub()
                .returns({
                    plugin: 's3',
                    s3: {}
                })
        };
        getDownloadStreamMock = sinon.stub()
            .resolves(null);
        uploadAsStreamMock = sinon.stub()
            .resolves(null);
        deleteObjMock = sinon.stub()
            .resolves(null);
        getDownloadMock = sinon.stub()
            .resolves(null);
        uploadDirectMock = sinon.stub()
            .resolves(null);

        awsClientMock = sinon.stub()
            .returns({
                updateLastModified: sinon.stub()
                    .yields(null),
                deleteObject: deleteObjMock,
                getDownloadStream: getDownloadStreamMock,
                uploadCmdAsStream: uploadAsStreamMock,
                getObject: getDownloadMock,
                uploadObject: uploadDirectMock
            });

        data = {
            c: { data: 'test' }, h: { contentType: 'application/json', response: {} }
        };

        mockery.registerMock('../helpers/aws', awsClientMock);
        mockery.registerMock('config', configMock);

        // eslint-disable-next-line global-require
        plugin = require('../../plugins/commands');

        server = Hapi.server({
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
        it('returns 200 if found', () => {
            const resp = Object.create(data);

            getDownloadMock.resolves(resp);

            return server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
                },
                url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`
            })
                .then((response) => {
                    assert.calledWith(getDownloadMock, {
                        // eslint-disable-next-line max-len
                        objectKey: `${mockCommandNamespace}-${mockCommandName}-${mockCommandVersion}`
                    });
                    assert.equal(response.statusCode, 200);
                });
        });

        it('returns 404 if not found', () => {
            getDownloadMock.throws(Boom.boomify(new Error('Not found'), {
                statusCode: 404
            }));

            return server.inject({
                headers: {
                    'x-foo': 'bar'
                },
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
                },
                url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`
            })
                .then((response) => {
                    assert.calledWith(getDownloadMock, {
                        // eslint-disable-next-line max-len
                        objectKey: `${mockCommandNamespace}-${mockCommandName}-${mockCommandVersion}`
                    });
                    assert.equal(response.statusCode, 404);
                });
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
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['build'],
                        pipelineId: 123
                    }
                }
            };
        });

        it('returns 403 if wrong `cred`s', () => {
            options.url = '/commands/foo/bar/1.2.3';
            options.auth.credentials.scope = ['user'];

            return server.inject(options).then((response) => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('saves an artifact', async () => {
            const resp = Object.create(data);

            options.url = `/commands/${mockCommandNamespace}/`
                + `${mockCommandName}/${mockCommandVersion}`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            getDownloadMock.resolves(resp);

            return server.inject({
                url: `/commands/${mockCommandNamespace}/`
                    + `${mockCommandName}/${mockCommandVersion}`,
                auth: {
                    strategy: 'token',
                    credentials: {
                        scope: ['user']
                    }
                }
            }).then((getResponse) => {
                assert.equal(getResponse.statusCode, 200);
                assert.equal(getResponse.headers['content-type'], 'application/octet-stream');
                assert.isNotOk(getResponse.headers.ignore);
            });
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
                        scope: ['user']
                    }
                },
                url: `/commands/${mockCommandNamespace}/foo/1.2.5`
            };
        });

        it('Returns 200 if successfully invalidate cache', () => {
            deleteObjMock.yields(null);

            return server.inject(deleteOptions).then((deleteResponse) => {
                assert.equal(deleteResponse.statusCode, 204);
            });
        });
    });
});
