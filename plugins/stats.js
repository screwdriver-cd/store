'use strict';

exports.plugin = {
    name: 'stats',

    /**
     * Hapi interface for plugin to set up status endpoint
     * @async  register
     * @param  {Object}      server      Hapi server instance
     */
    async register(server) {
        server.route({
            method: 'GET',
            path: '/stats',
            handler: request => ({ builds: request.server.plugins.builds.stats }),
            options: {
                description: 'API stats',
                notes: 'Should return statistics for the entire system',
                tags: ['api', 'stats']
            }
        });
    }
};
