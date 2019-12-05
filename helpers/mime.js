'use strict';

/**
 * getMimeFromFileExtension
 * @param  {String} fileExtension  File extension (e.g. css, txt, html)
 * @return {String} text/html
 */
function getMimeFromFileExtension(fileExtension) {
    let mime = '';

    switch (fileExtension.toLowerCase()) {
    case 'css':
        mime = 'text/css';
        break;
    case 'js':
        mime = 'text/javascript';
        break;
    case 'html':
        mime = 'text/html';
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
const executableMimes = ['text/css', 'text/javascript'];
const displableMimes = ['text/html'];

module.exports = {
    getMimeFromFileExtension,
    displableMimes,
    executableMimes
};
