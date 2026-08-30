import type { HasNetHttp, NetBackend, NetRequest, NetResponse } from '@flighthq/types/contract';

import * as netContract from './net';
import { sendNetRequest } from './net';

function fakeHost(backend?: NetBackend): HasNetHttp {
  return {
    net: {
      http: backend ?? {
        sendNetRequest: async () => stubResponse(),
      },
    },
  };
}

function stubResponse(): NetResponse {
  return { status: 200, statusText: 'OK', ok: true, headers: {}, body: null, url: 'u' };
}

describe('R3 boundary', () => {
  it('exports no ambient-state API (setNetBackend, getNetBackend, etc.)', () => {
    const exports = Object.keys(netContract);
    const deletedSymbols = [
      'createWebNetBackend',
      'getNetBackend',
      'installNetHostBackend',
      'resetNetBackendForTest',
      'setNetBackend',
    ];
    for (const symbol of deletedSymbols) {
      expect(exports).not.toContain(symbol);
    }
  });
});

describe('sendNetRequest', () => {
  it('dispatches through the host backend and passes options', async () => {
    let received: { request?: Readonly<NetRequest>; options?: unknown } = {};
    const backend: NetBackend = {
      sendNetRequest: async (request, options) => {
        received = { request, options };
        return stubResponse();
      },
    };
    const host = fakeHost(backend);
    const request: NetRequest = { method: 'GET', url: 'https://example.test' };
    const options = {};
    await sendNetRequest(host, request, options);
    expect(received.request).toBe(request);
    expect(received.options).toBe(options);
  });

  it('passes the response through unchanged', async () => {
    const response = stubResponse();
    const host = fakeHost({ sendNetRequest: async () => response });
    const result = await sendNetRequest(host, { method: 'GET', url: 'u' });
    expect(result).toBe(response);
  });
});
