'use strict';

const { assert } = require('chai');
const config = require('config');

describe('config case', () => {
    it('disables compression for application/octet-stream by default', () => {
        const compressible = config.get('httpd.mime.override.application/octet-stream.compressible');

        assert.isFalse(compressible);
    });
});
