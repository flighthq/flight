import { emitSignal } from '@flighthq/signals';
import type {
  NetBackend,
  NetProgress,
  NetRequest,
  NetRequestOptions,
  NetResponse,
  NetResponseBody,
  NetResponseType,
  Signal,
} from '@flighthq/types';

// Builds the default web backend over fetch + AbortController. Created lazily by getNetBackend — no
// fetch binding happens at import time, so importing the package has no side effect. Expected
// transport failures (network error, DNS, timeout, caller abort) resolve to a sentinel NetResponse
// (status 0, ok false) rather than rejecting; a non-2xx HTTP response is a normal NetResponse with
// its real status and ok false. Only genuine misuse (a request no correct caller could produce)
// surfaces as a thrown error from fetch itself.
export function createWebNetBackend(): NetBackend {
  return {
    async sendNetRequest(request, options): Promise<NetResponse> {
      const controller = new AbortController();
      const teardownAbort = _wireNetAbort(controller, request.timeoutMs, options?.signal);
      try {
        const response = await fetch(request.url, _toNetFetchInit(request, controller.signal));
        const headers = _readNetResponseHeaders(response.headers);
        const body = await _readNetResponseBody(response, request.responseType ?? 'text', options?.progress);
        return {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers,
          body,
          url: response.url !== '' ? response.url : request.url,
        };
      } catch (error) {
        return _netTransportFailure(request.url, controller.signal, error);
      } finally {
        teardownAbort();
      }
    },
  };
}

// The active net backend, lazily defaulting to the web fetch backend. There is always a backend.
export function getNetBackend(): NetBackend {
  if (_backend === null) _backend = createWebNetBackend();
  return _backend;
}

// Issues one HTTP(S) request through the active backend and resolves to a plain-data NetResponse.
// Expected transport failures resolve as a sentinel response (status 0, ok false); a non-2xx status
// is a normal response with ok false. Progress and cancellation come from options.
export function sendNetRequest(
  request: Readonly<NetRequest>,
  options?: Readonly<NetRequestOptions>,
): Promise<NetResponse> {
  return getNetBackend().sendNetRequest(request, options);
}

// Installs a native host transport backend; pass null to fall back to the lazy web default.
export function setNetBackend(backend: NetBackend | null): void {
  _backend = backend;
}

let _backend: NetBackend | null = null;

// A sentinel abort reason so a timeout-triggered abort is distinguishable from a caller abort.
const _netTimeoutReason = { flightNetTimeout: true } as const;

// Reads the numeric Content-Length, or -1 when it is absent or unparseable.
function _netContentLength(headers: Headers): number {
  const raw = headers.get('content-length');
  if (raw === null) return -1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
}

// Maps a fetch failure onto a sentinel NetResponse. A timeout and a caller abort are distinguished by
// the controller's abort reason; any other rejection is reported as a network error.
function _netTransportFailure(url: string, signal: AbortSignal, error: unknown): NetResponse {
  let statusText = 'network error';
  if (signal.aborted) {
    statusText = signal.reason === _netTimeoutReason ? 'timeout' : 'aborted';
  } else if (error instanceof Error && error.message !== '') {
    statusText = error.message;
  }
  return { status: 0, statusText, ok: false, headers: {}, body: null, url };
}

// Decodes an assembled byte buffer per the response type. JSON parse failure resolves to null rather
// than throwing — a malformed JSON body is an expected-failure surface, not programmer error.
function _decodeNetBuffer(buffer: ArrayBuffer, responseType: NetResponseType): NetResponseBody {
  if (responseType === 'arraybuffer') return buffer;
  if (responseType === 'blob') return new Blob([buffer]);
  const text = new TextDecoder().decode(buffer);
  if (responseType === 'json') {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  return text;
}

// Reads the whole response body, decoding it per responseType. When a progress signal is supplied the
// download stream is drained chunk-by-chunk so progress ticks can be emitted; otherwise the native
// per-type reader is used directly.
async function _readNetResponseBody(
  response: Response,
  responseType: NetResponseType,
  progress: Signal<(progress: Readonly<NetProgress>) => void> | undefined,
): Promise<NetResponseBody> {
  if (progress !== undefined) {
    const buffer = await _readNetResponseWithProgress(response, progress);
    return _decodeNetBuffer(buffer, responseType);
  }
  if (responseType === 'arraybuffer') return await response.arrayBuffer();
  if (responseType === 'blob') return await response.blob();
  if (responseType === 'json') {
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }
  return await response.text();
}

// Collects the response body as bytes while emitting download progress ticks. Falls back to a single
// whole-body read (with one terminal tick) when the response exposes no readable stream.
async function _readNetResponseWithProgress(
  response: Response,
  progress: Signal<(progress: Readonly<NetProgress>) => void>,
): Promise<ArrayBuffer> {
  const total = _netContentLength(response.headers);
  const stream = response.body;
  if (stream === null || typeof stream.getReader !== 'function') {
    const buffer = await response.arrayBuffer();
    emitSignal(progress, {
      phase: 'download',
      loaded: buffer.byteLength,
      total: total >= 0 ? total : buffer.byteLength,
    });
    return buffer;
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    chunks.push(value);
    loaded += value.byteLength;
    emitSignal(progress, { phase: 'download', loaded, total: total >= 0 ? total : 0 });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

// Copies the response's headers into a plain, case-insensitive-keyed record.
function _readNetResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

// Maps a NetRequest onto a fetch RequestInit, wiring the merged abort signal. A null/absent body is
// left off entirely so bodyless methods (GET/HEAD) are valid.
function _toNetFetchInit(request: Readonly<NetRequest>, signal: AbortSignal): RequestInit {
  const init: RequestInit = { method: request.method, signal };
  if (request.headers !== undefined) init.headers = { ...request.headers };
  if (request.body !== undefined && request.body !== null) init.body = request.body as BodyInit;
  if (request.credentials !== undefined) init.credentials = request.credentials;
  if (request.redirect !== undefined) init.redirect = request.redirect;
  return init;
}

// Wires the request timeout and the caller's abort signal into one controller. Returns a teardown
// that clears the timer and detaches the caller listener. A timeout aborts with a sentinel reason so
// the failure path can label it 'timeout' rather than 'aborted'.
function _wireNetAbort(
  controller: AbortController,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (typeof timeoutMs === 'number' && timeoutMs >= 0) {
    timer = setTimeout(() => controller.abort(_netTimeoutReason), timeoutMs);
  }
  let onAbort: (() => void) | null = null;
  if (signal !== undefined) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      onAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onAbort);
    }
  }
  return () => {
    if (timer !== null) clearTimeout(timer);
    if (onAbort !== null && signal !== undefined) signal.removeEventListener('abort', onAbort);
  };
}
