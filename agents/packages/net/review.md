---
package: '@flighthq/net'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source (packages/net/src)
  - packages/types/src/Net.ts
  - packages/types/src/Host.ts (HasNetHttp witness)
  - packages/host-web/src/webNet.ts (web backend, moved from net)
  - packages/host-web/src/webHostNet.ts (Host factory)
  - assessment.md (prior, 2026-07-13)
---

# net -- Review

Survey of the live tree (2026-09-02). This **supersedes** the 2026-07-13 review (solid -- 80/100), which predates the explicit Host migration. That migration replaced the ambient `NetBackend` resolver (`getNetBackend`/`setNetBackend`/`createWebNetBackend`) with a single `sendNetRequest(host, request, options?)` that delegates through a `HasNetHttp` Host witness. The web backend implementation moved entirely to `@flighthq/host-web` (`webNet.ts`), and `@flighthq/signals` was dropped as a dependency. The package went from four exports to one. Three of the prior assessment's five `Recommended` items (diagnostics, multi-value header test, progress total semantics) are no longer in scope for this package -- sentinel behavior, header flattening, and progress logic now live in the host backend, not here.

## Verdict

`solid -- 78/100`. The package correctly implements the explicit-dependency model: a single exported function (`sendNetRequest`) takes a `HasNetHttp` Host witness and delegates to `host.net.http.sendNetRequest`. There is no module-scoped mutable state, no singleton, no ambient backend. The type surface in `@flighthq/types/src/Net.ts` remains complete and well-documented. Tests verify the delegation contract and explicitly assert that the old ambient API symbols (`getNetBackend`, `setNetBackend`, `createWebNetBackend`, `installNetHostBackend`, `resetNetBackendForTest`) are absent.

What keeps it below the prior score is the migration's side effect: the package is now a **one-function delegate** whose entire behavior is "call the host." The charter's North star -- "the complete, Flight-idiomatic HTTP transport" -- is realized almost entirely by the host backend and the type surface, not by this package. The charter and its Decisions describe capabilities (sentinel failure model, progress, cancellation, timeout, abort wiring) that this package no longer implements; they live in `host-web/src/webNet.ts`. The package is correctly shaped but thinner than the charter envisions, and the charter has not been updated to reflect the boundary shift.

## Present capabilities

All in `packages/net/src/net.ts` (one export), types in `packages/types/src/Net.ts`:

- **`sendNetRequest(host, request, options?)`** -- the single exported function. Takes `HasNetHttp` (the narrowest Host witness carrying `net.http: NetBackend`), a `Readonly<NetRequest>`, and optional `Readonly<NetRequestOptions>`. Returns `Promise<NetResponse>`. The entire body is `host.net.http.sendNetRequest(request, options)` -- a pure delegate with no added logic.

- **Type surface** (`Net.ts`, fully in `@flighthq/types`) -- unchanged from the prior review and still complete:
  - `NetMethod` (open union with `(string & {})` autocomplete trick)
  - `NetResponseType` (`text`/`json`/`arraybuffer`/`blob`)
  - `NetCredentials` (`omit`/`same-origin`/`include`)
  - `NetRedirect` (`follow`/`error`/`manual`)
  - `NetBody` (`string`/`ArrayBuffer`/`ArrayBufferView`/`null`)
  - `NetResponseBody` (`string`/`unknown`/`ArrayBuffer`/`Blob`/`null`)
  - `NetRequest` -- full descriptor: `method`, `url`, `headers?`, `body?`, `responseType?`, `timeoutMs?`, `credentials?`, `redirect?`
  - `NetResponse` -- `status`, `statusText`, `ok`, `headers`, `body`, `url`
  - `NetProgress` -- `phase` (`upload`/`download`), `loaded`, `total`
  - `NetRequestOptions` -- `progress?` (Signal), `signal?` (AbortSignal)
  - `NetBackend` -- the single-method seam (`sendNetRequest`)

- **Host witness** (`Host.ts`) -- `HasNetHttp` carries `readonly net: { readonly http: NetBackend }`, wired into the Host capability lattice. The web realization lives at `host-web/src/webHostNet.ts` as `webHostNet = createHost({ net: { http: webNetBackend, socket: webSocketBackend } })`.

- **Two export lanes** -- `index.ts` (public `.`) re-exports from `contract.ts`; `contract.ts` re-exports from `net.ts`. Both lanes expose the same single function.

- **Tests** (`net.test.ts`, 3 cases across 2 describe blocks):
  - `R3 boundary` -- asserts that five deleted ambient-API symbols are not present in the contract exports.
  - `sendNetRequest` -- verifies request/options passthrough to the host backend, and that the response passes through unchanged.

## Gaps

1. **Package is a one-line delegate.** `sendNetRequest` adds no value beyond `host.net.http.sendNetRequest(request, options)` -- no input normalization, no validation, no default application. A consumer who already holds a Host witness could call the backend method directly. The package's value proposition is that it provides the application-facing API name and allows the SDK barrel (`@flighthq/sdk`) to re-export a stable surface, but the function itself adds zero logic.

2. **Charter is stale.** The charter's North star, Decisions, and Boundaries describe an architecture that no longer exists in this package:
   - Decision [2026-07-10] describes `getNetBackend`/`setNetBackend`/`createWebNetBackend` -- all deleted.
   - The Boundary says "Depends on `@flighthq/types` + `@flighthq/signals`" -- `signals` was removed.
   - The sentinel failure model, progress via Signal, cancellation via AbortSignal/timeout, and response decoding described in the charter all now live in `host-web/src/webNet.ts`, not in this package.
   - The charter does not mention the Host witness model or the explicit-dependency migration.

3. **Diagnostics absent.** No `explainNetResponse` query and no `enableNetGuards` module, contra the diagnostics inversion rule. The prior review and assessment both flagged this. Whether diagnostics belong here (over the delegate) or in the host backend is now an open question that the charter does not address.

4. **Streaming response bodies** (charter Open direction 1) -- still absent. A `'stream'` response type or chunk-callback would be the standard next tier. This is now a host-backend concern.

5. **Upload progress** -- `NetProgress.phase` declares `'upload'` but nothing in the web backend ever emits it (fetch cannot observe upload progress). Either aspirational or requires a non-fetch backend path.

6. **Body-encoding helpers** (charter Open direction 3) -- no multipart/form-data or URL-encoded-form composers. `FormData`/`URLSearchParams` are not accepted as `NetBody`. Whether helpers belong here or in a companion module is still open.

7. **`platform-integration.md` stale reference.** The shared platform-integration pattern document (line 9) still says "Three ambient-language capabilities (net, socket, textsegment) stay inline with a lazy-install default." `net` has moved to the Host witness model; this reference is outdated.

## Charter contradictions

1. **Backend seam Decision is obsolete.** Decision [2026-07-10] "Swappable `NetBackend` seam" describes `getNetBackend`/`setNetBackend`/`createWebNetBackend` -- all three are deleted. The seam still exists via the Host's `net.http` slot, but the Decision's description of how it is surfaced is entirely wrong.

2. **Dependency Boundary is stale.** The charter says "Depends on `@flighthq/types` + `@flighthq/signals`". The actual dependency is `@flighthq/types` only; `signals` was dropped when the progress/cancellation implementation moved to `host-web`.

3. **"Command capability" Decision partially displaced.** Decision [2026-07-10] describes `sendNetRequest(request, options?)` with two parameters. The actual signature is `sendNetRequest(host, request, options?)` with three -- the Host witness was added as the first argument. The Decision's description of the function shape is stale.

## Contract & docs fit

**(a) Package against the contract:**

- **Types-first:** Satisfied. The full type surface lives in `@flighthq/types/src/Net.ts`. The `HasNetHttp` witness lives in `@flighthq/types/src/Host.ts`. No exported types in the implementation package.
- **Two blessed lanes:** `.` (`index.ts`) and `./contract` (`contract.ts`) -- satisfied.
- **`sideEffects: false`:** Declared and true. No top-level side effects.
- **Full unabbreviated names:** `sendNetRequest` -- satisfied.
- **Free functions over classes:** Satisfied. Zero classes.
- **Explicit dependency model:** Satisfied. `host: HasNetHttp` is the sole dependency injection mechanism. No singletons, no module-scoped mutable state.
- **`Readonly<T>` on parameters:** `Readonly<NetRequest>` and `Readonly<NetRequestOptions>` -- satisfied.
- **Crate identity:** `flighthq-net` declared in charter front matter.

**(b) Contract/admin docs that are stale:**

- **Charter body** -- the Decisions, Boundaries, and North star all describe the pre-migration architecture. Major rewrite needed to reflect the Host witness model.
- **`platform-integration.md`** -- still references net as an "ambient-language capability" with a "lazy-install default." This is incorrect post-migration.
- **Assessment.md** -- the prior assessment's Recommended items 1-3 (diagnostics query, guard module, URL-encoded form helper) and item 5 (progress total semantics) are now out of scope for this package -- the implementation they target lives in `host-web`. Item 4 (multi-value header test) similarly applies to `host-web/src/webNet.ts`, not to this package. The assessment needs full regeneration.

## Candidate open directions

1. **Does this package earn its existence as a one-function delegate?** The SDK barrel re-exports it, and downstream consumers (`audio`, `scene3d-resources`) import `sendNetRequest` from `@flighthq/net/contract`. The function is the application-facing name and provides a stable import path independent of the host backend. But the function adds no logic. Whether the package should grow convenience helpers (request builders, response inspectors, diagnostics) or remain minimal-by-design is the central question for the charter update.

2. **Diagnostics placement.** Should `explainNetResponse` and `enableNetGuards` live in `@flighthq/net` (analyzing the plain-data `NetResponse` the host returned) or in the host backend? The sentinel interpretation (status 0, `statusText` values) is defined by the type contract, not by the host, so a package-level explainer that reads `NetResponse` fields seems correct regardless of the delegate architecture.

3. **Request builder / convenience helpers.** Functions like `createNetGetRequest(url)`, `createNetPostRequest(url, body)`, or `formatNetFormBody(fields)` could live here as pure constructors over `NetRequest`, adding value without touching the host seam. This would give the package more substance beyond the delegate.

4. **Charter rewrite scope.** The charter needs a rewrite to describe the Host witness architecture, updated Boundaries (types-only dependency), and revised Decisions. The North star ("complete, Flight-idiomatic HTTP transport") should clarify that the transport implementation lives in host backends while this package owns the application-facing API name and any pure-data helpers.
