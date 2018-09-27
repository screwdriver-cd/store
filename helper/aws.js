'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');

class AwsClient {
    /**
     * Construct a Client
     * @method constructor
     * @param  {Object}    config
     * @param  {String}    config.accessKeyId
     * @param  {String}    config.secretAccessKey
     * @param  {String}    config.region
     * @param  {String}    config.endpoint
     * @param  {String}    config.forcePathStyle
     */
    constructor(config) {
        this.client = new AWS.S3({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: config.region,
            endpoint: config.endpoint,
            s3ForcePathStyle: config.forcePathStyle
        });
        this.bucket = config.bucket;
    }

    updateLastModified(cacheKey, callback) {
        let params = {
            Bucket: this.bucket,
            Key: cacheKey
        };

        // get StorageClass value
        return this.client.headObject(params, (err, data) => {
            if (err) {
                return callback(err);
            }

            params = {
                Bucket: this.bucket,
                CopySource: `${this.bucket}/v1/caches/${cacheKey}`,
                Key: cacheKey,
                StorageClass: data.StorageClass
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

    compareChecksum(localCache, cacheKey, callback) {
        const params = {
            Bucket: this.bucket,
            key: cacheKey
        };

        const localmd5 = crypto.createHash('md5').update(localCache).digest('hex');

        // get StorageClass value
        return this.client.headObject(params, (err, data) => {
            if (err) {
                return callback(err);
            }

            const remotemd5 = data.Metadata.md5;

            if (localmd5 !== remotemd5) {
                return callback(null, false);
            }

            return callback(null, true);
        });
    }
}

module.exports = AwsClient;
