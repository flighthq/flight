import { createSignal } from '@flighthq/signals';
import type { NetBackend, NetProgress, NetRequest, NetResponse } from '@flighthq/types';

import { createWebNetBackend, getNetBackend, sendNetRequest, setNetBackend } from './net';

interface FakeResponseInit {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  url?: string;
  text?: string;
  json?: unknown;
  arraybuffer?: ArrayBuffer;
  blob?: Blob;
  streamChunks?: Uint8Array[];
}

function fakeResponse(init: FakeResponseInit): Response {
  const status = init.status ?? 200;
  const headerMap = new Map<string, string>(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const headers = {
    get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    forEach: (cb: (value: string, key: string) => void) => headerMap.forEach((v, k) => cb(v, k)),
  };
  const body =
    init.streamChunks !== undefined ? { getReader: () => makeReader(init.streamChunks as Uint8Array[]) } : null;
  return {
    status,
    statusText: init.statusText ?? '',
    ok: status >= 200 && status < 300,
    url: init.url ?? '',
    headers,
    body,
    text: async () => init.text ?? '',
    json: async () => {
      if (init.json === undefined) throw new SyntaxError('no json');
      return init.json;
    },
    arrayBuffer: async () => init.arraybuffer ?? new ArrayBuffer(0),
    blob: async () => init.blob ?? new Blob([]),
  } as unknown as Response;
}

function makeReader(chunks: readonly Uint8Array[]): { read: () => Promise<{ done: boolean; value?: Uint8Array }> } {
  let i = 0;
  return {
    read: async () => {
      if (i < chunks.length) {
        const value = chunks[i];
        i += 1;
        return { done: false, value };
      }
      return { done: true, value: undefined };
    },
  };
}

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
  setNetBackend(null);
});

describe('createWebNetBackend', () => {
  it('maps method, headers, and body onto the fetch init', async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return fakeResponse({ status: 200, text: 'ok' });
    }) as unknown as typeof fetch;
    const backend = createWebNetBackend();
    const request: NetRequest = {
      method: 'POST',
      url: 'https://example.test/api',
      headers: { 'X-Token': 'abc' },
      body: 'payload',
    };
    await backend.sendNetRequest(request);
    expect(captured.url).toBe('https://example.test/api');
    expect(captured.init?.method).toBe('POST');
    expect(captured.init?.headers).toEqual({ 'X-Token': 'abc' });
    expect(captured.init?.body).toBe('payload');
    expect(captured.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits the body for a bodyless request', async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string, i: RequestInit) => {
      init = i;
      return fakeResponse({ status: 200, text: '' });
    }) as unknown as typeof fetch;
    await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'https://example.test' });
    expect(init?.body).toBeUndefined();
  });

  it('decodes a text response', async () => {
    globalThis.fetch = (async () => fakeResponse({ text: 'hello' })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', responseType: 'text' });
    expect(res.body).toBe('hello');
    expect(res.ok).toBe(true);
  });

  it('decodes a json response', async () => {
    globalThis.fetch = (async () => fakeResponse({ json: { x: 1 } })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', responseType: 'json' });
    expect(res.body).toEqual({ x: 1 });
  });

  it('returns null for a malformed json body without throwing', async () => {
    globalThis.fetch = (async () => fakeResponse({ status: 200 })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', responseType: 'json' });
    expect(res.body).toBeNull();
    expect(res.ok).toBe(true);
  });

  it('decodes an arraybuffer response', async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    globalThis.fetch = (async () => fakeResponse({ arraybuffer: buffer })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', responseType: 'arraybuffer' });
    expect(res.body).toBe(buffer);
  });

  it('decodes a blob response', async () => {
    const blob = new Blob(['x']);
    globalThis.fetch = (async () => fakeResponse({ blob })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', responseType: 'blob' });
    expect(res.body).toBe(blob);
  });

  it('surfaces a non-2xx response as ok:false with the real status, not a throw', async () => {
    globalThis.fetch = (async () =>
      fakeResponse({ status: 404, statusText: 'Not Found', text: 'nope' })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u' });
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(res.statusText).toBe('Not Found');
    expect(res.body).toBe('nope');
  });

  it('resolves a thrown fetch (network error) to a sentinel response', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u' });
    expect(res.status).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.statusText).toBe('Failed to fetch');
    expect(res.body).toBeNull();
  });

  it('resolves a timeout to an aborted sentinel labeled timeout', async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u', timeoutMs: 5 });
    expect(res.status).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.statusText).toBe('timeout');
  });

  it('resolves a caller abort to an aborted sentinel', async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const controller = new AbortController();
    const promise = createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u' }, { signal: controller.signal });
    controller.abort();
    const res = await promise;
    expect(res.status).toBe(0);
    expect(res.statusText).toBe('aborted');
  });

  it('emits download progress ticks when a progress signal is supplied', async () => {
    globalThis.fetch = (async () =>
      fakeResponse({
        headers: { 'content-length': '5' },
        streamChunks: [new Uint8Array([104, 105]), new Uint8Array([33, 33, 33])],
      })) as unknown as typeof fetch;
    const progress = createSignal<(progress: Readonly<NetProgress>) => void>();
    const ticks: NetProgress[] = [];
    progress.emit = (tick) => ticks.push({ ...tick });
    const res = await createWebNetBackend().sendNetRequest(
      { method: 'GET', url: 'u', responseType: 'text' },
      { progress },
    );
    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toEqual({ phase: 'download', loaded: 2, total: 5 });
    expect(ticks[1]).toEqual({ phase: 'download', loaded: 5, total: 5 });
    expect(res.body).toBe('hi!!!');
  });

  it('reads response headers into a plain record', async () => {
    globalThis.fetch = (async () =>
      fakeResponse({ headers: { 'content-type': 'text/plain' }, text: 'x' })) as unknown as typeof fetch;
    const res = await createWebNetBackend().sendNetRequest({ method: 'GET', url: 'u' });
    expect(res.headers['content-type']).toBe('text/plain');
  });
});

describe('getNetBackend', () => {
  it('lazily returns a web backend by default', () => {
    expect(getNetBackend()).not.toBeNull();
    expect(typeof getNetBackend().sendNetRequest).toBe('function');
  });

  it('returns the installed backend', () => {
    const backend: NetBackend = { sendNetRequest: async () => stubResponse() };
    setNetBackend(backend);
    expect(getNetBackend()).toBe(backend);
  });
});

describe('sendNetRequest', () => {
  it('dispatches through the active backend and passes options', async () => {
    let received: { request?: Readonly<NetRequest>; options?: unknown } = {};
    const backend: NetBackend = {
      sendNetRequest: async (request, options) => {
        received = { request, options };
        return stubResponse();
      },
    };
    setNetBackend(backend);
    const request: NetRequest = { method: 'GET', url: 'https://example.test' };
    const options = {};
    await sendNetRequest(request, options);
    expect(received.request).toBe(request);
    expect(received.options).toBe(options);
  });

  it('passes the response through unchanged', async () => {
    const response = stubResponse();
    setNetBackend({ sendNetRequest: async () => response });
    const result = await sendNetRequest({ method: 'GET', url: 'u' });
    expect(result).toBe(response);
  });
});

describe('setNetBackend', () => {
  it('restores the lazy web default when passed null', () => {
    const backend: NetBackend = { sendNetRequest: async () => stubResponse() };
    setNetBackend(backend);
    expect(getNetBackend()).toBe(backend);
    setNetBackend(null);
    const web = getNetBackend();
    expect(web).not.toBe(backend);
    expect(typeof web.sendNetRequest).toBe('function');
  });
});

function stubResponse(): NetResponse {
  return { status: 200, statusText: 'OK', ok: true, headers: {}, body: null, url: 'u' };
}
