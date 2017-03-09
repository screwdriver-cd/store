'use strict';

const Assert = require('chai').assert;
const engine = require('catbox-memory');

describe('server case', function () {
    // Time not important. Only life important.
    this.timeout(5000);

    const ecosystem = {
        ui: 'http://example.com'
    };

    let hapiEngine;

    beforeEach(() => {
        /* eslint-disable global-require */
        hapiEngine = require('../../lib/server');
        /* eslint-enable global-require */
    });

    afterEach(() => {
        hapiEngine = null;
    });

    describe('positive cases', () => {
        it('does it with a different port', (done) => {
            hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: { engine },
                auth: {
                    jwtPublicKey: '12345'
                },
                ecosystem
            }, (e, s) => {
                const server = s;

                if (e) {
                    return done(e);
                }

                return server.inject({
                    method: 'GET',
                    url: '/v1/status',
                    headers: {
                        origin: ecosystem.ui
                    }
                }, (response) => {
                    Assert.equal(response.headers['access-control-allow-origin'], ecosystem.ui);
                    Assert.equal(response.statusCode, 200);
                    Assert.include(response.request.info.host, '12347');
                    done();
                });
            });
        });
    });

    describe('negative cases', () => {
        it('fails during registration', (done) => {
            hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: { engine },
                ecosystem
            }, (error) => {
                Assert.isOk(error);
                done();
            });
        });
    });
});
