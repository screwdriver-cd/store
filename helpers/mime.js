'use strict';

const mime = require('mime-types');

mime.types.xml = 'text/xml';
['yidf', 'state', 'diff'].forEach((ext) => {
    mime.types[ext] = 'text/plain';
});

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

    return mime.lookup(fileExtension) || '';
}

const knownMimes = ['text/css', 'text/javascript', 'image/png', 'image/jpeg', 'application/json',
    'text/plain', 'application/xml', 'text/yaml'];
const displayableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displayableMimes,
    knownMimes
};
