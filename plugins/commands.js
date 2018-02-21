'use strict';

const boom = require('boom');
const requestApi = require('request');
const schema = require('screwdriver-data-schema');
const SCHEMA_COMMAND_NAMESPACE = schema.config.command.namespace;
const SCHEMA_COMMAND_NAME = schema.config.command.name;
const SCHEMA_COMMAND_VERSION = schema.config.command.version;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB

/**
 * Determine if a pipeline can publish the command
 * @method canPublishCommand
 * @param  {String}  namespace  Command namespace
 * @param  {String}  name       Command name
 * @param  {Integer} pipelineId pipelineId
 * @param  {String}  baseurl    API URL
 * @return {Promise}
 */
function canPublishCommand(namespace, name, pipelineId, baseurl) {
    return new Promise((resolve, reject) => {
        requestApi({
            uri: `${baseurl}/v4/commands`,
            method: 'GET',
            json: true
        },
        (err, response) => {
            if (err) {
                return reject(err);
            }

            return resolve(response);
        });
    }).then((response) => {
        const commands = response.body.filter(element =>
            element.namespace === namespace && element.name === name
        );

        // If commands.length === 0, it is first time to publish namespace/name command.
        if (commands.length === 0 || commands[0].pipelineId === pipelineId) {
            return Promise.resolve(true);
        }

        return Promise.resolve(false);
    });
}

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
        method: 'PUT',
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
                const apihost = request.server.app.ecosystem.api;
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

                return canPublishCommand(namespace, name, pipelineId, apihost)
                    .then((result) => {
                        if (!result) {
                            return reply(boom.unauthorized('Not allowed to publish this command'));
                        }

                        request.log([pipelineId], `Saving command of ${name} of size ${size} `
                            + `bytes with headers ${JSON.stringify(contents.h)}`);

                        return cache.set(id, contents, 0, (err) => {
                            if (err) {
                                request.log([id, 'error'], `Failed to store in cache: ${err}`);

                                return reply(boom.serverUnavailable(err.message, err));
                            }

                            return reply().code(202);
                        });
                    }).catch(err => reply(boom.wrap(err)));
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
