'use strict';

const { assert } = require('chai');
const { Engine: Catbox } = require('@hapi/catbox-memory');

describe('server case', function () {
    // Time not important. Only life important.
    this.timeout(5000);

    const ecosystem = {
        ui: 'http://example.com',
        allowCors: []
    };
    const mime = {
        override: {
            'application/octet-stream': {
                compressible: false
            }
        }
    };

    let hapiEngine;
    let server;

    const startServer = () =>
        hapiEngine({
            httpd: {
                port: 12347,
                mime
            },
            cache: {
                engine: new Catbox()
            },
            auth: {
                jwtPublicKey: '12345',
                jwtMaxAge: '1h'
            },
            commands: {},
            ecosystem,
            caches: {
                expiresInSec: 100,
                maxByteSize: 1073741824
            }
        });

    beforeEach(() => {
        // eslint-disable-next-line global-require
        hapiEngine = require('../../lib/server');
    });

    afterEach(() => {
        if (server) {
            return server.stop();
        }

        return null;
    });

    describe('positive cases', () => {
        it('does it with a different port', async () => {
            try {
                server = await startServer();
            } catch (err) {
                // Error should not be thrown

                assert.fail(err);
            }

            return server
                .inject({
                    method: 'GET',
                    url: '/v1/status',
                    headers: {
                        origin: ecosystem.ui
                    }
                })
                .then(response => {
                    assert.equal(response.headers['access-control-allow-origin'], ecosystem.ui);
                    assert.equal(response.statusCode, 200);
                    assert.include(response.request.info.host, '12347');
                    assert.isFalse(server.mime.type('application/octet-stream').compressible);
                    assert.isTrue(server.mime.type('text/plain').compressible);
                });
        });

        it('compresses text/plain but not application/octet-stream', async () => {
            const payload = 'a'.repeat(64 * 1024);

            server = await startServer();
            server.route([
                {
                    method: 'GET',
                    path: '/compression-test/octet-stream',
                    handler: (request, h) => h.response(payload).type('application/octet-stream')
                },
                {
                    method: 'GET',
                    path: '/compression-test/text',
                    handler: (request, h) => h.response(payload).type('text/plain')
                }
            ]);

            const request = url =>
                server.inject({
                    method: 'GET',
                    url,
                    headers: {
                        'accept-encoding': 'gzip'
                    }
                });
            const [octetStreamResponse, textResponse] = await Promise.all([
                request('/compression-test/octet-stream'),
                request('/compression-test/text')
            ]);

            assert.notProperty(octetStreamResponse.headers, 'content-encoding');
            assert.equal(textResponse.headers['content-encoding'], 'gzip');
        });
    });

    describe('negative cases', () => {
        it('fails during registration when no auth is provided', () =>
            hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: {
                    engine: new Catbox()
                },
                commands: {},
                ecosystem
            })
                .then(() => {
                    // Error should be thrown; code should not reach here
                    assert.fail('No error thrown');
                })
                .catch(error => {
                    assert.isOk(error);
                }));
    });
});
