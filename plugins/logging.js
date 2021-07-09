'use strict';

const good = require('@hapi/good');

const options = {
    ops: {
        interval: 1000
    },
    reporters: {
        console: [
            {
                module: '@hapi/good-squeeze',
                name: 'Squeeze',
                args: [{ error: '*', log: '*', response: '*', request: '*' }]
            },
            {
                module: '@hapi/good-console'
            },
            'stdout'
        ]
    }
};

module.exports = {
    plugin: good,
    options
};
