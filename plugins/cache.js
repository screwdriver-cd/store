'use strict';

const joi = require('joi');
const boom = require('boom');

const SCHEMA_EVENT_ID = joi.number().integer().positive().label('Event ID');
const SCHEMA_CACHE_NAME = joi.string().label('Cache Name');

exports.plugin = {
    name: 'cache',

    /**
     * Cache Plugin
     * @method  register
     * @param  {Hapi}     server                Hapi Server
     */
    register(server) {
        const cache = server.cache({
            segment: 'cache'
        });

        server.expose('stats', cache.stats);
        server.route([{
            method: 'GET',
            path: '/events/{id}/{cacheName}',
            handler: async (request, h) => {
                const { eventId } = request.auth.credentials;
                const eventIdParam = request.params.id;

                if (eventIdParam !== eventId) {
                    return boom.forbidden(`Credential only valid for ${eventId}`);
                }

                const cacheName = request.params.cacheName;
                const cacheKey = `events/${eventIdParam}/${cacheName}`;
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
                    response.headers['content-type'] = 'text/plain';
                }

                return response;
            },
            options: {
                description: 'Read event cache',
                notes: 'Get a specific cached object from an event',
                tags: ['api', 'events'],
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
                        id: SCHEMA_EVENT_ID,
                        cacheName: SCHEMA_CACHE_NAME
                    }
                }
            }
        }]);
    }
};
