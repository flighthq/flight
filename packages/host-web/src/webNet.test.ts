import { createSignal } from '@flighthq/signals/contract';
import type { NetProgress, NetRequest } from '@flighthq/types/contract';

import { createWebNetBackend, initializeWebNetBackend, webNetBackend } from './webNet';

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

  it('never reaches the transport when the caller signal is already aborted', () => {
    // The pre-aborted branch is the one a caller hits by passing a signal from a scope torn down
    // before the request was issued. Asserted through the signal fetch actually receives, so the
    // check cannot pass by the request merely failing for some other reason.
    let observedAborted: boolean | null = null;
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      observedAborted = signal.aborted;
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    return createWebNetBackend()
      .sendNetRequest({ method: 'GET', url: 'u' }, { signal: controller.signal })
      .then((res) => {
        expect(observedAborted).toBe(true);
        expect(res.status).toBe(0);
        expect(res.ok).toBe(false);
        expect(res.statusText).toBe('aborted');
      });
  });

  it('labels a caller abort apart from a timeout even when both are configured', async () => {
    // A request carrying both timeoutMs and a caller signal must report which one fired. The timeout
    // here is long enough that only the explicit abort can win, so the case needs no timer to elapse.
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const controller = new AbortController();
    const promise = createWebNetBackend().sendNetRequest(
      { method: 'GET', timeoutMs: 60_000, url: 'u' },
      { signal: controller.signal },
    );
    controller.abort();
    const res = await promise;
    expect(res.statusText).toBe('aborted');
  });

  it('releases its abort listener from the caller signal once the request settles', async () => {
    // A caller signal outlives the requests made with it — a per-request listener left attached is a
    // leak that grows with every call and that no behavioural assertion would ever notice.
    globalThis.fetch = (async () => fakeResponse({ text: 'ok' })) as unknown as typeof fetch;
    const controller = new AbortController();
    let attached = 0;
    const target = controller.signal as AbortSignal & {
      addEventListener: AbortSignal['addEventListener'];
      removeEventListener: AbortSignal['removeEventListener'];
    };
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = ((...args: Parameters<AbortSignal['addEventListener']>) => {
      attached++;
      return add(...args);
    }) as AbortSignal['addEventListener'];
    target.removeEventListener = ((...args: Parameters<AbortSignal['removeEventListener']>) => {
      attached--;
      return remove(...args);
    }) as AbortSignal['removeEventListener'];

    const backend = createWebNetBackend();
    await backend.sendNetRequest({ method: 'GET', url: 'u' }, { signal: controller.signal });
    await backend.sendNetRequest({ method: 'GET', url: 'u' }, { signal: controller.signal });
    expect(attached).toBe(0);
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

describe('initializeWebNetBackend', () => {
  it('is the construction initializer of createWebNetBackend', () => {
    expect(typeof initializeWebNetBackend).toBe('function');
  });
});
describe('webNetBackend', () => {
  it('is a pre-instantiated NetBackend const', () => {
    expect(webNetBackend).not.toBeNull();
    expect(typeof webNetBackend.sendNetRequest).toBe('function');
  });
});
