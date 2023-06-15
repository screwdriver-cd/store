'use strict';

const mime = require('mime-types');

const KNOWN_FILE_EXTS_IN_TEXT_FORMAT = [
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
    'go',
    'py',
    'tox',
    'env',
    'sh',
    'vb',
    'swift',
    'yidf',
    'state',
    'diff',
    'deps',
    'xml',
    'toml',
    'editorconfig'
];

/**
 * Get MIME types from file name and file extension
 * @method getMimeFromFileName
 * @param  {String}  fileExtension  File extension (e.g. css, txt, html)
 * @param  {String}  fileName       File name      (e.g. dockerfile, main)
 * @param  {Boolean} raw            raw data type  (e.g. application/javascript instead of text/javascript)
 * @return {String}  MIME Type      eg. text/html, text/plain
 */
function getMimeFromFileName(fileExtension, fileName = '', raw = false) {
    if (raw === true) {
        return mime.lookup(fileExtension) || '';
    }

    if (fileName.toLowerCase().endsWith('file')) {
        return 'text/plain';
    }

    if (KNOWN_FILE_EXTS_IN_TEXT_FORMAT.includes(fileExtension.toLowerCase())) {
        return 'text/plain';
    }

    return mime.lookup(fileExtension) || '';
}

const displayableMimes = ['text/html'];

module.exports = {
    getMimeFromFileName,
    displayableMimes
};
