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
          let originalHref = anchor.attributes.href.value;
          if (isAbsolutePath(originalHref)) {
              continue;
          }
          const newUrl = apiUrlOrigin + '/' + apiVersion + '/' + urlFileDir + '/' + originalHref;
          anchor.href = newUrl.replace('ARTIFACTS', 'artifacts') + '?type=preview';
          anchor.addEventListener('click', function(e) {
              top.postMessage({ state: 'redirect', href: anchor.href }, '*');
              e.preventDefault();
          });
        }
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
