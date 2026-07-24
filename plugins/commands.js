'use strict';

/* global globalThis */

const joi = require('joi');
const boom = require('@hapi/boom');
const schema = require('screwdriver-data-schema');
const SCHEMA_COMMAND_NAMESPACE = schema.config.command.namespace;
const SCHEMA_COMMAND_NAME = schema.config.command.name;
const SCHEMA_COMMAND_VERSION = schema.config.command.version;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 1 day
const DEFAULT_BYTES = 1024 * 1024 * 1024; // 1GB
const OWNERSHIP_LOOKUP_TIMEOUT_MS = 10 * 1000; // bound the API round-trip so a slow API fails closed promptly
const config = require('config');
const AwsClient = require('../helpers/aws');

/**
 * Look up the authoritative owning pipelineId for a command from the API.
 *
 * Command binaries are fetched by builds directly from the store, so the store
 * cannot rely on the API's route-level ownership check. This consults the
 * command's API record (which carries the owning pipelineId) so the store can
 * reject a mutation coming from a different pipeline.
 * @method  getCommandOwner
 * @param   {Object}  arg
 * @param   {String}  arg.apiUrl         Base URL of the Screwdriver API
 * @param   {String}  arg.namespace      Command namespace
 * @param   {String}  arg.name           Command name
 * @param   {String}  arg.version        Command version
 * @param   {String}  arg.authorization  Authorization header to forward
 * @returns {Promise<Number|null>}       Owning pipelineId, or null when the command has no record yet
 */
async function getCommandOwner({ apiUrl, namespace, name, version, authorization }) {
    const response = await globalThis.fetch(`${apiUrl}/v1/commands/${namespace}/${name}/${version}`, {
        method: 'GET',
        headers: { authorization },
        // A hung (not down) API would otherwise stall every write/delete; bound it.
        signal: AbortSignal.timeout(OWNERSHIP_LOOKUP_TIMEOUT_MS)
    });

    // No record yet — the command is unowned (e.g. first publish, before the
    // API persists the record), so there is nothing to protect.
    if (response.status === 404) {
        return null;
    }

    if (response.status !== 200) {
        throw new Error(`Command ownership lookup returned status ${response.status}`);
    }

    const command = await response.json();

    return command.pipelineId;
}

/**
 * Reject the request unless the caller's pipeline owns the target command.
 *
 * Fails closed: an unconfigured API URL, a lookup error, a timeout, or an
 * owner mismatch all block the mutation rather than silently allowing it. A
 * command with no API record yet (404) is treated as unowned so first
 * publishes still succeed.
 * @method  assertCommandOwnership
 * @param   {Object}  arg
 * @param   {Object}  arg.request        Hapi request (for auth header + logging)
 * @param   {String}  arg.namespace      Command namespace
 * @param   {String}  arg.name           Command name
 * @param   {String}  arg.version        Command version
 * @param   {Number}  arg.pipelineId     Owning pipelineId from the caller's credentials
 * @param   {String}  arg.action         Verb for the forbidden message (e.g. 'overwrite', 'delete')
 * @returns {Promise}
 */
async function assertCommandOwnership({ request, namespace, name, version, pipelineId, action }) {
    const id = `${namespace}-${name}-${version}`;
    const apiUrl = config.get('ecosystem').api;

    if (!apiUrl) {
        request.log([id, 'error'], 'Cannot verify command ownership: ecosystem.api is not configured');
        throw boom.serverUnavailable('Command ownership verification is not configured');
    }

    let ownerPipelineId;

    try {
        ownerPipelineId = await getCommandOwner({
            apiUrl,
            namespace,
            name,
            version,
            authorization: request.headers.authorization
        });
    } catch (err) {
        request.log([id, 'error'], `Failed to verify command ownership: ${err}`);
        throw boom.serverUnavailable('Failed to verify command ownership');
    }

    // Normalize both sides: the API body and the JWT credentials could carry
    // the id as a number or a numeric string.
    if (ownerPipelineId !== null && Number(ownerPipelineId) !== Number(pipelineId)) {
        throw boom.forbidden(`Not allowed to ${action} this command`);
    }
}

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

                    // Reject an overwrite of a command owned by a different
                    // pipeline. Builds reach this route directly (bypassing the
                    // API's ownership check), so the store must verify ownership
                    // against the command's authoritative API record.
                    await assertCommandOwnership({
                        request,
                        namespace,
                        name,
                        version,
                        pipelineId,
                        action: 'overwrite'
                    });

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
                    const { pipelineId } = request.auth.credentials;
                    const { namespace, name, version } = request.params;
                    const id = `${namespace}-${name}-${version}`;

                    // Build credentials carry a pipelineId; reject a delete of a
                    // command owned by a different pipeline. User-scope deletes
                    // arrive via the API, which authorizes them before
                    // forwarding here and carry no pipelineId.
                    if (pipelineId !== undefined && pipelineId !== null) {
                        await assertCommandOwnership({
                            request,
                            namespace,
                            name,
                            version,
                            pipelineId,
                            action: 'delete'
                        });
                    }

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
