'use strict';

exports.plugin = {
    name: 'stats',

    /**
     * Hapi interface for plugin to set up status endpoint (see Hapi docs)
     * @method register
     * @param  {Hapi.Server}    server
     * @param  {Object}         options
     * @param  {Function} next
     */
    register: async function (server, options) {
        server.route({
            method: 'GET',
            path: '/stats',
            handler: request => ({ builds: request.server.plugins.builds.stats }),
            options: {
                description: 'API stats',
                notes: 'Should return statistics for the entire system',
                tags: ['api', 'stats']
            },
        });
    }
};
