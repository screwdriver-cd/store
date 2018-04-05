'use strict';

const swagger = require('hapi-swagger');



module.exports = {
    register: swagger,
    options: {
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
    },
    security: [{ token: [] }]
};
