import type { HostNetProvider, NetGuardNotice, NetRequest, NetResponse } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as netContract from './net';
import { explainNetResponse, sendNetRequest, setNetGuard } from './net';

function fakeHost(backend?: Pick<HostNetProvider, 'sendNetRequest'>): {
  readonly net: { readonly http: HostNetProvider };
} {
  return {
    net: {
      http: {
        [EntityRuntimeKey]: undefined,
        ...(backend ?? {
          sendNetRequest: async () => stubResponse(),
        }),
      },
    },
  };
}

function stubResponse(): NetResponse {
  return { status: 200, statusText: 'OK', ok: true, headers: {}, body: null, url: 'u' };
}

describe('explainNetResponse', () => {
  it('derives specific abort and timeout reasons from transport status text', () => {
    expect(explainNetResponse({ ...stubResponse(), body: null, status: 0, statusText: 'aborted' })).toMatchObject({
      reason: 'aborted',
      status: 0,
    });
    expect(explainNetResponse({ ...stubResponse(), body: null, status: 0, statusText: 'timeout' })).toMatchObject({
      reason: 'timeout',
      status: 0,
    });
  });

  it('distinguishes generic transport and decode failures', () => {
    expect(
      explainNetResponse({ ...stubResponse(), body: null, status: 0, statusText: 'Failed to fetch' }),
    ).toMatchObject({ reason: 'transport-failure', statusText: 'Failed to fetch' });
    expect(explainNetResponse({ ...stubResponse(), body: null })).toMatchObject({
      reason: 'decode-failure',
      status: 200,
    });
  });

  it('returns null when the response carries no failure sentinel', () => {
    expect(explainNetResponse({ ...stubResponse(), body: 'ok' })).toBeNull();
  });
});

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
    const backend: Pick<HostNetProvider, 'sendNetRequest'> = {
      sendNetRequest: async (request, options) => {
        received = { request, options };
        return stubResponse();
      },
    };
    const host = fakeHost(backend);
    const request: NetRequest = { method: 'GET', url: 'https://example.test' };
    const options = {};
    await sendNetRequest(host.net.http, request, options);
    expect(received.request).toBe(request);
    expect(received.options).toBe(options);
  });

  it('passes the response through unchanged', async () => {
    const response = stubResponse();
    const host = fakeHost({ sendNetRequest: async () => response });
    const result = await sendNetRequest(host.net.http, { method: 'GET', url: 'u' });
    expect(result).toBe(response);
  });
});

describe('setNetGuard', () => {
  it('installs and removes the core request notice hook', async () => {
    const notices: NetGuardNotice[] = [];
    setNetGuard((notice) => notices.push(notice));
    const host = fakeHost();
    await sendNetRequest(host.net.http, { body: 'x', method: 'get', timeoutMs: -1, url: 'u' });
    setNetGuard(null);
    await sendNetRequest(host.net.http, { body: 'x', method: 'HEAD', url: 'v' });
    expect(notices.map((notice) => notice.reason)).toEqual(['body-on-get-or-head', 'negative-timeout']);
  });
});
