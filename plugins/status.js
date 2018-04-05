'use strict';

exports.plugin = {
    name: 'status',

    /**
     * Basic healthcheck route
     * @method register
     * @param  {Hapi.Server}    server
     * @param  {Object}         options
     * @param  {Function} next
     */
    register: async function (server, options) {
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
