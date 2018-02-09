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
    'builds',
    'commands'
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
 * @param  {Object}      config.commands            Commands plugin configuration
 * @param  {Function}    callback                   Callback to invoke when server has started.
 * @return {http.Server}                            A listener: NodeJS http.Server object
 */
module.exports = (config, callback) => {
    // Allow ui to query store
    const cors = {
        origin: [config.ecosystem.ui]
    };

    // Create a server with a host and port
    const server = new Hapi.Server({
        connections: {
            routes: {
                cors,
                log: true
            },
            router: {
                stripTrailingSlash: true
            }
        },
        cache: config.cache
    });

    server.app = {
        ecosystem: config.ecosystem
    };
    // Initialize server connections
    server.connection(config.httpd);

    // Register Plugins
    /* eslint-disable */
    const coreRegistrations = CORE_PLUGINS.map((plugin) => require(plugin));
    const customRegistrations = CUSTOM_PLUGINS.map((plugin) => ({
        register: require(`../plugins/${plugin}`),
        options: config[plugin] || {}
    }));
    /* eslint-enable */

    server.register(coreRegistrations.concat(customRegistrations), {
        routes: {
            prefix: '/v1'
        }
    }, (err) => {
        if (err) {
            return callback(err);
        }

        // Start the server
        return server.start(error => callback(error, server));
    });
};
