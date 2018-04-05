'use strict';

const joi = require('joi');
const boom = require('boom');

const SCHEMA_BUILD_ID = joi.number().integer().positive().label('Build ID');
const SCHEMA_ARTIFACT_ID = joi.string().label('Artifact ID');
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB

exports.plugin = {
    name: 'builds',

    /**
     * Builds Plugin
     * @async  register
     * @param  {Hapi}     server                Hapi Server
     * @param  {Object}   options               Configuration
     * @param  {Integer}  options.expiresInSec  How long to keep it around
     * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
     */
    async register(server, options) {
        const cache = server.cache({
            segment: 'builds',
            expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
        });

        server.expose('stats', cache.stats);

        server.route([{
            method: 'GET',
            path: '/builds/{id}/{artifact*}',
            async handler(request, h) {
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;

                let value;

                try {
                    value = await cache.get(id);
                } catch (err) {
                    return err;
                }

                if (!value) {
                    return boom.notFound();
                }

                const response = h.response(Buffer.from(value.c.data));

                response.headers = value.h;

                return response;
            },
            options: {
                description: 'Read build artifacts',
                notes: 'Get an artifact from a specific build',
                tags: ['api', 'builds'],
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
                        id: SCHEMA_BUILD_ID,
                        artifact: SCHEMA_ARTIFACT_ID
                    }
                }
            }
        }, {
            method: 'PUT',
            path: '/builds/{id}/{artifact*}',
            async handler(request, h) {
                const { username } = request.auth.credentials;
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;
                const size = Buffer.byteLength(request.payload);
                const contents = {
                    c: request.payload,
                    h: {}
                };

                if (username !== buildId) {
                    return boom.forbidden(`Credential only valid for ${username}`);
                }

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                request.log(buildId, `Saving ${artifact} of size ${size} bytes with `
                    + `headers ${JSON.stringify(contents.h)}`);

                try {
                    await cache.set(id, contents, 0);
                } catch (err) {
                    request.log([id, 'error'], `Failed to store in cache: ${err}`);

                    return boom.serverUnavailable(err.message, err);
                }

                return h.response().code(202);
            },
            options: {
                description: 'Write build artifacts',
                notes: 'Write an artifact from a specific build',
                tags: ['api', 'builds'],
                payload: {
                    maxBytes: parseInt(options.maxByteSize, 10) || DEFAULT_BYTES,
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
                        id: SCHEMA_BUILD_ID,
                        artifact: SCHEMA_ARTIFACT_ID
                    }
                }
            }
        }]);
    }
};
