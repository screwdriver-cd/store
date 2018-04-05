'use strict';

const { assert } = require('chai');
const engine = require('catbox-memory');

describe('server case', function () {
    // Time not important. Only life important.
    this.timeout(5000);

    const ecosystem = {
        ui: 'http://example.com'
    };

    let hapiEngine;

    beforeEach(() => {
        // eslint-disable-next-line global-require
        hapiEngine = require('../../lib/server');
    });

    afterEach(() => {
        hapiEngine = null;
    });

    describe('positive cases', () => {
        it('does it with a different port', async () => {
            let server;

            try {
                server = await hapiEngine({
                    httpd: {
                        port: 12347
                    },
                    cache: { engine },
                    auth: {
                        jwtPublicKey: '12345'
                    },
                    commands: {},
                    ecosystem
                });
            } catch (err) {
                // Error should not be thrown

                assert.fail(err);
            }

            return server.inject({
                method: 'GET',
                url: '/v1/status',
                headers: {
                    origin: ecosystem.ui
                }
            }).then((response) => {
                assert.equal(response.headers['access-control-allow-origin'], ecosystem.ui);
                assert.equal(response.statusCode, 200);
                assert.include(response.request.info.host, '12347');
            });
        });
    });

    describe('negative cases', () => {
        it('fails during registration when no auth is provided', () => hapiEngine({
            httpd: {
                port: 12347
            },
            cache: { engine },
            commands: {},
            ecosystem
        })
            .then(() => {
                // Error should be thrown; code should not reach here

                assert.fail('No error thrown');
            })
            .catch((error) => {
                assert.isOk(error);
            }));
    });
});
