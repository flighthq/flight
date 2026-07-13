---
package: '@flighthq/net'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# net — Review

## Verdict

`solid` — **80/100**. The package delivers the charter's North star with unusual fidelity for a first build: a plain-data `NetRequest` → `Promise<NetResponse>` command over a lazy, swappable `NetBackend`, with sentinel-not-throw failure semantics, opt-in progress, and abort/timeout wired exactly as the 2026-07-10 Decisions specify. What keeps it from higher is the charter's own named next steps (streaming bodies, upload progress, body-encoding helpers) plus the missing diagnostics layer.

## Present capabilities

All in `packages/net/src/net.ts` (four exports, alphabetized), types in `packages/types/src/Net.ts`:

- **Seam trio** — `getNetBackend` (lazy web default, "there is always a backend"), `setNetBackend(backend | null)`, `createWebNetBackend` over `fetch` + `AbortController`. No import-time DOM binding; `sideEffects: false`; deps exactly `types` + `signals` per the charter Boundary.
- **`sendNetRequest(request, options?)`** — the single command; dispatches through the active backend.
- **Request vocabulary** (`Net.ts`) — `NetMethod` (open union with `(string & {})` autocomplete trick), `NetResponseType` (`text`/`json`/`arraybuffer`/`blob`), `NetCredentials`, `NetRedirect`, `NetBody` (string/ArrayBuffer/view/null), `timeoutMs` — the full descriptor the Decision names.
- **Sentinel failure model** — transport failure → `{status: 0, ok: false}` with `statusText` distinguishing `'timeout'` vs `'aborted'` vs the error message (`_netTransportFailure`, using a sentinel abort reason `_netTimeoutReason`); non-2xx → normal response with real status, `ok: false`; malformed JSON body → `null` body, no throw (`_decodeNetBuffer`). Exactly the Decision's shape.
- **Progress** — opt-in `Signal<NetProgress>` via `options.progress`; the download stream is drained chunk-by-chunk with `loaded`/`total` ticks and a whole-body fallback with one terminal tick (`_readNetResponseWithProgress`).
- **Cancellation** — caller `AbortSignal` merged with the timeout into one controller, with correct teardown (timer cleared, listener detached — `_wireNetAbort`), including the already-aborted-at-call case.
- **Tests** (`net.test.ts`, 22 cases) cover init mapping, all four decode paths, malformed JSON, non-2xx, network error, timeout vs abort labeling, progress ticks, header record, and the seam trio including null-restore.

## Gaps

Against a mature HTTP-transport library (and the charter's own Open directions):

1. **Streaming response bodies** (charter Open direction 1) — no way to consume a body incrementally; `responseType` is whole-body only. A `'stream'` response type or a chunk-callback option is the standard next tier.
2. **Upload progress** — `NetProgress.phase` declares `'upload'` but nothing ever emits it (fetch cannot observe upload; documented in `Net.ts`). Either a future XHR/native path or the type is aspirational surface.
3. **Body-encoding helpers** (Open direction 3) — no multipart/form-data or URL-encoded-form composers over `NetBody`. `FormData`/`URLSearchParams` are also not accepted as `NetBody`, so a form upload today requires hand-encoding.
4. **Diagnostics** — the package has silent sentinels (status 0, null JSON body) but no `explain*` query and no `enableNetGuards` module, contra the SDK-wide inversion rule (`agents/conventions/diagnostics.md`). E.g. "why did I get status 0" is answerable only by string-matching `statusText`.
5. **Multi-value response headers** — `_readNetResponseHeaders` flattens to `Record<string, string>`; repeated headers (`Set-Cookie` aside) collapse to fetch's comma-joined value. Acceptable, but worth stating as a known simplification.
6. **Retry/backoff** — correctly absent per Boundary ("a composing layer owns policy"); noted only to record it was checked.

## Charter contradictions

None found. The three 2026-07-10 Decisions (command capability, types-in-header, swappable seam) are each implemented as written. The Boundaries (no caching/dedup, no connectivity, HTTP only, deps `types`+`signals`) all hold in source and manifest.

## Contract & docs fit

- **Package side**: single root export (`index.ts` → `./net`), `sideEffects: false`, full unabbreviated names (`sendNetRequest`, `createWebNetBackend`), sentinels not throws, `Readonly<>` on inputs, module-private state at file bottom, types entirely in `@flighthq/types`. Colocated tests for every export. Clean.
- **Docs side**: the Package Map line for `net` ("HTTP transport — URLLoader/URLRequest, distinct from connectivity") matches reality; `agents/packages/map.md` should eventually carry the realized `sendNetRequest` shape. No stale claims found.

## Candidate open directions

1. Should `NetBody` accept `FormData`/`URLSearchParams`/`ReadableStream` directly (web-native but not C-portable), or should encoding helpers produce string/bytes only? The charter's "small companion" gesture (Open direction 3) does not settle the type question.
2. Where does the `explain*`/guards layer for the platform suite live — per package (`enableNetGuards`) or one suite-wide guard module? `net` is a natural first case.
3. Is `NetProgress.phase: 'upload'` a commitment (implying a non-fetch web path or native-only support) or should it be dropped until a backend can emit it?
