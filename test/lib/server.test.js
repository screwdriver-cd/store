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

        before(() => {
            console.log('Top of before.');

            return new Promise((resolve, reject) => {
                /* eslint-disable global-require */
                hapiEngine = require('../../lib/server');
                /* eslint-enable global-require */

                console.log('Setting up...');

                return hapiEngine({
                    httpd: {
                        port: 12347
                    },
                    cache: { engine },
                    auth: {
                        jwtPublicKey: '12345'
                    }
                }, (e, s) => {
                    console.log('... resolving...');

                    if (e) {
                        console.log('... rejecting!');
                        console.log(e);

                        return reject(e);
                    }

                    console.log('saving server data');
                    server = s;

                    console.log('... returning');

                    return resolve(server);
                });
            });
        });

        it('does it with a different port', (done) => {
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
