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
    default:
        break;
    }

    return mime;
}

module.exports = {
    getMimeFromFileExtension
};
