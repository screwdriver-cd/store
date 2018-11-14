'use strict';

const AWS = require('aws-sdk');

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

            if (data.isTruncated) return callback();

            params = { Bucket: this.bucket };
            params.Delete = { Objects: [] };

            data.Contents.forEach((content) => {
                params.Delete.Objects.push({ Key: content.Key });
            });

            return this.client.deleteObjects(params, (err, res) => {
                if (err) return callback(err);
                if (res.isTruncated) return self.invalidateCache(this.bucket, callback);

                return callback();
            });
        });
    }
}

module.exports = AwsClient;
