'use strict';

const jwt = require('hapi-auth-jwt2');
const joi = require('joi');

/**
 * Validate JWT
 * @async  validate
 * @param  {Object}   decoded       Decoded JWT object
 * @param  {Hapi}     request       Hapi Request
 * @return {Object}   Object with isValid property, denoting JWT validity
 */
async function validate(decoded, request) {     // eslint-disable-line
    // TODO: figure our what to do here
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
        let pluginOptions;

        try {
            pluginOptions = joi.attempt(options, joi.object().keys({
                jwtPublicKey: joi.string().required()
            }), 'Invalid config for auth plugin');

            await server.register(jwt);
        } catch (err) {
            throw err;
        }

        server.auth.strategy('token', 'jwt', {
            key: pluginOptions.jwtPublicKey,
            verifyOptions: {
                algorithms: ['RS256'],
                maxAge: '12h'
            },
            // This function is run once the Token has been decoded with signature
            validate
        });
    }
};
