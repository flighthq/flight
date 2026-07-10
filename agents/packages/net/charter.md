---
package: '@flighthq/net'
crate: flighthq-net
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# net — Charter

## What it is

`@flighthq/net` is the **HTTP transport cell** of the platform-integration suite — the Flight home for what OpenFL/Lime expose as `URLLoader`/`URLRequest`: issue an HTTP(S) request, get a response. It is a *command* capability (request → response), not a connectivity-status reporter (that is `@flighthq/connectivity`) and not an asset library (that is the planned `assets`, which composes over this + `loader`).

Modeled as flat free functions over a swappable `NetBackend` with an always-available lazy web default (fetch), matching the suite's command-capability convention (`getNetBackend`/`setNetBackend`/`createWebNetBackend`). A native host (Electron/Tauri/Capacitor) swaps the backend for its own stack without changing caller code.

## North star

The complete, Flight-idiomatic HTTP transport: request descriptors as plain data (method, URL, headers, body, response type, timeout, credentials), a plain-data response (status, headers, typed body), explicit progress and cancellation, and full method/redirect/abort coverage — everything a URLLoader-class consumer needs, with none of URLLoader's stateful event-object baggage. The engine underneath is replaceable; the request/response vocabulary is stable.

## Boundaries

- **Depends on `@flighthq/types` + `@flighthq/signals`** (progress is a signal) and, for the web backend, the DOM `fetch`/`AbortController`. No display, no renderer.
- **Transport only.** It issues requests and returns responses. It does not cache, dedup, refcount, or batch — that is the `assets`/`loader` layer composing over it. It does not parse bodies beyond the requested response type (text/json/arraybuffer/blob).
- **Not connectivity status.** Online/offline/link-quality is `@flighthq/connectivity`. `net` assumes it is asked to make a request and reports transport-level success/failure.
- **HTTP(S) semantics only.** WebSocket/TCP is the sibling `@flighthq/socket`.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Command capability, not an event object.** OpenFL `URLLoader` is a stateful object you attach `COMPLETE`/`PROGRESS`/`IO_ERROR` listeners to and call `load()` on — exactly the "runtime object with hidden behavior" Flight rejects. Redesign: an explicit async command `sendNetRequest(request: Readonly<NetRequest>, options?): Promise<NetResponse>` returning plain-data response, with expected transport failures (DNS, timeout, non-2xx if configured) surfaced as a `NetResponse` with an error status / sentinel, and only programmer misuse throwing. Progress (for large up/downloads) is an opt-in `Signal` passed via options, not an ambient event dispatch. Cancellation via an explicit abort handle (options carry an `AbortSignal`-like token; the web backend maps to `AbortController`).
  **Why:** Flight's core rule — explicit data + explicit invocation over hidden stateful runtime behavior; a Promise-returning command is the modern, tree-shakable, C-portable shape (a native host implements one function, not an event class).
- **[2026-07-10] `NetRequest`/`NetResponse`/`NetBackend` in `@flighthq/types`.** The header layer owns the shapes: `NetRequest` (`method`, `url`, `headers`, `body`, `responseType`, `timeoutMs?`, `credentials?`, `redirect?`), `NetResponse` (`status`, `statusText`, `ok`, `headers`, `body`, `url`), and the `NetBackend` seam. `NetMethod`/`NetResponseType`/`NetCredentials` are string unions (open where a vendor may extend).
- **[2026-07-10] Swappable `NetBackend` seam** (`getNetBackend`/`setNetBackend`/`createWebNetBackend`), web default lazy and side-effect-free at import (no top-level fetch binding). Native hosts replace via `setNetBackend`.

## Open directions

1. **Streaming bodies.** Chunked/streamed response reading (fetch `ReadableStream`) beyond the whole-body response types — a later addition once the whole-body path is solid.
2. **Retry/backoff policy.** Whether a thin retry helper lives here or in `assets`/`loader`. Lean: not in `net` (keep transport primitive); a composing layer owns policy.
3. **Multipart/form-data + upload progress.** Body encoding helpers — likely a small companion, not the core.
