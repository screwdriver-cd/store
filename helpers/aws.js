'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');

class AwsClient {
    /**
     * Construct a Client
     * @method constructor
     * @param  {Object}    config
     * @param  {String}    config.accessKeyId        AWS access key ID.
     * @param  {String}    config.secretAccessKey    AWS secret access key.
     * @param  {String}    config.region             the region to send service requests to
     * @param  {String}    config.forcePathStyle     whether to force path style URLs for S3 objects
     * @param  {String}    config.bucket             s3 bucket
     */
    constructor(config) {
        this.client = new AWS.S3({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            region: config.region,
            s3ForcePathStyle: config.forcePathStyle
        });
        this.bucket = config.bucket;
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
            Key: cacheKey
        };

        // get StorageClass value
        return this.client.headObject(params, (err, data) => {
            if (err) {
                return callback(err);
            }

            params = {
                Bucket: this.bucket,
                CopySource: `${this.bucket}/caches/${cacheKey}`,
                Key: cacheKey,
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
     * Compare the checksum of local cache with the one in S3
     * @method compareChecksum
     * @param  {String}        localCache     content of localFile
     * @param  {String}        cacheKey       cache key
     * @param  {Function}      callback       callback function
     */
    compareChecksum(localCache, cacheKey, callback) {
        const params = {
            Bucket: this.bucket,
            Key: cacheKey
        };
        const localmd5 = crypto.createHash('md5').update(localCache).digest('hex');

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
