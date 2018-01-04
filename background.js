const localhost = /(^http|https):\/\/localhost(:\d+)?\//;
const attached = new Set();
const origins = new Map();

const allowOriginHeader = 'Access-Control-Allow-Origin';
const allowHeadersHeader = 'Access-Control-Allow-Headers';
const allowMethodsHeader = 'Access-Control-Allow-Methods';
const allowCredentialsHeader = 'Access-Control-Allow-Credentials';
const maxAgeHeader = 'Access-Control-Max-Age';
const requestHeadersHeader = 'Access-Control-Request-Headers';
const requestMethodHeader = 'Access-Control-Request-Method';
const originHeader = 'Origin';
const optionsMethod = 'OPTIONS';

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

    chrome.webRequest.onBeforeSendHeaders.addListener(
      onBeforeSendHeadersHandler,
      {
        urls: ['<all_urls>'],
        tabId: tabId
      },
      ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
      onHeadersReceivedHandler,
      {
        urls: ['<all_urls>'],
        tabId: tabId
      },
      ['blocking', 'responseHeaders']
    );
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
    if (params.request.method.toLowerCase() === optionsMethod.toLowerCase()) {
      chrome.debugger.sendCommand(
        source,
        'Network.continueInterceptedRequest',
        {
          interceptionId: params.interceptionId,
          rawResponse: btoa(
            `HTTP/1.1 200 OK\r\n${allowOriginHeader}: ` +
              params.request.headers.Origin +
              `\r\n${allowHeadersHeader}: ` +
              params.request.headers[`${requestHeadersHeader}`] +
              `\r\n${allowMethodsHeader}: ` +
              params.request.headers[`${requestMethodHeader}`] +
              `\r\n${allowCredentialsHeader}: true` +
              `\r\n${maxAgeHeader}: 600` +
              '\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n\r\n'
          )
        }
      );
      return;
    }

    chrome.debugger.sendCommand(source, 'Network.continueInterceptedRequest', {
      interceptionId: params.interceptionId
    });
  }
});

function onBeforeSendHeadersHandler(details) {
  let header = details.requestHeaders.find(h => {
    return h.name.toLowerCase() === originHeader.toLowerCase();
  });

  if (header) {
    origins.set(details.requestId, header.value);
  }
}

function onHeadersReceivedHandler(details) {
  if (details.method.toLowerCase() !== optionsMethod.toLowerCase()) {
    addIfNotExist(
      details.responseHeaders,
      allowOriginHeader,
      origins.get(details.requestId) || '*'
    );
    addIfNotExist(
      details.responseHeaders,
      'Access-Control-Expose-Headers',
      'Rpc-Status'
    );
    addIfNotExist(details.responseHeaders, allowCredentialsHeader, 'true');
  }

  origins.delete(details.requestId);

  return { responseHeaders: details.responseHeaders };
}

function addIfNotExist(headers, key, value) {
  let index = headers.findIndex(h => {
    return h.name.toLowerCase() === key.toLowerCase();
  });

  if (index === -1) {
    headers.push({
      name: key,
      value: value
    });
  }
}
