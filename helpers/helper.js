'use strict';

/**
 * Convert stream to buffer
 * @method streamToBuffer
 * @param  {Stream}       stream
 * @return {Buffer}
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const buffers = [];

        stream.on('error', reject);
        stream.on('data', data => buffers.push(data));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

module.exports = {
    streamToBuffer
};
