'use strict';

const mime = require('mime-types');

const FORCE_EXTENSION_MAPPING = {
    yidf: 'txt',
    state: 'txt',
    diff: 'txt'
};

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @return {String} text/html
 */
function getMimeFromFileExtension(fileExtension) {
    return mime.lookup(fileExtension) || mime.lookup(FORCE_EXTENSION_MAPPING[fileExtension]) || '';
}

const knownMimes = ['text/css', 'text/javascript', 'image/png', 'image/jpeg', 'application/json',
    'text/plain', 'application/xml'];
const displayableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displayableMimes,
    knownMimes
};
