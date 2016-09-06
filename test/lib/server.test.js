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

    beforeEach(() => {
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
        let error;
        let server;

        before((done) => {
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
                error = e;
                server = s;
                done();
            });
        });

        it('does it with a different port', (done) => {
            Assert.notOk(error);
            server.inject({
                method: 'GET',
                url: '/blah'
            }, (response) => {
                Assert.equal(response.statusCode, 404);
                Assert.include(response.request.info.host, '12347');
                done();
            });
        });
    });

    describe('negative cases', () => {
        it('fails during registration', (done) => {
            /* eslint-disable global-require */
            hapiEngine = require('../../lib/server');
            /* eslint-enable global-require */

            hapiEngine({
                httpd: {
                    port: 12347
                },
                cache: { engine }
            }, (error) => {
                Assert.isOk(error);
                done();
            });
        });
    });
});
