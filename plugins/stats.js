'use strict';

/**
 * Hapi interface for plugin to set up status endpoint (see Hapi docs)
 * @method register
 * @param  {Hapi.Server}    server
 * @param  {Object}         options
 * @param  {Function} next
 */
exports.register = (server, options, next) => {
    server.route({
        method: 'GET',
        path: '/stats',
        config: {
            description: 'API stats',
            notes: 'Should return statistics for the entire system',
            tags: ['api', 'stats']
        },
        handler: (request, reply) => reply({
            builds: request.server.plugins.builds.stats
        })
    });
    next();
};

exports.register.attributes = {
    name: 'stats'
};
