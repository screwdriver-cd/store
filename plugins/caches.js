'use strict';

const joi = require('joi');
const boom = require('boom');
const config = require('config');
const AwsClient = require('../helpers/aws');
const req = require('request');

const SCHEMA_SCOPE_NAME = joi.string().valid(['events', 'jobs', 'pipelines']).label('Scope Name');
const SCHEMA_SCOPE_ID = joi.number().integer().positive().label('Event/Job/Pipeline ID');
const SCHEMA_CACHE_NAME = joi.string().label('Cache Name');

/**
 * Convert stream to buffer
 * @method streamToBuffer
 * @param  {Stream}       stream
 * @return {Buffer}
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const buffers = [];

        stream.on('error', reject);
        stream.on('data', data => buffers.push(data));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

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
        const segment = 'caches';
        const cache = server.cache({
            segment,
            expiresIn: parseInt(options.expiresInSec, 10)
        });
        const strategyConfig = config.get('strategy');
        const usingS3 = strategyConfig.plugin === 's3';
        let awsClient;

        if (usingS3) {
            strategyConfig.s3.segment = segment;
            awsClient = new AwsClient(strategyConfig.s3);
        }

        server.expose('stats', cache.stats);
        server.route([{
            method: 'GET',
            path: '/caches/{scope}/{id}/{cacheName}',
            handler: async (request, h) => {
                let cacheName;
                let cacheKey;

                switch (request.params.scope) {
                case 'events': {
                    const { eventId } = request.auth.credentials;
                    const eventIdParam = request.params.id;

                    if (eventIdParam !== eventId) {
                        return boom.forbidden(`Credential only valid for ${eventId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `events/${eventIdParam}/${cacheName}`;
                    break;
                }
                case 'jobs': {
                    const { jobId, prParentJobId } = request.auth.credentials;
                    const jobIdParam = request.params.id;

                    if (jobIdParam !== jobId && jobIdParam !== prParentJobId) {
                        return boom.forbidden(`Credential is not valid for ${jobIdParam}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                    break;
                }
                case 'pipelines': {
                    const { pipelineId } = request.auth.credentials;
                    const pipelineIdParam = request.params.id;

                    if (pipelineIdParam !== pipelineId) {
                        return boom.forbidden(`Credential only valid for ${pipelineId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                    break;
                }
                default:
                    return boom.forbidden('Invalid scope');
                }

                let value;
                let response;

                // for old json files, the value is hidden in an object, we cannot stream it directly
                if (usingS3 && cacheName.endsWith('zip')) {
                    try {
                        value = await awsClient.getDownloadStream({ cacheKey });
                        response = h.response(value);
                        response.headers['content-type'] = 'application/octet-stream';
                    } catch (err) {
                        request.log([cacheName, 'error'], `Failed to stream the cache: ${err}`);
                        throw err;
                    }
                } else {
                    try {
                        value = await cache.get(cacheKey);
                    } catch (err) {
                        request.log([cacheName, 'error'], `Failed to get the cache: ${err}`);
                        throw err;
                    }

                    if (!value) {
                        throw boom.notFound();
                    }

                    if (value.c) {
                        response = h.response(Buffer.from(value.c.data));
                        response.headers = value.h;
                    } else {
                        response = h.response(Buffer.from(value));
                        response.headers['content-type'] = 'text/plain';
                    }
                }

                if (!usingS3) {
                    return response;
                }

                try {
                    // Update last modified timestamp to reset the lifecycle
                    await awsClient.updateLastModified(cacheKey, (e) => {
                        if (e) {
                            request.log([cacheName, 'error'],
                                `Failed to update last modified timestamp: ${e}`);
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
                let cacheName;
                let cacheKey;
                let logId;

                switch (request.params.scope) {
                case 'events': {
                    const { eventId } = request.auth.credentials;
                    const eventIdParam = request.params.id;

                    if (eventIdParam !== eventId) {
                        return boom.forbidden(`Credential only valid for ${eventId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `events/${eventIdParam}/${cacheName}`;
                    logId = eventId;
                    break;
                }
                case 'jobs': {
                    const { jobId } = request.auth.credentials;
                    const jobIdParam = request.params.id;

                    if (jobIdParam !== jobId) {
                        return boom.forbidden(`Credential only valid for ${jobId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                    logId = jobId;
                    break;
                }
                case 'pipelines': {
                    const { pipelineId } = request.auth.credentials;
                    const pipelineIdParam = request.params.id;

                    if (pipelineIdParam !== pipelineId) {
                        return boom.forbidden(`Credential only valid for ${pipelineId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                    logId = pipelineId;
                    break;
                }
                default:
                    return boom.forbidden('Invalid scope');
                }

                const payload = request.payload;
                const contents = {
                    c: {},
                    h: {}
                };

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                request.log(logId, `Saving ${cacheName} with `
                    + `headers ${JSON.stringify(contents.h)}`);

                // stream large payload if using s3
                if (usingS3 && contents.h['content-type'] === 'text/plain') {
                    try {
                        await awsClient.uploadAsStream({
                            payload,
                            cacheKey
                        });
                    } catch (err) {
                        request.log([cacheName, 'error'], `Failed to stream the cache: ${err}`);

                        throw boom.serverUnavailable(err.message, err);
                    }
                } else {
                    try {
                        let value = contents;

                        // convert stream to buffer, otherwise catbox cannot parse
                        contents.c = await streamToBuffer(payload);

                        // For text/plain, upload it as Buffer
                        // Otherwise, catbox-s3 will try to JSON.stringify (https://github.com/fhemberger/catbox-s3/blob/master/lib/index.js#L236)
                        // and might create issue on large payload
                        if (contents.h['content-type'] === 'text/plain') {
                            value = contents.c;
                        }

                        await cache.set(cacheKey, value, 0);
                    } catch (err) {
                        request.log([cacheName, 'error'], `Failed to store in cache: ${err}`);

                        throw boom.serverUnavailable(err.message, err);
                    }
                }

                return h.response().code(202);
            },
            options: {
                description: 'Write event/job/pipeline cache',
                notes: 'Write a cache object from a specific event, job or pipeline',
                tags: ['api', 'events', 'jobs', 'pipelines'],
                payload: {
                    maxBytes: parseInt(options.maxByteSize, 10),
                    parse: false,
                    output: 'stream'
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
                let cacheName;
                let cacheKey;

                switch (request.params.scope) {
                case 'events': {
                    const { eventId } = request.auth.credentials;
                    const eventIdParam = request.params.id;

                    if (eventIdParam !== eventId) {
                        return boom.forbidden(`Credential only valid for ${eventId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `events/${eventIdParam}/${cacheName}`;
                    break;
                }
                case 'jobs': {
                    const { jobId } = request.auth.credentials;
                    const jobIdParam = request.params.id;

                    if (jobIdParam !== jobId) {
                        return boom.forbidden(`Credential only valid for ${jobId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `jobs/${jobIdParam}/${cacheName}`;
                    break;
                }
                case 'pipelines': {
                    const { pipelineId } = request.auth.credentials;
                    const pipelineIdParam = request.params.id;

                    if (pipelineIdParam !== pipelineId) {
                        return boom.forbidden(`Credential only valid for ${pipelineId}`);
                    }

                    cacheName = request.params.cacheName;
                    cacheKey = `pipelines/${pipelineIdParam}/${cacheName}`;
                    break;
                }
                default:
                    return boom.forbidden('Invalid scope');
                }

                try {
                    await cache.drop(cacheKey);
                    request.log([cacheKey, 'info'], 'Successfully deleted a cache');

                    return h.response().code(204);
                } catch (err) {
                    request.log([cacheKey, 'error'], `Failed to delete a cache: ${err}`);

                    throw boom.serverUnavailable(err.message, err);
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
        }, {
            method: 'DELETE',
            path: '/caches/{scope}/{id}',
            handler: (request, h) => {
                if (!usingS3) {
                    return h.response();
                }

                let cachePath;
                const apiUrl = config.get('ecosystem.api');
                const opts = {
                    url: `${apiUrl}/v4/isAdmin`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${request.auth.token}`,
                        'Content-Type': 'application/json'
                    },
                    json: true
                };

                switch (request.params.scope) {
                case 'events': {
                    const eventIdParam = request.params.id;

                    opts.qs = {
                        eventId: eventIdParam
                    };

                    cachePath = `events/${eventIdParam}/`;
                    break;
                }
                case 'jobs': {
                    const jobIdParam = request.params.id;

                    opts.qs = {
                        jobId: jobIdParam
                    };

                    cachePath = `jobs/${jobIdParam}/`;
                    break;
                }
                case 'pipelines': {
                    const pipelineIdParam = request.params.id;

                    opts.qs = {
                        pipelineId: pipelineIdParam
                    };

                    cachePath = `pipelines/${pipelineIdParam}/`;
                    break;
                }
                default:
                    return boom.forbidden('Invalid scope');
                }

                return new Promise((resolve, reject) => req(opts, (err, response) => {
                    if (!err && response.body === true) {
                        return awsClient.invalidateCache(cachePath, (e) => {
                            if (e) {
                                return reject(e);
                            }

                            return resolve();
                        });
                    }

                    if (!err && response.body === false) {
                        return reject('Permission denied');
                    }

                    return reject(err);
                })).then(() => {
                    request.log([cachePath, 'info'], 'Successfully deleted a cache');

                    return h.response().code(204);
                }).catch((err) => {
                    if (err === 'Permission denied') {
                        return boom.forbidden(err);
                    }
                    request.log([cachePath, 'error'], `Failed to delete a cache: ${err}`);

                    return h.response().code(500);
                });
            },
            options: {
                description: 'Invalidate cache folder',
                notes: 'Delete entire cache folder for a job or pipeline',
                tags: ['api', 'events', 'jobs', 'pipelines'],
                auth: {
                    strategies: ['token'],
                    scope: ['user']
                },
                plugins: {
                    'hapi-swagger': {
                        security: [{ token: [] }]
                    }
                },
                validate: {
                    params: {
                        scope: SCHEMA_SCOPE_NAME,
                        id: SCHEMA_SCOPE_ID
                    }
                }
            }
        }]);
    }
};
