'use strict';

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @return {String} text/html
 */
function getMimeFromFileExtension(fileExtension) {
    let mime = '';

    switch (fileExtension.toLowerCase()) {
    case 'html':
        mime = 'text/html';
        break;
    case 'css':
        mime = 'text/css';
        break;
    case 'js':
        mime = 'text/javascript';
        break;
    case 'png':
        mime = 'image/png';
        break;
    case 'jpeg':
        mime = 'image/jpeg';
        break;
    case 'jpg':
        mime = 'image/jpeg';
        break;
    default:
        break;
    }

    return mime;
}
const knownMimes = ['text/css', 'text/javascript', 'image/png', 'image/jpeg'];
const displableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displableMimes,
    knownMimes
};
