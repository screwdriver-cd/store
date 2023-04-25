'use strict';

const { assert, expect } = require('chai');
const mockery = require('mockery');
const sinon = require('sinon');
const crypto = require('crypto');
const stream = require('stream');
const { EventEmitter } = require('events');
const util = require('util');

sinon.assert.expose(assert, { prefix: '' });

describe('aws helper test', () => {
    const accessKeyId = 'TEST_ACCESS_KEY_ID';
    const secretAccessKey = 'TEST_SECRET_ACCESS_KEY';
    const region = 'TEST_REGION';
    const s3ForcePathStyle = 'false';
    const cacheKey = 'test';
    const objectKey = 'test';
    const testBucket = 'TEST_REGION';
    const localCache = 'THIS IS A TEST';
    const partSize = 10 * 1024 * 1024;
    const testMD5 = crypto.createHash('md5').update(localCache).digest('hex');
    const TestStream = class extends stream.Readable {
        _read() {}
    };
    let sdkMock;
    let AwsClient;
    let clientMock;
    let awsClient;
    let AwsRequestMock;
    let testAwsRequest;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        clientMock = sinon.stub();
        AwsRequestMock = sinon.stub();
        AwsRequestMock.prototype.createReadStream = () => new TestStream();
        util.inherits(AwsRequestMock, EventEmitter);
        testAwsRequest = new AwsRequestMock();
        clientMock.prototype.headObject = sinon.stub().yieldsAsync(null, {
            StorageClass: 'STANDARD',
            Metadata: {
                md5: testMD5
            }
        });
        clientMock.prototype.copyObject = sinon.stub().yieldsAsync(null);
        clientMock.prototype.getObject = sinon.stub().returns(testAwsRequest);
        clientMock.prototype.upload = sinon.stub().returns({
            promise: sinon.stub().resolves(null)
        });
        clientMock.prototype.deleteObject = sinon.stub().yieldsAsync(null);

        sdkMock = {
            S3: clientMock
        };

        mockery.registerMock('aws-sdk', sdkMock);

        // eslint-disable-next-line global-require
        AwsClient = require('../../helpers/aws');
        awsClient = new AwsClient({
            accessKeyId,
            secretAccessKey,
            region,
            s3ForcePathStyle,
            bucket: testBucket,
            segment: 'caches',
            partSize
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    it('update last modified', done => {
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

        return awsClient.updateLastModified(cacheKey, err => {
            assert.calledWith(clientMock.prototype.headObject, headParam);
            assert.calledWith(clientMock.prototype.copyObject, copyParam);
            assert.isNull(err);
            done();
        });
    });

    it('returns err if fails to get headObject', done => {
        const err = new Error('failed to get headObject');

        clientMock.prototype.headObject = sinon.stub().yieldsAsync(err);

        return awsClient.updateLastModified(cacheKey, e => {
            assert.deepEqual(e, err);
            done();
        });
    });

    it('returns err if fails to copyObject', done => {
        const err = new Error('failed to copyObject');

        clientMock.prototype.copyObject = sinon.stub().yieldsAsync(err);

        return awsClient.updateLastModified(cacheKey, e => {
            assert.deepEqual(e, err);
            done();
        });
    });

    it('returns err if fails to listObjects', done => {
        const err = new Error('failed to run listObjects');

        clientMock.prototype.listObjects = sinon.stub().yieldsAsync(err);

        return awsClient.invalidateCache(cacheKey, e => {
            assert.deepEqual(e, err);
            done();
        });
    });

    it('returns err if fails to invalidate cache', done => {
        const err = new Error('failed to invalidate cache');

        clientMock.prototype.listObjects = sinon.stub().yieldsAsync(err);

        return awsClient.invalidateCache(cacheKey, e => {
            assert.deepEqual(e, err);
            done();
        });
    });

    it('returns err if fails to deleteObject', async () => {
        const err = new Error('failed to run deleteObjects');

        err.code = 500;
        clientMock.prototype.deleteObject = sinon.stub().yieldsAsync(err);

        return awsClient
            .removeObject(objectKey, () => {
                assert.fail('never reach here.');
            })
            .catch(e => {
                assert.deepEqual(e, err);
            });
    });

    it('uploads data as stream', () => {
        const uploadParam = {
            Bucket: testBucket,
            Key: `caches/${cacheKey}`
        };
        const uploadOption = {
            partSize
        };

        return awsClient.uploadAsStream({ cacheKey, payload: new TestStream() }).then(() => {
            assert.calledWith(clientMock.prototype.upload, sinon.match(uploadParam), sinon.match(uploadOption));
        });
    });

    it('upload command as stream', () => {
        const uploadParam = {
            Bucket: testBucket,
            Key: `command/${cacheKey}`
        };
        const uploadOption = {
            partSize
        };

        awsClient.segment = 'command';

        return awsClient.uploadCommandAsStream({ cacheKey, payload: Buffer.from('hellow world', 'utf8') }).then(() => {
            assert.calledWith(clientMock.prototype.upload, sinon.match(uploadParam), sinon.match(uploadOption));
        });
    });

    it('resolves a download stream', () => {
        const getParam = {
            Bucket: testBucket,
            Key: `caches/${cacheKey}`
        };

        // emit the event after the function is called
        setTimeout(() => {
            testAwsRequest.emit('httpHeaders', 200);
        }, 0);

        return awsClient.getDownloadStream({ cacheKey }).then(({ s3Stream: data }) => {
            assert.calledWith(clientMock.prototype.getObject, getParam);
            assert.isTrue(data instanceof TestStream);
        });
    });

    it('return error if getDownload fails to fetch', function () {
        const err = new Error('Fetch request failed');

        err.code = 500;
        clientMock.prototype.getObject = sinon.stub().yieldsAsync(err, '');

        return awsClient.getDownloadObject({ objectKey }).catch(error => assert.equal(error.message, err.message));
    });

    it('try downloading command', function () {
        const value = '{ "data2": "test string" }';
        const data = {
            Body: value,
            contentType: 'application/json',
            Metadata: {}
        };

        const resp = Object.create(data);

        clientMock.prototype.getObject = sinon.stub().yields(null, resp);

        return awsClient
            .getDownloadObject({ objectKey })
            .then(result => expect(result).have.property('data2', 'test string'));
    });

    it('returns error if return command is not JSON', function () {
        const err = new Error('Fetch request failed');

        clientMock.prototype.getObject = sinon.stub().yields(err);

        return awsClient.getDownloadObject({ objectKey }).then(
            () => Promise.reject(err),
            e => assert.instanceOf(e, Error)
        );
    });

    it('rejects with a boom object if getObject request failed', () => {
        const getParam = {
            Bucket: testBucket,
            Key: `caches/${cacheKey}`
        };

        // emit the event after the function is called
        setTimeout(() => {
            testAwsRequest.emit('httpHeaders', 404);
        }, 0);

        return awsClient.getDownloadStream({ cacheKey }).catch(err => {
            assert.calledWith(clientMock.prototype.getObject, getParam);
            assert.deepEqual(err.isBoom, true);
            assert.deepEqual(err.output.statusCode, 404);
        });
    });
});
