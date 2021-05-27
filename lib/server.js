'use strict';

const Hapi = require('@hapi/hapi');
const CORE_PLUGINS = [
    '@hapi/inert',
    '@hapi/vision',
    '../plugins/status',
    '../plugins/swagger',
    '../plugins/logging',
    '../plugins/stats'
];
const CUSTOM_PLUGINS = [
    'auth',
    'builds',
    'commands',
    'caches'
];

/**
 * Configures & starts up a HapiJS server
 * @async
 * @param  {Object}      config
 * @param  {Object}      config.httpd
 * @param  {Integer}     config.httpd.port          Port number to listen to
 * @param  {String}      config.httpd.host          Host to listen on
 * @param  {String}      config.httpd.uri           Public routable address
 * @param  {Object}      config.httpd.tls           TLS Configuration
 * @param  {Object}      config.cache               Cache configuration
 * @param  {Object}      config.cache.engine        Catbox Engine
 * @param  {Object}      config.builds              Build plugin configuration
 * @param  {Object}      config.caches              Caches plugin configuration
 * @param  {Object}      config.auth                Auth plugin configuration
 * @param  {Object}      config.commands            Commands plugin configuration
 * @return {http.Server}                            A listener: NodeJS http.Server object
 */
module.exports = async (config) => {
    let corsOrigins = [config.ecosystem.ui];

    if (Array.isArray(config.ecosystem.allowCors)) {
        corsOrigins = corsOrigins.concat(config.ecosystem.allowCors);
    }

    // Allow ui to query store
    const cors = {
        origin: corsOrigins
    };

    // Create a server with a host and port
    // Use Object.assign to pass httpd config
    const server = Hapi.server({
        routes: {
            cors,
            log: { collect: true },
            payload: { timeout: 60000 }
        },
        router: {
            stripTrailingSlash: true
        },
        cache: [config.cache],
        ...config.httpd
    });

    // Register Plugins
    /* eslint-disable */
    const coreRegistrations = CORE_PLUGINS.map(plugin => require(plugin));
    const customRegistrations = CUSTOM_PLUGINS.map(plugin => ({
        plugin: require(`../plugins/${plugin}`),
        options: config[plugin] || {}
    }));
    /* eslint-enable */

    await server.register(coreRegistrations.concat(customRegistrations), {
        routes: {
            prefix: '/v1'
        }
    });

    try {
        await server.start();
    } catch (err) {
        console.error('err', err);
    }


    return server;
};
