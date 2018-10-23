'use strict';

const joi = require('joi');
const boom = require('boom');
const config = require('config');
const AwsClient = require('../helpers/aws');

const SCHEMA_SCOPE_NAME = joi.string().valid(['events', 'jobs', 'pipelines']).label('Scope Name');
const SCHEMA_SCOPE_ID = joi.number().integer().positive().label('Event/Job/Pipeline ID');
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
            path: '/caches/{scope}/{id}/{cacheName}',
            handler: async (request, h) => {
                const cacheName;
                const cacheKey;

                switch (request.params.scope) {
                    case 'events':
                        const { eventId } = request.auth.credentials;
                        const eventIdParam = request.params.id;

                        if (eventIdParam !== eventId) {
                            return boom.forbidden(`Credential only valid for ${eventId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `events/${eventIdParam}/${cacheName}`;
                    case 'jobs':
                        const { jobId } = request.auth.credentials;
                        const jobIdParam = request.params.id;

                        if (jobIdParam !== jobId) {
                            return boom.forbidden(`Credential only valid for ${jobId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                    case 'pipelines':
                        const { pipelineId } = request.auth.credentials;
                        const pipelineIdParam = request.params.id;

                        if (pipelineIdParam !== pipelineId) {
                            return boom.forbidden(`Credential only valid for ${pipelineId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                    default:
                        return boom.forbidden(`Invalid scope`);
                }

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
                    response.headers['content-type'] = 'application/zip';
                }

                if (strategyConfig.plugin !== 's3') {
                    return response;
                }

                try {
                    // Update last modified timestamp to reset the lifecycle
                    await awsClient.updateLastModified(`caches/${cacheKey}`, (e) => {
                        if (e) {
                            console.log('Failed to update last modified timestamp: ', e);
                        }
                    });
                } catch (err) {
                    request.log([cacheName, 'error'], `Failed to get from cache: ${err}`);

                    throw boom.serverUnavailable(err.message, err);
                }

                return response;
            },
            options: {
                description: 'Read event/job/pipeline cache',
                notes: 'Get a specific cached object from an event, job or pipeline',
                tags: ['api', 'events', 'jobs', 'pipelines'],
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
                        scope: SCHEMA_SCOPE_NAME,
                        id: SCHEMA_SCOPE_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }, {
            method: 'PUT',
            path: '/caches/{scope}/{id}/{cacheName}',
            handler: async (request, h) => {
                const cacheName;
                const cacheKey;
                const logId;

                switch (request.params.scope) {
                    case 'events':
                        const { eventId } = request.auth.credentials;
                        const eventIdParam = request.params.id;

                        if (eventIdParam !== eventId) {
                            return boom.forbidden(`Credential only valid for ${eventId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `events/${eventIdParam}/${cacheName}`;
                        logId = eventId;
                    case 'jobs':
                        const { jobId } = request.auth.credentials;
                        const jobIdParam = request.params.id;

                        if (jobIdParam !== jobId) {
                            return boom.forbidden(`Credential only valid for ${jobId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                        logId = jobId;
                    case 'pipelines':
                        const { pipelineId } = request.auth.credentials;
                        const pipelineIdParam = request.params.id;

                        if (pipelineIdParam !== pipelineId) {
                            return boom.forbidden(`Credential only valid for ${pipelineId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                        logId = pipelineId;
                    default:
                        return boom.forbidden(`Invalid scope`);
                }

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

                // For application/zip, upload it as Buffer
                // Otherwise, catbox-s3 will try to JSON.stringify (https://github.com/fhemberger/catbox-s3/blob/master/lib/index.js#L236)
                // and might create issue on large payload
                if (contents.h['content-type'] === 'application/zip') {
                    value = contents.c;
                }

                request.log(logId, `Saving ${cacheName} of size ${size} bytes with `
                    + `headers ${JSON.stringify(contents.h)}`);

                try {
                    await cache.set(cacheKey, value, 0);
                } catch (err) {
                    request.log([cacheName, 'error'], `Failed to store in cache: ${err}`);

                    throw boom.serverUnavailable(err.message, err);
                }

                return h.response().code(202);
            },
            options: {
                description: 'Write event/job/pipeline cache',
                notes: 'Write a cache object from a specific event, job or pipeline',
                tags: ['api', 'events', 'jobs', 'pipelines'],
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
                        scope: SCHEMA_SCOPE_NAME,
                        id: SCHEMA_SCOPE_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }, {
            method: 'DELETE',
            path: '/caches/{scope}/{id}/{cacheName}',
            handler: async (request, h) => {
                const cacheName;
                const cacheKey;

                switch (request.params.scope) {
                    case 'events':
                        const { eventId } = request.auth.credentials;
                        const eventIdParam = request.params.id;

                        if (eventIdParam !== eventId) {
                            return boom.forbidden(`Credential only valid for ${eventId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `events/${eventIdParam}/${cacheName}`;
                    case 'jobs':
                        const { jobId } = request.auth.credentials;
                        const jobIdParam = request.params.id;

                        if (jobIdParam !== jobId) {
                            return boom.forbidden(`Credential only valid for ${jobId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                    case 'pipelines':
                        const { pipelineId } = request.auth.credentials;
                        const pipelineIdParam = request.params.id;

                        if (pipelineIdParam !== pipelineId) {
                            return boom.forbidden(`Credential only valid for ${pipelineId}`);
                        }

                        cacheName = request.params.cacheName;
                        cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                    default:
                        return boom.forbidden(`Invalid scope`);
                }

                try {
                    await cache.drop(cacheKey);

                    return h.response();
                } catch (err) {
                    throw err;
                }
            },
            options: {
                description: 'Delete event/job/pipeline cache',
                notes: 'Delete a specific cached object from an event, job or pipeline',
                tags: ['api', 'events', 'jobs', 'pipelines'],
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
                        scope: SCHEMA_SCOPE_NAME,
                        id: SCHEMA_SCOPE_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }]);
    }
};
