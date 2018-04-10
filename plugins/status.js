'use strict';

exports.plugin = {
    name: 'status',

    /**
     * Basic healthcheck route
     * @method register
     * @param  {Object}     server      Hapi server instance
     */
    register(server) {
        server.route({
            method: 'GET',
            path: '/status',
            handler: () => 'OK',
            options: {
                description: 'Healthcheck',
                notes: 'Should always respond with OK',
                tags: ['api', 'status']
            }
        });
    }
};
