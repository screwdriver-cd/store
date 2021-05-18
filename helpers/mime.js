'use strict';

const mime = require('mime-types');

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @return {String} text/html
 */
function getMimeFromFileExtension(fileExtension) {
    return mime.lookup(fileExtension) || '';
}

const knownMimes = ['text/css', 'text/javascript', 'image/png', 'image/jpeg', 'application/json', 'text/plain', 'application/xml'];
const displayableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displayableMimes,
    knownMimes
};
