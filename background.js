const localhost = /(^http|https):\/\/localhost(:\d+)?\//;
const attached = new Set();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  let debuggee = { tabId: tabId };

  if (localhost.test(changeInfo.url) && !attached.has(tabId)) {
    attached.add(tabId);
    chrome.debugger.attach(debuggee, '1.2', () => {
      if (chrome.runtime.lastError) {
        console.error('failed to attach', {
          debuggee: debuggee,
          error: chrome.runtime.lastError
        });
        return;
      }
      chrome.debugger.sendCommand(
        debuggee,
        'Network.setRequestInterception',
        {
          patterns: [{ resourceType: 'XHR' }, { resourceType: 'Fetch' }]
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('failed to send command', {
              debuggee: debuggee,
              error: chrome.runtime.lastError
            });
            return;
          }
        }
      );
    });
    return;
  }

  if (changeInfo.url && attached.has(tabId)) {
    attached.delete(tabId);
    chrome.debugger.detach(debuggee, () => {
      if (chrome.runtime.lastError) {
        console.error('failed to detach', {
          debuggee: debuggee,
          error: chrome.runtime.lastError
        });
        return;
      }
    });
    return;
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Network.requestIntercepted') {
    if (params.request.method.toLowerCase() === 'options') {
      console.log('override options response', params);
      chrome.debugger.sendCommand(
        source,
        'Network.continueInterceptedRequest',
        {
          interceptionId: params.interceptionId,
          rawResponse: btoa(
            'HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: ' +
              params.request.headers.Origin +
              '\r\nAccess-Control-Allow-Methods: *\r\nAccess-Control-Allow-Headers: *\r\n' +
              'Access-Control-Allow-Credentials: true\r\nAccess-Control-Max-Age: 86400\r\n' +
              'Content-Type: text/plain\r\nContent-Length: 0\r\n\r\n'
          )
        }
      );
      return;
    }

    console.log('continue request', params);
    chrome.debugger.sendCommand(source, 'Network.continueInterceptedRequest', {
      interceptionId: params.interceptionId
    });
  }
});
