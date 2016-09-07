'use strict';

const jwt = require('hapi-auth-jwt');
const joi = require('joi');

/**
 * Auth Plugin
 * @method register
 * @param  {Hapi}     server                Hapi Server
 * @param  {Object}   options               Configuration object
 * @param  {String}   options.jwtPublicKey  Secret for validating signed JWTs
 * @param  {Function} next                  Function to call when done
 */
exports.register = (server, options, next) => {
    let pluginOptions;

    try {
        pluginOptions = joi.attempt(options, joi.object().keys({
            jwtPublicKey: joi.string().required()
        }), 'Invalid config for auth plugin');
    } catch (ex) {
        return next(ex);
    }

    return server.register(jwt).then(() => {
        server.auth.strategy('token', 'jwt', {
            key: pluginOptions.jwtPublicKey,
            verifyOptions: {
                algorithms: ['RS256'],
                maxAge: '12h'
            }
        });

        next();
    });
};

exports.register.attributes = {
    name: 'auth'
};
