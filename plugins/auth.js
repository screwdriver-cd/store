'use strict';

const jwt = require('hapi-auth-jwt2');
const joi = require('joi');

/**
 * Validate JWT
 * @async  validate
 * @param  {Object}   decoded       Decoded JWT object
 * @param  {Hapi}     request       Hapi Request
 * @return {Object}                 Object with isValid property, denoting JWT validity
 */
async function validate(decoded, request) { // eslint-disable-line no-unused-vars
    // TODO: figure out what to do here
    return { isValid: true };
}

exports.plugin = {
    name: 'auth',

    /**
     * Auth Plugin
     * @async  register
     * @param  {Hapi}     server                Hapi Server
     * @param  {Object}   options               Configuration object
     * @param  {String}   options.jwtPublicKey  Secret for validating signed JWTs
     */
    async register(server, options) {
        const pluginOptions = joi.attempt(options, joi.object().keys({
            jwtPublicKey: joi.string().required()
        }), 'Invalid config for auth plugin');

        await server.register(jwt);

        server.auth.strategy('token', 'jwt', {
            key: pluginOptions.jwtPublicKey,
            verifyOptions: {
                algorithms: ['RS256'],
                maxAge: '13h'
            },
            // This function is run once the Token has been decoded with signature
            validate
        });
    }
};
