---
id: net
title: '@flighthq/net'
type: new-package
target: net
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/net.md
  - tools/agents/docs/reviews/breadth/missing-domains.md
  - tools/agents/docs/reviews/breadth/openfl-lime-parity.md
  - tools/agents/docs/reviews/breadth/asset-pipeline.md
depends_on: []
updated: 2026-06-23
---

## Summary

General-purpose HTTP request/response — the OpenFL `URLLoader`/`URLRequest`/`URLVariables` home: method, headers, body, text/binary/JSON/form responses, progress + completion signals, abort, retry/backoff — over a swappable transport backend (web `fetch`, native host, Rust `reqwest`).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable transport: one-shot requests, the four response formats, abort, and progress. Fills the single biggest OpenFL-parity gap.

Types in `@flighthq/types` first (`Http.ts`):

- `HttpMethod` — `'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'` (open string union; bare names reserved).
- `HttpResponseKind` string ids: `TextResponseKind`, `BinaryResponseKind`, `JsonResponseKind`, `FormResponseKind`.
- `HttpHeaders` — `Readonly<Record<string, string>>` (single-value first cut).
- `HttpRequest` — plain entity: `url`, `method`, `headers`, `body` (`string | ArrayBuffer | null`), `responseKind`, `timeoutMs`, `withCredentials`. (The OpenFL `URLRequest`.)
- `HttpResponse` — plain entity: `status`, `statusText`, `headers`, `ok` (boolean), `body` (string / `ArrayBuffer` / parsed JSON depending on `responseKind`), `url` (final, post-redirect).
- `HttpBackend` — the transport seam: `send(request, hooks): { abort(): void }` where `hooks` carries progress/settle callbacks. Plain-data in, plain-data out.

Functions in `@flighthq/net`:

- `createHttpRequest(url): HttpRequest`, `createHttpResponse(): HttpResponse` — explicit allocation.
- `setHttpRequestHeader(out, name, value)`, `getHttpRequestHeader(request, name): string | null` (sentinel `null` on miss).
- `sendHttpRequest(request): Promise<HttpResponse>` — the core one-shot. Resolves with the response even for non-2xx (`ok=false`); rejects only on transport failure / abort.
- `getHttpText(url): Promise<string>`, `getHttpJson<T>(url): Promise<T>`, `getHttpBytes(url): Promise<ArrayBuffer>` — convenience `GET` wrappers over `sendHttpRequest`.
- `postHttpJson<T>(url, body): Promise<T>` — convenience `POST` with JSON encode/decode.
- Backend seam: `getHttpBackend()`, `setHttpBackend(backend | null)`, `createWebHttpBackend()` (over `fetch` + `AbortController`; `XMLHttpRequest` fallback only if upload progress is needed — see Open questions).
- Abort: `createHttpRequestController(): HttpRequestController` with `abortHttpRequest(controller)`; `sendHttpRequest` accepts a controller (or returns an abortable handle) so a caller can cancel.
- Progress signals (opt-in): `enableHttpRequestSignals(request)` enabling an `HttpRequestSignals` group — `onProgress(loaded, total)`, `onComplete(response)`, `onError(error)`. Inert until enabled, per the signal rule.

### Silver

Competitive and solid: matches a well-regarded HTTP client (axios/got-tier). Common professional use, the important edge cases, cross-backend consistency.

Types (`@flighthq/types`):

- `HttpHeaders` upgraded to support multi-value: `getHttpHeaderValues(headers, name): readonly string[]`; keep single-value accessor as the common path.
- `HttpRequestOptions` — `redirect` (`'follow' | 'manual' | 'error'`), `cache`, `mode`, `referrer`, `signal`/controller, `retry: HttpRetryPolicy`.
- `HttpRetryPolicy` — `maxAttempts`, `backoff` (`'fixed' | 'exponential'`), `baseDelayMs`, `maxDelayMs`, `jitter`, `retryableStatuses: readonly number[]`, `retryableMethods`.
- `HttpError` plain-data result kind (not a thrown wrapper for _expected_ failure): `kind` (`'timeout' | 'abort' | 'network' | 'http'`), `status`, `message`. Returned/attached, not thrown, per the sentinel rule.
- `HttpProgress` snapshot type: `loaded`, `total` (`-1` when unknown), `lengthComputable`.

Functions:

- `sendHttpRequestWithRetry(request, policy): Promise<HttpResponse>` — retry/backoff with jitter, honoring `Retry-After`.
- `createHttpClient(defaults): HttpClient` — a plain config bundle (base URL, default headers, default retry/timeout, default backend) so callers can scope defaults without global state. `sendHttpClientRequest(client, request)`, `getHttpClientText(client, path)`, etc. The client is plain data, not a stateful method-object.
- Header helpers: `appendHttpRequestHeader`, `removeHttpRequestHeader`, `hasHttpRequestHeader`, `parseHttpHeaderList(raw): HttpHeaders`.
- Query/form (delegated to `@flighthq/net-formats`, re-exported convenience): `encodeHttpQuery(params): string`, `parseHttpQuery(query): Record<string,string>`, `createHttpFormBody(fields): HttpFormBody` (the OpenFL `URLVariables`), `createHttpMultipartBody(parts): HttpMultipartBody` (file upload).
- Response decode helpers: `getHttpResponseJson<T>(response): T | null`, `getHttpResponseText(response)`, `getHttpResponseBytes(response)`, `isHttpResponseOk(response)`.
- Upload progress wired through the seam (`hooks.onUploadProgress`) with the web backend selecting `XMLHttpRequest` automatically when upload progress is requested (fetch lacks it).
- Cross-backend consistency contract: documented header-casing normalization, redirect/`ok` semantics, and timeout/abort error mapping identical across web/native/Rust — verified by conformance cells.
- Cookie/credential policy surface: `withCredentials` honored consistently; documented native cookie-jar behavior.

### Gold

Authoritative / AAA: the canonical HTTP cell. Exhaustive coverage, streaming, interceptors-as-data, full error handling, performance, tests, docs, 1:1 Rust parity.

Types (`@flighthq/types`):

- `HttpStreamResponse` + `ReadableByteStream` seam for **streaming download** (OpenFL `URLStream`): incremental body delivery without buffering the whole payload. `HttpStreamChunk` plain-data chunks.
- `HttpRequestInterceptor` / `HttpResponseInterceptor` as **plain function descriptors** in a `readonly` chain on `HttpClient` (auth injection, logging, content negotiation) — composition by explicit array, not hidden middleware registries.
- `HttpAuth` descriptors: `BearerHttpAuthKind`, `BasicHttpAuthKind`, custom — applied by an explicit `applyHttpAuth(out, auth)`, not an implicit interceptor side effect.
- `HttpCachePolicy` + `HttpResponseCache` seam for an **HTTP-level response cache** (ETag/`If-None-Match`, `Cache-Control`, `304` revalidation) — distinct from the asset-pipeline content cache, which layers above.
- `HttpProgressKind` and richer progress (`upload`/`download` phases, byte + percentage).

Functions:

- `sendHttpStreamRequest(request, onChunk): HttpRequestController` — streaming reads; `readHttpStreamChunk(stream, out)`.
- `createHttpResponseCache(options)`, `getHttpResponseCacheEntry`, `evictHttpResponseCacheEntry`, `clearHttpResponseCache` — revalidating cache with `dispose*` for listener cleanup and `-1`/`null` sentinels on miss.
- Interceptor application: `applyHttpRequestInterceptors(client, out)`, `applyHttpResponseInterceptors(client, out)` — explicit, ordered, side-effect-free transforms.
- Concurrency + connection reuse on the native/Rust path (reqwest connection pool, HTTP/2); documented keep-alive behavior; `createHttpConnectionPool` config on native backends.
- Full error taxonomy mapped 1:1 across backends; `parseHttpStatusClass(status)`; `isHttpStatusRetryable(status)`.
- Content negotiation helpers: `Accept`/`Content-Type` defaults per `responseKind`, automatic gzip/brotli decode where the backend supports it, charset-aware text decoding.
- `createWebHttpBackend` parity with native: documented divergences (no streaming-upload in fetch, CORS constraints) recorded in the conformance divergence map, not silently differing.
- Exhaustive colocated tests (one `*.test.ts` per source, alias-safe `out` cases), functional/integration coverage for the public import path, and a `flighthq-net` Rust crate passing the conformance cells for value-typed request/response round-trips. Benchmarks for large-body throughput and many-small-request overhead.

## Boundaries

- **Connectivity status stays in `@flighthq/network`.** `net` does not report online/offline; it transports. A caller can consult `isNetworkOnline()` before issuing a request, but the two cells are independent.
- **Sockets and WebSockets are out** — they are a different lifecycle (persistent, bidirectional, frame-based) and belong in a sibling `@flighthq/socket` cell (OpenFL `Socket`/`XMLSocket`/`DatagramSocket`). SSE/event-stream may live as a `net` streaming extension or its own cell; decided when built, not pre-coupled here.
- **Typed asset construction stays in `@flighthq/resources`.** `net` returns bytes/text/JSON; turning those into an `ImageResource`/`AudioResource`/`Font` is a `resources` concern. The intended refactor is for `resources` to fetch _through_ `net`'s backend seam, not for `net` to know about resource types.
- **Batch queue, concurrency cap, manifest/bundle loading stay in `@flighthq/loader`.** `net` is per-request; orchestration of many requests with priority and progress aggregation is the loader's role (and a separate maturation item).
- **The content-addressed asset cache (dedup-by-URL, refcount, eviction — OpenFL `AssetCache`) stays out.** That is an asset-pipeline concern above the transport; `net`'s Gold cache is the _HTTP_ cache (ETag/revalidation), a different layer.
- **Multipart/form/query encoders live in `@flighthq/net-formats`**, re-exported as convenience but importable in isolation, per the `-formats` neighbor pattern.
- **No global ambient client / no module-top-level state.** All defaults flow through an explicit `HttpClient` value or the swappable backend; the package stays `"sideEffects": false` with a single root `.` export.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Web backend: `fetch` vs `XMLHttpRequest`.** `fetch` is the clean default but cannot report **upload** progress and cannot stream uploads in browsers. Proposal: `createWebHttpBackend` uses `fetch` by default and transparently switches to `XMLHttpRequest` when upload progress or streaming-upload is requested. Confirm this hidden switch is acceptable, or expose `createWebXhrHttpBackend()` explicitly.
- **Is `net` the right name** given `network` already exists? `net` is short and unambiguous as _transport_, but `http` is more literal (and forecloses non-HTTP transports). The reviews suggested `net`/`http`/`fetch`; this spec picks `net` as the transport umbrella with `http` types inside it. Lock the name before building.
- **Response body union vs `responseKind` discriminator.** Should `HttpResponse.body` be a discriminated union on `responseKind`, or typed `unknown` with `get*` accessors per kind? The accessor route is more C/Rust-portable and matches the "plain data + free functions" rule; confirm.
- **Where does form/query encoding live** — inline in `net` or strictly in `net-formats`? Lean: query-string (tiny, universal) in `net`; multipart/file-upload in `net-formats`. Confirm the split.
- **Native cookie jar and credential storage** — `withCredentials` maps cleanly to fetch, but the native/reqwest path needs an explicit cookie-jar policy decision (per-client jar vs none). Decide the default.
- **Retry idempotency safety** — default `retryableMethods` should exclude non-idempotent `POST`/`PATCH` unless the caller opts in. Confirm the safe default and whether `Idempotency-Key` support belongs here.
- **Streaming (`URLStream`) tier** — is byte-stream download in scope for Gold `net`, or does it warrant its own seam once `socket`/`sse` exist? Affects whether the `HttpStreamResponse` type ships in the first `Http.ts`.

## Agent brief

> Create `@flighthq/net` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
