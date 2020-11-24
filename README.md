# Artifact Store
[![Version][npm-image]][npm-url] [![Pulls][docker-pulls]][docker-url] [![Stars][docker-stars]][docker-url] [![Build Status][status-image]][status-url] [![Open Issues][issues-image]][issues-url] [![Vulnerabilities][vul-image]][vul-url] ![License][license-image]

> Pluggable Artifact Store (for logs, shared steps, templates, etc).

This system provides a simple interface for builds to use the existing JWT to write artifacts (logs,
test results, etc).  By default, it uses a simple in-memory storage (which is destroyed on restart).
It can easily be configured to use alternative storage locations like S3.

## Usage

### Prerequisites

- Node v8.9.0 or higher

### From Source

```bash
$ git clone git@github.com:screwdriver-cd/store.git ./
$ npm install
$ vim ./config/local.yaml # See below for configuration
$ npm start
info: Server running at http://localhost
```

### Pre-built Docker image

```bash
$ vim ./local.yaml # See below for configuration
$ docker run --rm -it --volume=`pwd`/local.yaml:/config/local.yaml -p 8080 screwdrivercd/store:latest
info: Server running at http://localhost
```

## Configuration

Screwdriver already [defaults most configuration](config/default.yaml), but you can override defaults using a `local.yaml` or environment variables.

### Yaml

Example overriding `local.yaml`:

```yaml
strategy:
    plugin: memory

httpd:
    port: 8080
```

### Environment

Example overriding with environment variables:

```bash
$ export STRATEGY=memory
$ export PORT=8080
```

All the possible environment variables are [defined here](config/custom-environment-variables.yaml).

## Storage Strategies

Right now we're using [catbox](https://github.com/hapijs/catbox) for storage, so we can support any of their plugins (Redis, S3, Memcached, etc.).  We only installed the [memory](https://github.com/hapijs/catbox-memory) and [S3](https://github.com/fhemberger/catbox-s3) ones for now.

Or if you want to use [`disk`](https://github.com/mirusresearch/catbox-disk) strategy as to persist cache, you can config as following, please be sure to create `./store-data` as a local directory though

```
strategy:
    plugin: disk
    disk:
        cachePath: './store-data'
        cleanEvery: 3600000
        partition : 'cache'
```

## Testing

```bash
$ npm test
```

## License

Code licensed under the BSD 3-Clause license. See LICENSE file for terms.

[npm-image]: https://img.shields.io/npm/v/screwdriver-store.svg
[npm-url]: https://npmjs.org/package/screwdriver-store
[vul-image]: https://snyk.io/test/github/screwdriver-cd/store.git/badge.svg
[vul-url]: https://snyk.io/test/github/screwdriver-cd/store.git
[docker-pulls]: https://img.shields.io/docker/pulls/screwdrivercd/store.svg
[docker-stars]: https://img.shields.io/docker/stars/screwdrivercd/store.svg
[docker-url]: https://hub.docker.com/r/screwdrivercd/store/
[license-image]: https://img.shields.io/npm/l/screwdriver-store.svg
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/screwdriver.svg
[issues-url]: https://github.com/screwdriver-cd/screwdriver/issues
[status-image]: https://cd.screwdriver.cd/pipelines/24/badge
[status-url]: https://cd.screwdriver.cd/pipelines/24
