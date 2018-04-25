'use strict';

const good = require('good');

const options = {
    ops: {
        interval: 1000
    },
    reporters: {
        console: [{
            module: 'good-squeeze',
            name: 'Squeeze',
            args: [{ error: '*', log: '*', response: '*', request: '*' }]
        }, {
            module: 'good-console'
        }, 'stdout']
    }
};

module.exports = {
    plugin: good,
    options
};
