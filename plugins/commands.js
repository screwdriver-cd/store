'use strict';

const joi = require('joi');
const boom = require('@hapi/boom');
const schema = require('screwdriver-data-schema');
const SCHEMA_COMMAND_NAMESPACE = schema.config.command.namespace;
const SCHEMA_COMMAND_NAME = schema.config.command.name;
const SCHEMA_COMMAND_VERSION = schema.config.command.version;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB
const config = require('config');
const AwsClient = require('../helpers/aws');

exports.plugin = {
    name: 'commands',

    /**
     * Commands Plugin
     * @method register
     * @param  {Hapi}     server                Hapi Server
     * @param  {Object}   options               Configuration
     * @param  {Integer}  options.expiresInSec  How long to keep it around
     * @param  {Integer}  options.maxByteSize   Maximum Bytes to accept
     */
    register(server, options) {
        const segment = 'commands';
        const strategyConfig = config.get('strategy');
        const usingS3 = strategyConfig.plugin === 's3';
        let awsClient;

        if (usingS3) {
            const s3Config = { ...strategyConfig.s3, segment };

            awsClient = new AwsClient(s3Config);
        }
        const cache = server.cache({
            segment: 'commands',
            expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
        });

        server.expose('stats', cache.stats);

        server.route([
            {
                method: 'GET',
                path: '/commands/{namespace}/{name}/{version}',
                handler: async (request, h) => {
                    const { namespace, name, version } = request.params;
                    const id = `${namespace}-${name}-${version}`;
                    let response;
                    let value;

                    if (usingS3) {
                        try {
                            value = await awsClient.getDownloadObject({ objectKey: id });
                        } catch (err) {
                            request.log([id, 'error'], `Failed to fetch from s3: ${err}`);
                            throw err;
                        }
                    } else {
                        value = await cache.get(id);

                        if (!value) {
                            throw boom.notFound();
                        }
                    }

                    if (value.c) {
                        response = h.response(Buffer.from(value.c.data));
                        response.headers = value.h;
                    } else {
                        response = h.response(Buffer.from(value));
                        response.headers['content-type'] = 'application/octet-stream';
                    }

                    return response;
                },
                options: {
                    description: 'Get command binary',
                    notes: 'Get a script or binary of specific command',
                    tags: ['api', 'commands'],
                    auth: {
                        strategies: ['token'],
                        scope: ['user', 'pipeline', 'build']
                    },
                    plugins: {
                        'hapi-swagger': {
                            security: [{ token: [] }]
                        }
                    },
                    validate: {
                        params: joi.object({
                            namespace: SCHEMA_COMMAND_NAMESPACE,
                            name: SCHEMA_COMMAND_NAME,
                            version: SCHEMA_COMMAND_VERSION
                        })
                    }
                }
            },
            {
                method: 'POST',
                path: '/commands/{namespace}/{name}/{version}',
                handler: async (request, h) => {
                    const { pipelineId } = request.auth.credentials;
                    const { namespace, name, version } = request.params;
                    const id = `${namespace}-${name}-${version}`;
                    const contents = {
                        c: request.payload,
                        h: {}
                    };
                    const size = Buffer.byteLength(request.payload);

                    // Store all x-* and content-type headers
                    Object.keys(request.headers).forEach(header => {
                        if (header.indexOf('x-') === 0 || header === 'content-type') {
                            contents.h[header] = request.headers[header];
                        }
                    });

                    request.log(
                        [pipelineId],
                        `Saving command of ${name} of size ${size} ` +
                            `bytes with headers ${JSON.stringify(contents.h)}`
                    );

                    try {
                        if (usingS3) {
                            await awsClient.uploadCommandAsStream({ payload: request.payload, cacheKey: id });
                        } else {
                            await cache.set(id, contents, 0);
                        }
                    } catch (err) {
                        request.log([id, 'error'], `Failed to create command: ${err}`);
                        throw boom.serverUnavailable(err.message, err);
                    }

                    return h.response().code(202);
                },
                options: {
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
                    validate: {
                        params: joi.object({
                            namespace: SCHEMA_COMMAND_NAMESPACE,
                            name: SCHEMA_COMMAND_NAME,
                            version: SCHEMA_COMMAND_VERSION
                        })
                    }
                }
            },
            {
                method: 'DELETE',
                path: '/commands/{namespace}/{name}/{version}',
                handler: async (request, h) => {
                    const { namespace, name, version } = request.params;
                    const id = `${namespace}-${name}-${version}`;

                    try {
                        if (usingS3) {
                            await awsClient.removeObject(id, err => {
                                if (err) {
                                    throw err;
                                }
                            });
                            request.log([id, 'info'], 'Successfully deleted a command');

                            return h.response().code(204);
                        }
                        await cache.drop(id);
                        request.log([id, 'info'], 'Successfully deleted a command');

                        return h.response().code(204);
                    } catch (err) {
                        request.log([id, 'error'], `Failed to delete a command: ${err}`);
                        throw boom.serverUnavailable(err.message, err);
                    }
                },
                options: {
                    description: 'Delete command binary',
                    notes: 'Delete a script or binary of specific command',
                    tags: ['api', 'commands'],
                    auth: {
                        strategies: ['token'],
                        scope: ['build', 'user']
                    },
                    plugins: {
                        'hapi-swagger': {
                            security: [{ token: [] }]
                        }
                    },
                    validate: {
                        params: joi.object({
                            namespace: SCHEMA_COMMAND_NAMESPACE,
                            name: SCHEMA_COMMAND_NAME,
                            version: SCHEMA_COMMAND_VERSION
                        })
                    }
                }
            }
        ]);
    }
};
