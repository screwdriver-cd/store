'use strict';

const AWS = require('aws-sdk');
const stream = require('stream');
const Boom = require('boom');
const logger = require('screwdriver-logger');

class AwsClient {
    /**
     * Construct a Client
     * @method constructor
     * @param  {Object}    config
     * @param  {String}    config.endpoint           S3 compatible endpoint
     * @param  {String}    config.accessKeyId        S3 access key ID.
     * @param  {String}    config.secretAccessKey    S3 secret access key.
     * @param  {String}    config.region             the region to send service requests to
     * @param  {String}    config.forcePathStyle     whether to force path style URLs for S3 objects
     * @param  {String}    config.bucket             S3 bucket
     * @param  {String}    config.segment            S3 segment
     * @param  {Integer}   config.partSize           aws-sdk upload option
     */
    constructor(config) {
        const options = {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: config.region,
            s3ForcePathStyle: config.forcePathStyle
        };

        if (config.endpoint) {
            options.endpoint = config.endpoint;
        }

        this.client = new AWS.S3(options);
        this.bucket = config.bucket;
        this.segment = config.segment;
        this.partSize = config.partSize;
    }

    /**
     * Update Last Modified field in S3 file
     * @method updateLastModified
     * @param  {String}           cacheKey      cache key
     * @param  {Function}         callback      callback function
     */
    updateLastModified(cacheKey, callback) {
        let params = {
            Bucket: this.bucket,
            Key: `caches/${cacheKey}`
        };

        // get StorageClass value
        return this.client.headObject(params, (err, data) => {
            if (err) {
                return callback(err);
            }

            params = {
                Bucket: this.bucket,
                CopySource: `${this.bucket}/caches/${cacheKey}`,
                Key: `caches/${cacheKey}`,
                StorageClass: data.StorageClass || 'STANDARD'
            };

            // update storage class to same value to update last modified: https://alestic.com/2013/09/s3-lifecycle-extend
            return this.client.copyObject(params, (e) => {
                if (e) {
                    return callback(e);
                }

                return callback(null);
            });
        });
    }

    /**
     * Delete all cached objects at cachePath
     * @method invalidateCache
     * @param {String}              cachePath       Path to cache
     * @param {Function}            callback        callback function
     */
    invalidateCache(cachePath, callback) {
        const self = this;

        let params = {
            Bucket: this.bucket,
            Prefix: `caches/${cachePath}`
        };

        return this.client.listObjects(params, (e, data) => {
            if (e) return callback(e);

            if (data.Contents.length === 0) return callback();

            params = { Bucket: this.bucket };
            params.Delete = { Objects: [] };

            data.Contents.forEach((content) => {
                params.Delete.Objects.push({ Key: content.Key });
            });

            return this.client.deleteObjects(params, (err) => {
                if (err) return callback(err);
                if (data.isTruncated) return self.invalidateCache(cachePath, callback);

                return callback();
            });
        });
    }

    /**
     * Parse cache key
     * @method getStoragePathForKey
     * @param {String}              cacheKey          Path of the cache
     * @return {String}
     */
    getStoragePathForKey(cacheKey) {
        const convert = str => str
            // Remove leading/trailing slashes
            .replace(/(^\/|\/$)/g, '')
            // Replace special URL characters
            .replace(/[?&#%]/g, '~');

        const parsedKey = convert(cacheKey);

        return `${this.segment}/${parsedKey}`;
    }

    /**
     * upload data as stream
     * @method uploadAsStream
     * @param {Object}              config               Config object
     * @param {Stream}              config.payload       Payload to upload
     * @param {String}              config.cacheKey      Path to cache
     * @return {Promise}
     */
    uploadAsStream({ payload, cacheKey }) {
        // stream the data to s3
        const passthrough = new stream.PassThrough();
        const params = {
            Bucket: this.bucket,
            Key: this.getStoragePathForKey(cacheKey),
            Expires: new Date(),
            ContentType: 'application/octet-stream',
            Body: passthrough
        };
        const options = {
            partSize: this.partSize
        };

        payload.pipe(passthrough);

        return this.client.upload(params, options).promise();
    }

    /**
     * Get download stream
     * @method getDownloadStream
     * @param {Object}             config                Config object
     * @param {String}              config.cacheKey       Path to cache
     * @param {Promise}                                   Resolve with a stream if request succeeds, reject with boom object
     */
    getDownloadStream({ cacheKey }) {
        // get a download stream from s3
        const params = {
            Bucket: this.bucket,
            Key: this.getStoragePathForKey(cacheKey)
        };

        return new Promise((resolve, reject) => {
            const req = this.client.getObject(params);
            let s3stream;

            // check the header before returning a stream, if request failed, reject
            req.on('httpHeaders', (statusCode) => {
                if (statusCode >= 400) {
                    logger.error(`Fetch ${cacheKey} request failed: ${statusCode}`);

                    return reject(new Boom('Fetch cache request failed', { statusCode }));
                }

                return resolve(s3stream);
            });

            s3stream = req.createReadStream()
                .on('error', (error) => {
                    logger.error(`Error streaming ${cacheKey}: ${error}`);
                });

            return s3stream;
        });
    }
}

module.exports = AwsClient;
