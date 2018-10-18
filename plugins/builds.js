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
     * @method  register
     * @param  {Hapi}     server                Hapi Server
     * @param  {Object}   options               Configuration
     * @param  {Integer}  options.expiresInSec  How long to keep it around
     * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
     */
    register(server, options) {
        const cache = server.cache({
            segment: 'builds',
            expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
        });

        server.expose('stats', cache.stats);

        server.route([{
            method: 'GET',
            path: '/builds/{id}/{artifact*}',
            handler: async (request, h) => {
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;

                let value;

                try {
                    value = await cache.get(id);
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

                return response;
            },
            options: {
                description: 'Read build artifacts',
                notes: 'Get an artifact from a specific build',
                tags: ['api', 'builds'],
                auth: {
                    strategies: ['token'],
                    scope: ['user', 'pipeline']
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
            handler: async (request, h) => {
                const { username } = request.auth.credentials;
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;
                const contents = {
                    c: request.payload,
                    h: {}
                };
                const size = Buffer.byteLength(request.payload);
                let value = contents;

                if (username !== buildId) {
                    return boom.forbidden(`Credential only valid for ${username}`);
                }

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                // For text/plain payload or application/zip, upload it as Buffer
                // Otherwise, catbox-s3 will try to JSON.stringify (https://github.com/fhemberger/catbox-s3/blob/master/lib/index.js#L236)
                // and might create issue on large payload
                if (contents.h['content-type'] === 'text/plain') {
                    value = contents.c;
                }

                request.log(buildId, `Saving ${artifact} of size ${size} bytes with `
                    + `headers ${JSON.stringify(contents.h)}`);

                try {
                    await cache.set(id, value, 0);
                } catch (err) {
                    request.log([id, 'error'], `Failed to store in cache: ${err}`);

                    throw boom.serverUnavailable(err.message, err);
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
