'use strict';

const mime = require('mime-types');

const KNOW_FILE_NAMES_IN_TEXT_FORMAT = ['dockerfile', 'makefile'];
const KNOW_FILE_EXTS_IN_TEXT_FORMAT = [
    'js',
    'c',
    'cpp',
    'cs',
    'dtd',
    'h',
    'm',
    'java',
    'lua',
    'pl',
    'py',
    'tox',
    'env',
    'sh',
    'vb',
    'swift',
    'yidf',
    'state',
    'diff',
    'xml'
];

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @param  {String} fileName       File name      (e.g. dockerfile, main)
 * @return {String} MIME Type      eg. text/html, text/plain
 */
function getMimeFromFileExtension(fileExtension, fileName = '') {
    if (KNOW_FILE_NAMES_IN_TEXT_FORMAT.includes(fileName.toLowerCase())) {
        return 'text/plain';
    }

    if (KNOW_FILE_EXTS_IN_TEXT_FORMAT.includes(fileExtension.toLowerCase())) {
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
