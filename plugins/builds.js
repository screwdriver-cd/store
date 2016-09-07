'use strict';

const joi = require('joi');
const boom = require('boom');

const SCHEMA_BUILD_ID = joi.string().hex().length(40).label('Build ID');
const SCHEMA_ARTIFACT_ID = joi.string().label('Artifact ID');
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB

/**
 * Builds Plugin
 * @method register
 * @param  {Hapi}     server                Hapi Server
 * @param  {Object}   options               Configuration
 * @param  {Integer}  options.expiresInSec  How long to keep it around
 * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
 * @param  {Function} next                  Function to call when done
 */
exports.register = (server, options, next) => {
    const cache = server.cache({
        segment: 'builds',
        expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
    });

    server.expose('stats', cache.stats);
    server.route([{
        method: 'GET',
        path: '/builds/{id}/{artifact*}',
        config: {
            description: 'Read build artifacts',
            notes: 'Get an artifact from a specific build',
            tags: ['api', 'builds'],
            handler: (request, reply) => {
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;

                cache.get(id, (err, value) => {
                    if (err) {
                        return reply(err);
                    }
                    if (!value) {
                        return reply(boom.notFound());
                    }

                    // @TODO put cache headers in here
                    const response = reply(Buffer.from(value.c.data));

                    response.headers = value.h;

                    return response;
                });
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
        config: {
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
            handler: (request, reply) => {
                const username = request.auth.credentials.username;
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;
                const contents = {
                    c: request.payload,
                    h: {}
                };
                const size = Buffer.byteLength(request.payload);

                if (username !== buildId) {
                    return reply(boom.forbidden(`Credential only valid for ${username}`));
                }

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                request.log([buildId], `Saving ${artifact} of size ${size} bytes with `
                    + `headers ${JSON.stringify(contents.h)}`);

                return cache.set(id, contents, 0, (err) => {
                    if (err) {
                        request.log([id, 'error'], `Failed to store in cache: ${err}`);

                        return reply(boom.serverUnavailable(err.message, err));
                    }

                    return reply().code(202);
                });
            },
            validate: {
                params: {
                    id: SCHEMA_BUILD_ID,
                    artifact: SCHEMA_ARTIFACT_ID
                }
            }
        }
    }]);

    next();
};

exports.register.attributes = {
    name: 'builds'
};
