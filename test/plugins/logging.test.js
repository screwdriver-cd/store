'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const Hapi = require('@hapi/hapi');

sinon.assert.expose(assert, { prefix: '' });

describe('logging plugin test', () => {
    let plugin;
    let server;

    beforeEach(async () => {
        // eslint-disable-next-line global-require
        plugin = require('../../plugins/logging');

        server = await Hapi.server({
            port: 1234
        });

        return server.register(plugin);
    });

    afterEach(() => {
        server = null;
    });

    it('registers the plugin', () => {
        assert.isOk(server.registrations['@hapi/good']);
    });
});
