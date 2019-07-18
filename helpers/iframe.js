'use strict';

const iframeScript = `
    function replaceHref(apiHref='http://localhost:9001/v4/builds/11/') {
        const currentIframeHref = new URL(document.location.href);
        const urlOrigin = currentIframeHref.origin;
        const urlFilePath = decodeURIComponent(currentIframeHref.pathname);

        let urlFileDir = urlFilePath.split('/');
        // urlFileDir.pop(); // remove last file name
        // urlFileDir = urlFileDir.join('/');
        urlFileDir = urlFileDir.slice(2, urlFileDir.length-1).join('/');

        const apiUrl = new URL(apiHref);
        const apiUrlOrigin = apiUrl.origin;
        const apiVersion = apiUrl.pathname.split('/')[1];

        const anchors = document.getElementsByTagName('a');
        for (let anchor of anchors) {
          // let originalHref = anchor.href;
          let originalHref = anchor.attributes.href.value;
          console.log('anchor.href before', anchor.href);
          // anchor.href = urlOrigin + urlFileDir + '/' + originalHref;
          const newUrl = apiUrlOrigin + '/' + apiVersion + '/' + urlFileDir + '/' + originalHref;
          anchor.href = newUrl.replace('ARTIFACTS', 'artifacts') + '?type=preview';
          console.log('anchor.href after', anchor.href);

          anchor.addEventListener('click',function(e) {
              top.postMessage({
                  message: 'reroute',
                  href: anchor.href
              }, '*');
              e.preventDefault();
          });
        }
    }

    function displayMessage(e) {
        console.log('displayMessage e', e);
        var message;
        if (e.origin !== "http://localhost:4200") {
            message = "You are not worthy";
        } else {
            // message = "I got " + e.data + " from " + e.origin;
            const { cookie, headers, state } = e.data;
            if (state === 'ready') {
                document.cookie = cookie;
                debugger;
                replaceHref();
            }
        }


        // top.postMessage({message: 'events iframe loaded'}, '*');
        // console.log('message', message);
    }

    if (window.addEventListener) {
        console.log('addEventListener added');
        // For standards-compliant web browsers
        window.addEventListener("message", displayMessage, false);
    } else {
        console.log('addEventListener onmessage added');
        window.attachEvent("onmessage", displayMessage);
    }

    top.postMessage({
        message: 'iframe loaded',
        state: 'loaded'
    }, '*');`;

module.exports = {
    iframeScript
};
