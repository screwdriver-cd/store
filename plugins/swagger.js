'use strict';

const swagger = require('hapi-swagger');

const options = {
    info: {
        title: 'Screwdriver Store Documentation',
        version: '1'
    },
    securityDefinitions: {
        token: {
            type: 'bearer',
            name: 'X-Token',
            in: 'header'
        }
    }
};

module.exports = {
    plugin: swagger,
    options
};
