'use strict';

const { assert } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const crypto = require('crypto');

sinon.assert.expose(assert, { prefix: '' });

describe('aws helper test', () => {
    const accessKeyId = 'TEST_ACCESS_KEY_ID';
    const secretAccessKey = 'TEST_SECRET_ACCESS_KEY';
    const region = 'TEST_REGION';
    const s3ForcePathStyle = 'false';
    const cacheKey = 'test';
    const testBucket = 'TEST_REGION';
    const localCache = 'THIS IS A TEST';
    const testMD5 = crypto.createHash('md5').update(localCache).digest('hex');
    let sdkMock;
    let AwsClient;
    let clientMock;
    let awsClient;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        clientMock = sinon.stub();
        clientMock.prototype.headObject = sinon.stub().yieldsAsync(null, {
            StorageClass: 'STANDARD',
            Metadata: {
                md5: testMD5
            }
        });
        clientMock.prototype.copyObject = sinon.stub().yieldsAsync(null);

        sdkMock = {
            S3: clientMock
        };

        mockery.registerMock('aws-sdk', sdkMock);

        // eslint-disable-next-line global-require
        AwsClient = require('../../helpers/aws.js');
        awsClient = new AwsClient({
            accessKeyId,
            secretAccessKey,
            region,
            s3ForcePathStyle,
            bucket: testBucket
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('update last modified', (done) => {
        const headParam = {
            Bucket: testBucket,
            Key: `caches/${cacheKey}`
        };
        const copyParam = {
            Bucket: testBucket,
            CopySource: `${testBucket}/caches/${cacheKey}`,
            Key: `caches/${cacheKey}`,
            StorageClass: 'STANDARD'
        };

        return awsClient.updateLastModified(cacheKey, (err) => {
            assert.calledWith(clientMock.prototype.headObject, headParam);
            assert.calledWith(clientMock.prototype.copyObject, copyParam);
            assert.isNull(err);
            done();
        });
    });

    it('returns err if fails to get headObject', (done) => {
        const err = new Error('failed to get headObject');

        clientMock.prototype.headObject = sinon.stub().yieldsAsync(err);

        return awsClient.updateLastModified(cacheKey, (e) => {
            assert.deepEqual(e, err);
            done();
        });
    });

    it('returns err if fails to copyObject', (done) => {
        const err = new Error('failed to copyObject');

        clientMock.prototype.copyObject = sinon.stub().yieldsAsync(err);

        return awsClient.updateLastModified(cacheKey, (e) => {
            assert.deepEqual(e, err);
            done();
        });
    });
});
