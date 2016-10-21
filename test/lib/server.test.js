'use strict';

const Assert = require('chai').assert;
const mockery = require('mockery');
const engine = require('catbox-memory');

describe('server case', () => {
    let hapiEngine;

    before(() => {
        mockery.enable({
            warnOnUnregistered: false,
            useCleanCache: true
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
        hapiEngine = null;
    });

    after(() => {
        mockery.disable();
    });

    describe('positive cases', () => {
        let server;

        beforeEach((done) => {
            /* eslint-disable global-require */
            hapiEngine = require('../../lib/server');
            /* eslint-enable global-require */

            hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: { engine },
                auth: {
                    jwtPublicKey: '12345'
                }
            }, (e, s) => {
                server = s;

                done(e);
            });
        });

        it('does it with a different port', () =>
            server.inject({
                method: 'GET',
                url: '/blah'
            }).then((response) => {
                Assert.equal(response.statusCode, 404);
                Assert.include(response.request.info.host, '12347');
            })
        );
    });

    describe('negative cases', () => {
        it('fails during registration', () => {
            /* eslint-disable global-require */
            hapiEngine = require('../../lib/server');
            /* eslint-enable global-require */

            return hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: { engine }
            }, (error) => {
                Assert.isOk(error);
            });
        });
    });
});
