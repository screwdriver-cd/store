'use strict';

const joi = require('joi');
const boom = require('boom');
const config = require('config');
const AwsClient = require('../helpers/aws');

const SCHEMA_EVENT_ID = joi.number().integer().positive().label('Event ID');
const SCHEMA_CACHE_NAME = joi.string().label('Cache Name');

exports.plugin = {
    name: 'caches',

    /**
     * Cache Plugin
     * @method  register
     * @param  {Hapi}     server                Hapi Server
     * @param  {Object}   options               Configuration
     * @param  {Integer}  options.expiresInSec  How long to keep it around
     * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
     */
    register(server, options) {
        const cache = server.cache({
            segment: 'caches',
            expiresIn: parseInt(options.expiresInSec, 10)
        });

        const strategyConfig = config.get('strategy');
        let awsClient;

        if (strategyConfig.plugin === 's3') {
            awsClient = new AwsClient(strategyConfig.s3);
        }

        server.expose('stats', cache.stats);
        server.route([{
            method: 'GET',
            path: '/caches/events/{id}/{cacheName}',
            handler: async (request, h) => {
                const { eventId } = request.auth.credentials;
                const eventIdParam = request.params.id;

                if (eventIdParam !== eventId) {
                    return boom.forbidden(`Credential only valid for ${eventId}`);
                }

                const cacheName = request.params.cacheName;
                const cacheKey = `events/${eventIdParam}/${cacheName}`;
                let value;

                try {
                    value = await cache.get(cacheKey);
                } catch (err) {
                    throw err;
                }

                if (!value) {
                    throw boom.notFound();
                }

                let response;

                if (value.c) {
                    response = h.response(Buffer.from(value.c.data));
                    response.headers = value.h;
                } else {
                    response = h.response(Buffer.from(value));
                    response.headers['content-type'] = 'text/plain';
                }

                if (strategyConfig.plugin !== 's3') {
                    return response;
                }

                // Update last modified timestamp to reset the lifecycle
                return awsClient.updateLastModified(cacheKey, (e) => {
                    if (e) {
                        console.log('Failed to update last modified timestamp: ', e);
                    }

                    return response;
                });
            },
            options: {
                description: 'Read event cache',
                notes: 'Get a specific cached object from an event',
                tags: ['api', 'events'],
                auth: {
                    strategies: ['token'],
                    scope: ['build']
                },
                plugins: {
                    'hapi-swagger': {
                        security: [{ token: [] }]
                    }
                },
                validate: {
                    params: {
                        id: SCHEMA_EVENT_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }, {
            method: 'PUT',
            path: '/caches/events/{id}/{cacheName}',
            handler: async (request, h) => {
                const { eventId } = request.auth.credentials;
                const eventIdParam = request.params.id;

                if (eventIdParam !== eventId) {
                    return boom.forbidden(`Credential only valid for ${eventId}`);
                }

                const cacheName = request.params.cacheName;
                const cacheKey = `events/${eventIdParam}/${cacheName}`;
                const contents = {
                    c: request.payload,
                    h: {}
                };
                const size = Buffer.byteLength(request.payload);
                let value = contents;

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                // For text/plain payload, upload it as Buffer
                if (contents.h['content-type'] === 'text/plain') {
                    value = contents.c;
                }

                request.log(eventId, `Saving ${cacheName} of size ${size} bytes with `
                    + `headers ${JSON.stringify(contents.h)}`);

                try {
                    if (!awsClient) {
                        await cache.set(cacheKey, value, 0);
                    } else {
                        await awsClient.compareChecksum(value, cacheKey, async (err, areEqual) => {
                            if (err) {
                                console.log('Failed to compare checksums: ', err);
                            }

                            if (!areEqual) {
                                await cache.set(cacheKey, value, 0);
                            } else {
                                console.log('Cache has not changed, not setting cache.');
                            }
                        });
                    }
                } catch (err) {
                    request.log([cacheName, 'error'], `Failed to store in cache: ${err}`);

                    throw boom.serverUnavailable(err.message, err);
                }

                return h.response().code(202);
            },
            options: {
                description: 'Write event cache',
                notes: 'Write a cache object from a specific event',
                tags: ['api', 'events'],
                payload: {
                    maxBytes: parseInt(options.maxByteSize, 10),
                    parse: false
                },
                auth: {
                    strategies: ['token'],
                    scope: ['build']
                },
                plugins: {
                    'hapi-swagger': {
                        security: [{ token: [] }]
                    }
                },
                validate: {
                    params: {
                        id: SCHEMA_EVENT_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }, {
            method: 'DELETE',
            path: '/caches/events/{id}/{cacheName}',
            handler: async (request, h) => {
                const { eventId } = request.auth.credentials;
                const eventIdParam = request.params.id;

                if (eventIdParam !== eventId) {
                    return boom.forbidden(`Credential only valid for ${eventId}`);
                }

                const cacheName = request.params.cacheName;
                const cacheKey = `events/${eventIdParam}/${cacheName}`;

                try {
                    await cache.drop(cacheKey);

                    return h.response();
                } catch (err) {
                    throw err;
                }
            },
            options: {
                description: 'Delete event cache',
                notes: 'Delete a specific cached object from an event',
                tags: ['api', 'events'],
                auth: {
                    strategies: ['token'],
                    scope: ['build']
                },
                plugins: {
                    'hapi-swagger': {
                        security: [{ token: [] }]
                    }
                },
                validate: {
                    params: {
                        id: SCHEMA_EVENT_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }]);
    }
};
