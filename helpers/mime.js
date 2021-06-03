'use strict';

const mime = require('mime-types');

mime.types.xml = 'text/xml';

const FORCE_EXTENSION_MAPPING = {
    yidf: 'txt',
    state: 'txt',
    diff: 'txt'
};

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @param {String} fileName File name (e.g. dockerfile, main)
 * @return {String} text/html
 */
function getMimeFromFileExtension(fileExtension, fileName = '') {
    if (fileName.toLowerCase().endsWith('file')) {
        return 'text/plain';
    }

    return mime.lookup(FORCE_EXTENSION_MAPPING[fileExtension] || fileExtension) || '';
}

const knownMimes = ['text/css', 'text/javascript', 'image/png', 'image/jpeg', 'application/json',
    'text/plain', 'application/xml', 'text/yaml'];
const displayableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displayableMimes,
    knownMimes
};
