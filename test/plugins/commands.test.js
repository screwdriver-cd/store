'use strict';

/* global globalThis */

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');
const mockery = require('mockery');
const { Engine: CatboxMemory } = require('@hapi/catbox-memory');
const Boom = require('@hapi/boom');

sinon.assert.expose(assert, { prefix: '' });

describe('commands plugin test', () => {
    const mockCommandNamespace = 'foo';
    const mockCommandName = 'bar';
    const mockCommandVersion = '1.2.3';
    let plugin;
    let server;
    let configMock;
    let fetchStub;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(async () => {
        configMock = { get: sinon.stub() };
        configMock.get.withArgs('strategy').returns({ plugin: 'memory' });
        configMock.get.withArgs('ecosystem').returns({ api: 'https://api.test' });
        mockery.registerMock('config', configMock);

        // Default: command is unowned (no API record) so writes/deletes are allowed.
        fetchStub = sinon.stub(globalThis, 'fetch').resolves({ status: 404 });

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
        fetchStub.restore();
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
        it('returns 404 if not found', () =>
            server
                .inject({
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
                    authenticate: (request, h) => h.authenticated()
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
                                scope: ['user']
                            }
                        },
                        url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`
                    })
                    .then(response => {
                        assert.equal(response.statusCode, 500);
                    }));
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

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('returns 5xx if cache is bad', () => {
            options.url = `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`;
            // @note this pushes the payload size over the 512 byte limit
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
            options.payload += 'REEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 503);
            });
        });

        it('saves an artifact', async () => {
            options.url = `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            return server
                .inject({
                    url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`,
                    headers: {
                        'x-foo': 'bar'
                    },
                    auth: {
                        strategy: 'token',
                        credentials: {
                            scope: ['user']
                        }
                    }
                })
                .then(getResponse => {
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

        it('returns 200 if not found', () =>
            server.inject(getOptions).then(getResponse => {
                assert.equal(getResponse.statusCode, 404);

                return server.inject(deleteOptions).then(deleteResponse => {
                    assert.equal(deleteResponse.statusCode, 204);
                });
            }));

        it('deletes an artifact', () =>
            server.inject(postOptions).then(postResponse => {
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
    let fetchStub;
    let data;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        configMock = { get: sinon.stub() };
        configMock.get.withArgs('strategy').returns({ plugin: 's3', s3: {} });
        configMock.get.withArgs('ecosystem').returns({ api: 'https://api.test' });

        // Default: command is unowned (no API record) so writes/deletes are allowed.
        fetchStub = sinon.stub(globalThis, 'fetch').resolves({ status: 404 });

        getDownloadStreamMock = sinon.stub().resolves(null);
        uploadAsStreamMock = sinon.stub().resolves(null);
        deleteObjMock = sinon.stub().resolves(null);
        getDownloadMock = sinon.stub().resolves(null);

        awsClientMock = sinon.stub().returns({
            updateLastModified: sinon.stub().yields(null),
            removeObject: deleteObjMock,
            getDownloadStream: getDownloadStreamMock,
            getDownloadObject: getDownloadMock,
            uploadCommandAsStream: uploadAsStreamMock
        });

        data = {
            c: { data: 'test' },
            h: { contentType: 'application/json', response: {} }
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

        return server.register({ plugin }).then(() => server.start());
    });

    afterEach(async () => {
        await server.stop();
        server = null;
        fetchStub.restore();
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

            return server
                .inject({
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
                .then(response => {
                    assert.calledWith(getDownloadMock, {
                        // eslint-disable-next-line max-len
                        objectKey: `${mockCommandNamespace}-${mockCommandName}-${mockCommandVersion}`
                    });
                    assert.equal(response.statusCode, 200);
                });
        });

        it('returns 404 if not found', () => {
            getDownloadMock.throws(
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
                            scope: ['user']
                        }
                    },
                    url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`
                })
                .then(response => {
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

            return server.inject(options).then(response => {
                assert.equal(response.statusCode, 403);
            });
        });

        it('saves an artifact', async () => {
            const resp = Object.create(data);

            options.url = `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`;

            const putResponse = await server.inject(options);

            assert.equal(putResponse.statusCode, 202);

            getDownloadMock.resolves(resp);

            return server
                .inject({
                    url: `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`,
                    auth: {
                        strategy: 'token',
                        credentials: {
                            scope: ['user']
                        }
                    }
                })
                .then(getResponse => {
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

            return server.inject(deleteOptions).then(deleteResponse => {
                assert.equal(deleteResponse.statusCode, 204);
            });
        });
    });
});

describe('commands plugin ownership enforcement', () => {
    const mockCommandNamespace = 'foo';
    const mockCommandName = 'bar';
    const mockCommandVersion = '1.2.3';
    const apiUrl = 'https://api.test';
    const commandUrl = `/commands/${mockCommandNamespace}/${mockCommandName}/${mockCommandVersion}`;
    let plugin;
    let server;
    let configMock;
    let fetchStub;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(async () => {
        configMock = { get: sinon.stub() };
        configMock.get.withArgs('strategy').returns({ plugin: 'memory' });
        configMock.get.withArgs('ecosystem').returns({ api: apiUrl });
        mockery.registerMock('config', configMock);

        fetchStub = sinon.stub(globalThis, 'fetch');

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

        await server.register({ plugin });
        await server.start();
    });

    afterEach(async () => {
        await server.stop();
        server = null;
        fetchStub.restore();
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    const buildAuth = (pipelineId = 123) => ({
        strategy: 'token',
        credentials: {
            scope: ['build'],
            pipelineId
        }
    });

    const ownerResponse = pipelineId => ({
        status: 200,
        json: () => Promise.resolve({ pipelineId })
    });

    describe('POST', () => {
        const postOptions = () => ({
            method: 'POST',
            payload: 'THIS IS A TEST',
            headers: { 'content-type': 'text/plain', authorization: 'Bearer token' },
            auth: buildAuth(123),
            url: commandUrl
        });

        it('returns 403 when the command is owned by a different pipeline', () => {
            fetchStub.resolves(ownerResponse(999));

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 403);
                assert.calledOnce(fetchStub);
            });
        });

        it('returns 202 when the owning pipeline re-uploads', () => {
            fetchStub.resolves(ownerResponse(123));

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 202);
            });
        });

        it('returns 202 on first publish when no record exists yet', () => {
            fetchStub.resolves({ status: 404 });

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 202);
            });
        });

        it('returns 503 when the ownership lookup fails', () => {
            fetchStub.resolves({ status: 500 });

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 503);
            });
        });

        it('fails closed with 503 when ecosystem.api is not configured', () => {
            configMock.get.withArgs('ecosystem').returns({});

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 503);
                assert.notCalled(fetchStub);
            });
        });

        it('allows the owner when the API returns pipelineId as a numeric string', () => {
            fetchStub.resolves(ownerResponse('123'));

            return server.inject(postOptions()).then(response => {
                assert.equal(response.statusCode, 202);
            });
        });
    });

    describe('DELETE', () => {
        const deleteOptions = auth => ({
            method: 'DELETE',
            headers: { authorization: 'Bearer token' },
            auth,
            url: commandUrl
        });

        it("returns 403 when a build deletes another pipeline's command", () => {
            fetchStub.resolves(ownerResponse(999));

            return server.inject(deleteOptions(buildAuth(123))).then(response => {
                assert.equal(response.statusCode, 403);
                assert.calledOnce(fetchStub);
            });
        });

        it('returns 204 when the owning pipeline deletes its command', () => {
            fetchStub.resolves(ownerResponse(123));

            return server.inject(deleteOptions(buildAuth(123))).then(response => {
                assert.equal(response.statusCode, 204);
            });
        });

        it('skips the ownership lookup for user-scope deletes', () => {
            return server
                .inject(deleteOptions({ strategy: 'token', credentials: { scope: ['user'] } }))
                .then(response => {
                    assert.equal(response.statusCode, 204);
                    assert.notCalled(fetchStub);
                });
        });
    });
});
