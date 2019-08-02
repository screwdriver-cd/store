'use strict';

const config = require('config');
const uiUrl = config.get('ecosystem.ui');
const apiUrl = config.get('ecosystem.api');
const apiVersion = 'v4';

const iframeScript = `
    function isAbsolutePath(href) {
        const absolutePath = new RegExp('^((http|https)://|#)');
        return absolutePath.test(href);
    };

    function maskWithAPI(apiUrlOrigin, apiVersion, urlFileDir, originalHref) {
        const newUrl = apiUrlOrigin + '/' + apiVersion + '/' + urlFileDir + '/' + originalHref;
        return newUrl.replace('ARTIFACTS', 'artifacts') + '?type=preview';
    }

    function replaceHref(apiHref='${apiUrl}') {
        const currentIframeHref = new URL(document.location.href);
        const urlOrigin = currentIframeHref.origin;
        const urlFilePath = decodeURIComponent(currentIframeHref.pathname);

        let urlFileDir = urlFilePath.split('/');
        urlFileDir = urlFileDir.slice(2, urlFileDir.length-1).join('/');

        const apiUrl = new URL(apiHref);
        const apiUrlOrigin = apiUrl.origin;
        const apiVersion = apiUrl.pathname.split('/')[1] || '${apiVersion}';

        const anchors = document.getElementsByTagName('a');
        for (let anchor of anchors) {
          if (anchor.attributes.href) {
              let originalHref = anchor.attributes.href.value;
              if (isAbsolutePath(originalHref)) {
                  continue;
              }
              anchor.href = maskWithAPI(apiUrlOrigin, apiVersion, urlFileDir, originalHref);
              anchor.addEventListener('click', function(e) {
                  top.postMessage({ state: 'redirect', href: anchor.href }, '*');
                  e.preventDefault();
              });
          }
        }

        const styleLinks = document.getElementsByTagName('link');
        for (let styleLink of styleLinks) {
            if (styleLink.attributes.href) {
                let originalHref = styleLink.attributes.href.value;
                if (isAbsolutePath(originalHref)) {
                    continue;
                }
                addCss(maskWithAPI(apiUrlOrigin, apiVersion, urlFileDir, originalHref));
            }
        }

        const jsLinks = document.getElementsByTagName('script');
        for (let jsLink of jsLinks) {
            if (jsLink.attributes.src) {
                let originalHref = jsLink.attributes.src.value;
                if (isAbsolutePath(originalHref)) {
                    continue;
                }
                addScript(maskWithAPI(apiUrlOrigin, apiVersion, urlFileDir, originalHref));
            }
        }
    }

    function addCss(src) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = src;
        document.head.appendChild(link);
    }

    function addScript(src) {
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.charset = 'utf-8';
        s.src = src;
        document.body.appendChild(s);
    }

    function replaceLinksMessage(e) {
        if ('${uiUrl}' === e.origin) {
            const { state } = e.data;
            if (state === 'ready') {
                replaceHref();
            }
        }
    }

    if (window.addEventListener) {
        // For standards-compliant web browsers
        window.addEventListener("message", replaceLinksMessage, false);
    } else {
        window.attachEvent("onmessage", replaceLinksMessage);
    }
    top.postMessage({ state: 'loaded' }, '*');`;

module.exports = {
    iframeScript
};
