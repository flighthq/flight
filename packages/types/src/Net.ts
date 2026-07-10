import type { Signal } from './Signal';

// HTTP(S) transport seam — the Flight home for what OpenFL/Lime expose as URLLoader/URLRequest.
// Free functions in @flighthq/net delegate to the active NetBackend (a fetch-based web default, or a
// native host's stack). Transport is async, so the backend returns a Promise<NetResponse>. Expected
// transport failures (DNS, network error, timeout, non-2xx) are surfaced as a NetResponse — a
// sentinel status 0 for a failed transport, the real status for an HTTP error response — never a
// rejected promise; only genuine programmer misuse throws. This is a command capability (request →
// response), distinct from @flighthq/connectivity connectivity status.

// HTTP request method. Open union: the well-known verbs plus any string, so a vendor or native host
// can issue a custom method. The `(string & {})` arm preserves autocomplete for the known verbs
// while still accepting any string.
export type NetMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});

// How the response body is decoded before it is placed on NetResponse.body: 'text' → string,
// 'json' → parsed value, 'arraybuffer' → ArrayBuffer, 'blob' → Blob. Defaults to 'text'.
export type NetResponseType = 'text' | 'json' | 'arraybuffer' | 'blob';

// Credentials mode for the request, mirroring the fetch semantics: 'omit' sends none, 'same-origin'
// sends them only for same-origin requests, 'include' always sends them.
export type NetCredentials = 'omit' | 'same-origin' | 'include';

// Redirect handling: 'follow' transparently follows 3xx redirects, 'error' fails the request on a
// redirect, 'manual' returns the redirect response without following it.
export type NetRedirect = 'follow' | 'error' | 'manual';

// Request body payloads the transport accepts as-is: `string` for text/JSON payloads, an ArrayBuffer
// or a typed-array view for binary, or null for a bodyless request (GET/HEAD). Higher-level encoders
// (form-data, multipart) compose over this by producing one of these forms.
export type NetBody = string | ArrayBuffer | ArrayBufferView | null;

// Decoded response body, keyed by the request's responseType: 'text' → string, 'json' → the parsed
// value (unknown — the caller narrows), 'arraybuffer' → ArrayBuffer, 'blob' → Blob. null when the
// response carried no body or decoding failed.
export type NetResponseBody = string | unknown | ArrayBuffer | Blob | null;

// A plain-data HTTP request descriptor. Only method and url are required; the rest carry fetch-level
// defaults when omitted (responseType 'text', redirect 'follow', credentials 'same-origin').
export interface NetRequest {
  method: NetMethod;
  url: string;
  headers?: Readonly<Record<string, string>>;
  body?: NetBody;
  responseType?: NetResponseType;
  timeoutMs?: number;
  credentials?: NetCredentials;
  redirect?: NetRedirect;
}

// A plain-data HTTP response. `ok` is true for a 2xx status. `status` is 0 with `ok` false for a
// failed transport (network error, DNS, timeout, caller abort); the real status otherwise. `body` is
// decoded per the request's responseType. `url` is the final URL after any followed redirects.
export interface NetResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Readonly<Record<string, string>>;
  body: NetResponseBody;
  url: string;
}

// One up/download progress tick, emitted through NetRequestOptions.progress. `total` is 0 when the
// length is unknown (no Content-Length, or a non-enumerable body). `loaded` is the running byte count
// for the given phase. The web/fetch backend can report 'download' progress only; upload progress is
// not observable through fetch.
export interface NetProgress {
  phase: 'upload' | 'download';
  loaded: number;
  total: number;
}

// Per-call transport options: an opt-in progress signal and a caller-supplied abort signal. Both are
// optional; a request with neither still runs to completion.
export interface NetRequestOptions {
  progress?: Signal<(progress: Readonly<NetProgress>) => void>;
  signal?: AbortSignal;
}

// The HTTP transport seam realized by the web default (createWebNetBackend) and by native hosts. A
// backend implements one async method; @flighthq/net dispatches every request through it.
export interface NetBackend {
  sendNetRequest(request: Readonly<NetRequest>, options?: Readonly<NetRequestOptions>): Promise<NetResponse>;
}
