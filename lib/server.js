'use strict';
const Hapi = require('hapi');
const CORE_PLUGINS = [
    'inert',
    'vision',
    '../plugins/status',
    '../plugins/swagger',
    '../plugins/logging',
    '../plugins/stats'
];
const CUSTOM_PLUGINS = [
    'auth',
    'builds'
];

/**
 * Configures & starts up a HapiJS server
 * @method
 * @param  {Object}      config
 * @param  {Object}      config.httpd
 * @param  {Integer}     config.httpd.port          Port number to listen to
 * @param  {String}      config.httpd.host          Host to listen on
 * @param  {String}      config.httpd.uri           Public routable address
 * @param  {Object}      config.httpd.tls           TLS Configuration
 * @param  {Object}      config.cache               Cache configuration
 * @param  {Object}      config.cache.engine        Catbox Engine
 * @param  {Object}      config.builds              Build plugin configuration
 * @param  {Object}      config.auth                Auth plugin configuration
 * @param  {Function}    callback                   Callback to invoke when server has started.
 * @return {http.Server}                            A listener: NodeJS http.Server object
 */
module.exports = (config, callback) => {
    // Create a server with a host and port
    const server = new Hapi.Server({
        connections: {
            routes: {
                log: true
            },
            router: {
                stripTrailingSlash: true
            }
        },
        cache: config.cache
    });

    // Initialize server connections
    server.connection(config.httpd);

    // Register Plugins
    /* eslint-disable global-require */
    const coreRegistrations = CORE_PLUGINS.map((plugin) => require(plugin));
    const customRegistrations = CUSTOM_PLUGINS.map((plugin) => ({
        register: require(`../plugins/${plugin}`),
        options: config[plugin] || {}
    }));
    /* eslint-enable global-require */

    server.register(coreRegistrations.concat(customRegistrations), {
        routes: {
            prefix: '/v1'
        }
    }, (err) => {
        if (err) {
            return callback(err);
        }

        // Start the server
        return server.start((error) => callback(error, server));
    });
};
