'use strict';

const boom = require('boom');
const schema = require('screwdriver-data-schema');
const SCHEMA_COMMAND_NAMESPACE = schema.config.command.namespace;
const SCHEMA_COMMAND_NAME = schema.config.command.name;
const SCHEMA_COMMAND_VERSION = schema.config.command.version;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB

/**
 * Commands Plugin
 * @method register
 * @param  {Hapi}     server                Hapi Server
 * @param  {Object}   options               Configuration
 * @param  {Integer}  options.expiresInSec  How long to keep it around
 * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
 * @param  {Function} next                  Function to call when done
 */
exports.register = (server, options, next) => {
    const cache = server.cache({
        segment: 'commands',
        expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
    });

    server.expose('stats', cache.stats);
    server.route([{
        method: 'GET',
        path: '/commands/{namespace}/{name}/{version}',
        config: {
            description: 'Get command binary',
            notes: 'Get a script or binary of specific command',
            tags: ['api', 'commands'],
            auth: {
                strategies: ['token'],
                scope: ['user', 'build']
            },
            plugins: {
                'hapi-swagger': {
                    security: [{ token: [] }]
                }
            },
            handler: (request, reply) => {
                const namespace = request.params.namespace;
                const name = request.params.name;
                const version = request.params.version;

                const id = `${namespace}-${name}-${version}`;

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
                    namespace: SCHEMA_COMMAND_NAMESPACE,
                    name: SCHEMA_COMMAND_NAME,
                    version: SCHEMA_COMMAND_VERSION
                }
            }
        }
    }, {
        method: 'POST',
        path: '/commands/{namespace}/{name}/{version}',
        config: {
            description: 'Write command',
            notes: 'Write a script or binary of specific command',
            tags: ['api', 'commands'],
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
                const pipelineId = request.auth.credentials.pipelineId;
                const namespace = request.params.namespace;
                const name = request.params.name;
                const version = request.params.version;
                const id = `${namespace}-${name}-${version}`;
                const contents = {
                    c: request.payload,
                    h: {}
                };
                const size = Buffer.byteLength(request.payload);

                // Store all x-* and content-type headers
                Object.keys(request.headers).forEach((header) => {
                    if (header.indexOf('x-') === 0 || header === 'content-type') {
                        contents.h[header] = request.headers[header];
                    }
                });

                request.log([pipelineId], `Saving command of ${name} of size ${size} `
                    + `bytes with headers ${JSON.stringify(contents.h)}`);

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
                    namespace: SCHEMA_COMMAND_NAMESPACE,
                    name: SCHEMA_COMMAND_NAME,
                    version: SCHEMA_COMMAND_VERSION
                }
            }
        }
    }]);

    next();
};

exports.register.attributes = {
    name: 'commands'
};
