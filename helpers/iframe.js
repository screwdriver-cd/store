'use strict';

const config = require('config');
const uiUrl = config.get('ecosystem.ui');

const iframeScript = `
    function replaceHref(apiHref) {
        const currentIframeHref = new URL(document.location.href);
        const urlOrigin = currentIframeHref.origin;
        const urlFilePath = decodeURIComponent(currentIframeHref.pathname);

        let urlFileDir = urlFilePath.split('/');
        urlFileDir = urlFileDir.slice(2, urlFileDir.length-1).join('/');

        const apiUrl = new URL(apiHref);
        const apiUrlOrigin = apiUrl.origin;
        const apiVersion = apiUrl.pathname.split('/')[1];

        const anchors = document.getElementsByTagName('a');
        for (let anchor of anchors) {
          let originalHref = anchor.attributes.href.value;
          const newUrl = apiUrlOrigin + '/' + apiVersion + '/' + urlFileDir + '/' + originalHref;
          anchor.href = newUrl.replace('ARTIFACTS', 'artifacts') + '?type=preview';
          anchor.addEventListener('click', function(e) {
              top.postMessage({
                  message: 'reroute',
                  href: anchor.href
              }, '*');
              e.preventDefault();
          });
        }
    }

    function replaceHrefLinks(e) {
        var message;
        if (e.origin !== "${uiUrl}") {
            const { cookie, headers, state } = e.data;
            if (state === 'ready') {
                replaceHref();
            }
        }
    }

    if (window.addEventListener) {
        // For standards-compliant web browsers
        window.addEventListener("message", replaceHrefLinks, false);
    } else {
        window.attachEvent("onmessage", replaceHrefLinks);
    }

    top.postMessage({
        message: 'iframe loaded',
        state: 'loaded'
    }, '*');`;

module.exports = {
    iframeScript
};
