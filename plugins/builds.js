'use strict';

const joi = require('joi');
const boom = require('boom');
const config = require('config');
const AwsClient = require('../helpers/aws');
const { streamToBuffer } = require('../helpers/helper');

const SCHEMA_BUILD_ID = joi.number().integer().positive().label('Build ID');
const SCHEMA_ARTIFACT_ID = joi.string().label('Artifact ID');
const DOWNLOAD = joi.string().valid(['', 'false', 'true']).label('Flag to trigger download');
const TOKEN = joi.string().label('Auth Token');
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
        const segment = 'builds';
        const cache = server.cache({
            segment,
            expiresIn: parseInt(options.expiresInSec, 10) || DEFAULT_TTL
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
            path: '/builds/{id}/{artifact*}',
            handler: async (request, h) => {
                const buildId = request.params.id;
                const artifact = request.params.artifact;
                const id = `${buildId}-${artifact}`;

                let value;
                let response;

                // for old json files, the value is hidden in an object, we cannot stream it directly
                if (usingS3 && id.endsWith('.zip')) {
                    try {
                        value = await awsClient.getDownloadStream({ cacheKey: id });
                        response = h.response(value);
                        response.headers['content-type'] = 'application/octet-stream';
                    } catch (err) {
                        request.log([id, 'error'], `Failed to stream the cache: ${err}`);
                        throw err;
                    }
                } else {
                    try {
                        value = await cache.get(id);
                    } catch (err) {
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

                    if (id.endsWith('.html')) {
                        response.headers['content-type'] = 'text/html';
                    }
                }

                // only if the artifact is requested as downloadable item
                if (request.query.download === 'true') {
                    // let browser sniff for the correct filename w/ extension
                    response.headers['content-disposition'] =
                        `attachment; filename="${encodeURI(artifact.split('/').pop())}"`;
                }

                return response;
            },
            options: {
                description: 'Read build artifacts',
                notes: 'Get an artifact from a specific build',
                tags: ['api', 'builds'],
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
                    params: {
                        id: SCHEMA_BUILD_ID,
                        artifact: SCHEMA_ARTIFACT_ID
                    },
                    query: {
                        download: DOWNLOAD,
                        token: TOKEN
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
                const payload = request.payload;
                const contents = {
                    c: payload,
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

                // stream large payload if using s3
                if (usingS3) {
                    try {
                        await awsClient.uploadAsStream({
                            payload,
                            cacheKey: id
                        });
                    } catch (err) {
                        request.log([id, 'error'], `Failed to store in cache: ${err}`);

                        throw boom.serverUnavailable(err.message, err);
                    }
                } else {
                    let value = contents;

                    // convert stream to buffer, otherwise catbox cannot parse
                    contents.c = await streamToBuffer(payload);

                    // For text/plain payload, upload it as Buffer
                    // Otherwise, catbox-s3 will try to JSON.stringify (https://github.com/fhemberger/catbox-s3/blob/master/lib/index.js#L236)
                    // and might create issue on large payload
                    if (contents.h['content-type'] === 'text/plain') {
                        value = contents.c;
                    }

                    request.log(buildId, `Saving ${artifact} with `
                        + `headers ${JSON.stringify(contents.h)}`);

                    try {
                        await cache.set(id, value, 0);
                    } catch (err) {
                        request.log([id, 'error'], `Failed to store in cache: ${err}`);

                        throw boom.serverUnavailable(err.message, err);
                    }
                }

                return h.response().code(202);
            },
            options: {
                description: 'Write build artifacts',
                notes: 'Write an artifact from a specific build',
                tags: ['api', 'builds'],
                payload: {
                    maxBytes: parseInt(options.maxByteSize, 10) || DEFAULT_BYTES,
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
                        id: SCHEMA_BUILD_ID,
                        artifact: SCHEMA_ARTIFACT_ID
                    }
                }
            }
        }]);
    }
};
