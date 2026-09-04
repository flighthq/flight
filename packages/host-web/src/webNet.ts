import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  NetBackend,
  NetProgress,
  NetRequest,
  NetResponse,
  NetResponseBody,
  NetResponseType,
  Signal,
} from '@flighthq/types/contract';

export function createWebNetBackend(): NetBackend {
    const out = allocateEntity<NetBackend>();
  out.sendNetRequest = async (request, options): Promise<NetResponse> => {
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
    };
  return finishEntity(out);
}

export const webNetBackend: NetBackend = createWebNetBackend();

const _netTimeoutReason = { flightNetTimeout: true } as const;

function _netContentLength(headers: Headers): number {
  const raw = headers.get('content-length');
  if (raw === null) return -1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
}

function _netTransportFailure(url: string, signal: AbortSignal, error: unknown): NetResponse {
  let statusText = 'network error';
  if (signal.aborted) {
    statusText = signal.reason === _netTimeoutReason ? 'timeout' : 'aborted';
  } else if (error instanceof Error && error.message !== '') {
    statusText = error.message;
  }
  return { status: 0, statusText, ok: false, headers: {}, body: null, url };
}

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

function _readNetResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function _toNetFetchInit(request: Readonly<NetRequest>, signal: AbortSignal): RequestInit {
  const init: RequestInit = { method: request.method, signal };
  if (request.headers !== undefined) init.headers = { ...request.headers };
  if (request.body !== undefined && request.body !== null) init.body = request.body as BodyInit;
  if (request.credentials !== undefined) init.credentials = request.credentials;
  if (request.redirect !== undefined) init.redirect = request.redirect;
  return init;
}

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
