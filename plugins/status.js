'use strict';

/**
 * Basic healthcheck route
 * @method register
 * @param  {Hapi.Server}    server
 * @param  {Object}         options
 * @param  {Function} next
 */
exports.register = (server, options, next) => {
    server.route({
        method: 'GET',
        path: '/status',
        handler: (request, reply) => reply('OK'),
        config: {
            description: 'Healthcheck',
            notes: 'Should always respond with OK',
            tags: ['api', 'status']
        }
    });
    next();
};

exports.register.attributes = {
    name: 'status'
};
