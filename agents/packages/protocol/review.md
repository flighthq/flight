---
package: '@flighthq/protocol'
status: strong
score: 88
updated: 2026-09-02
ingested:
  - packages/protocol/src/protocol.ts
  - packages/protocol/src/index.ts
  - packages/protocol/src/contract.ts
  - packages/protocol/src/protocol.test.ts
  - packages/protocol/src/protocolHost.test.ts
  - packages/protocol/package.json
  - packages/types/src/Protocol.ts
  - packages/types/src/Host.ts (protocol sections)
  - packages/types/src/ElectronProtocolCapabilities.ts
  - packages/types/src/CapacitorProtocolCapabilities.ts
  - charter.md
  - assessment.md
  - status.md
  - prior review (2026-07-13)
  - host-web, host-electron, host-tauri, host-capacitor protocol grep
---

# protocol -- Review

Full re-review against the **2026-08-30 migration** that promoted protocol to a required top-level `Host.protocol` group, split the monolithic `ProtocolBackend` into six independent optional slots, and deleted the ambient resolver, diagnostics, pending-drain sentinel, and web enabler. Supersedes the 2026-07-13 review (`solid -- 84`).

## Verdict

`strong -- 88/100`. The 2026-08-30 rewrite is a material improvement over the prior tree. The old monolithic `ProtocolBackend` (10 methods, every host had to stub all of them) is replaced by six fine-grained backend interfaces (`ProtocolDefaultBackend`, `ProtocolLaunchBackend`, `ProtocolOpenBackend`, `ProtocolRegistrationBackend`, `ProtocolRegistrationQueryBackend`, `ProtocolUnregistrationBackend`), each an Entity, each an independent optional slot in `HostProtocolCapabilities`. Every implementation function takes the narrowest `Has*` witness it needs (`HasProtocolOpen`, `HasProtocolRegistration`, etc.), so a host that only supports warm opens (Capacitor) compiles without stubbing registration or default-handler state. The ambient `getProtocolBackend`/`setProtocolBackend` singleton is gone; the test file `protocolHost.test.ts` explicitly asserts those names are absent from the contract. `drainPendingUrls` is deleted; `ProtocolHandler` is an Entity with signal-based open delivery via `attachProtocolHandler`. The pure URL helpers (`parseProtocolUrl`, `createProtocolUrl`, `isValidProtocolScheme`) are unchanged and correct. All 17 exported functions have colocated test coverage across 22 test cases in two files, `describe` blocks are alphabetized and mirror exports 1:1. What keeps it from the 90s: `ParsedProtocolUrl` still lacks `fragment` and `query` is still mutable, the `createProtocolUrl` `'unknown'` default is still present, and no guard/explain layer exists for sentinel returns.

## Present capabilities

- **Handler entity lifecycle.** `createProtocolHandler` produces an Entity with an `onOpenUrl` signal. `attachProtocolHandler(host, handler)` subscribes the handler to the host's `ProtocolOpenBackend`, idempotently replacing any prior subscription. `detachProtocolHandler` unsubscribes via a `WeakMap`-stored teardown. `disposeProtocolHandler` detaches and clears all signal listeners -- correct `dispose*` semantics (detach-to-GC, no resource to free).
- **Scheme registration.** `registerProtocolScheme` / `registerProtocolSchemes` (batch) delegate to `HasProtocolRegistration`. Batch prevalidates the full array via `isValidProtocolScheme` before the first host call, so one invalid/reserved scheme causes zero mutation. `unregisterProtocolScheme` / `unregisterProtocolSchemes` mirror the same pattern on `HasProtocolUnregistration`. `getRegisteredProtocolSchemes` reads the provider's scheme list.
- **Default-handler operations.** `setProtocolSchemeAsDefault`, `isProtocolSchemeDefault`, `removeProtocolSchemeAsDefault` each take `HasProtocolDefault`, validating the scheme before delegating.
- **Registration query.** `isProtocolSchemeRegistered` takes `HasProtocolRegistrationQuery`, validating the scheme before querying.
- **Cold-start launch.** `getProtocolLaunchUrl` takes `HasProtocolLaunch` and returns `string | null`.
- **Scheme validation.** `isValidProtocolScheme` applies RFC 3986 scheme grammar (`/^[a-z][a-z0-9+\-.]*$/`), lowercase normalization, and rejects a reserved set (`file`, `ftp`, `ftps`, `http`, `https`, `mailto`). Every command and query validates before delegating -- reserved and malformed schemes never reach the host backend.
- **URL parse/build pair.** `parseProtocolUrl` decomposes a URL string into `{ scheme, host, path, query }`, lowercasing the scheme, percent-decoding query values with `+` to space, handling authority-free URLs, and returning `null` for malformed input. Malformed percent escapes are preserved via `safeDecodeProtocolComponent`. `createProtocolUrl` takes `Readonly<Partial<ParsedProtocolUrl>>`, normalizes the path with a leading `/` when authority is present, filters empty-key query entries, and percent-encodes values.
- **Host integration.** `Host.protocol` is a required top-level group typed `HostProtocolCapabilities` with six optional readonly slots. `Has*` witness types (one per slot) in `Host.ts` enable callers to declare the narrowest capability they need. Web publishes `launch` + `registration` only; Electron publishes `default` + `open` + `registration` + `registrationQuery` + `unregistration`; Capacitor publishes `open` only; Tauri publishes an empty `protocol: {}`.
- **Package shape.** Two-lane exports (`.` via `index.ts`, `./contract` via `contract.ts`). `sideEffects: false`. Dependencies: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` -- all at `*`. No inline type exports; all types in `@flighthq/types/src/Protocol.ts`. Module-scoped statics (`_schemePattern`, `_reservedSchemes`, `_subscriptions`, `safeDecodeProtocolComponent`) at file bottom. Exports alphabetized in both source and barrel.
- **Test coverage.** 17 `describe` blocks in `protocol.test.ts` mirror every export 1:1. `protocolHost.test.ts` adds 3 tests for explicit Host ownership: top-level protocol group with independent slots, Entity-backed handler with signal delivery, and absence of deleted ambient resolver names. Total: 22 `it()` cases.

## Gaps

1. **No fragment support.** `ParsedProtocolUrl` has no `fragment` field; `parseProtocolUrl` does not split on `#`. A URL like `myapp://h/p?a=1#frag` leaks the fragment into the last query value or path. Deep-link URLs in the wild (OAuth redirects, social sharing) carry fragments. Fix spans `@flighthq/types` (add field) and both URL functions. Carried from prior review.
2. **`ParsedProtocolUrl.query` is mutable.** Typed as `Record<string, string>`, not `Readonly<Record<string, string>>`. The convention is `Readonly<T>` everywhere mutation is not intended. Carried from prior review, still open in `status.md`.
3. **`createProtocolUrl` defaults missing scheme to `'unknown'`.** Silently emits `unknown:...` instead of a sentinel or validation error. A caller bug is masked rather than surfaced. An `explain*` or guard would satisfy the diagnostics inversion rule. Carried from prior review.
4. **No guard/`explain*` layer.** Silent `false`/`null` sentinels from `registerProtocolScheme`, `parseProtocolUrl`, etc. have no shakeable diagnostic companion. An `explainProtocolSchemeRejection` returning plain data (invalid grammar, reserved, host denial) would align with the diagnostics convention. Carried from prior review.
5. **Batch registration is not transactional.** `registerProtocolSchemes` prevalidates the scheme array (preventing any host call on invalid input), but if the host's `register` call itself fails partway, earlier successful registrations remain applied. `status.md` documents this as a deliberate non-promise. Informational -- not a defect, but callers cannot assume atomicity.

## Charter contradictions

None. The charter specifies `Host.protocol` as a required top-level group with six independent optional slots, `ProtocolHandler` as an Entity, and deletion of the ambient resolver/diagnostics/sentinels/pending-drain/Web enabler. All realized. The charter's open directions (Universal Links, query ordering, parameter shape parity with Rust) remain open and are not contradicted.

## Contract & docs fit

- **Two-lane export shape**: satisfied. `index.ts` re-exports from `contract.ts`; `contract.ts` re-exports from `protocol.ts`. The public lane and contract lane carry the same 17 functions (no contract-only exports). This is correct for a leaf package with no intra-SDK-only API.
- **Types-first**: satisfied. All types in `@flighthq/types/src/Protocol.ts`; no exported type definitions in the protocol package. `Has*` witness types in `Host.ts`.
- **sideEffects: false**: declared and honored. No top-level registrations, listeners, or mutable state initialization. Module statics (`WeakMap`, `Set`, `RegExp`) are allocation-only and lazy.
- **Naming**: all exported functions carry the full, unabbreviated type name (`ProtocolScheme`, `ProtocolHandler`, `ProtocolUrl`) and are globally self-identifying. Boolean-returning functions use `is*` / `has*` prefix. Getter uses `get*` prefix.
- **Readonly parameters**: `createProtocolUrl` input is `Readonly<Partial<ParsedProtocolUrl>>`. Host witness types use `readonly` fields.
- **Sentinel returns**: `parseProtocolUrl` returns `null` for invalid input; registration/default/unregistration commands return `boolean`. No throws for expected failure. Consistent with the project convention.
- **dispose* vs destroy***: `disposeProtocolHandler` correctly uses `dispose*` (detach-to-GC, no native resource). No `destroy*` exists, which is correct -- there is nothing to free.
- **Entity-backed backend interfaces**: all six `Protocol*Backend` interfaces extend `Entity`, matching the explicit-dependency-model requirement that SDK objects are entities.
- **Dependencies**: `entity`, `signals`, `types` only. No dependency on `@flighthq/sdk`. Correct for a platform leaf package.

## Candidate open directions

- **Fragment support** for `ParsedProtocolUrl` and both URL functions -- the most user-visible gap.
- **`Readonly<>` for `ParsedProtocolUrl.query`** -- small types fix, aligns with the readonly-by-default convention.
- **Guard / `explain*` layer** for sentinel returns. `explainProtocolSchemeRejection(scheme): { reason: 'invalid-grammar' | 'reserved' | ... } | null` would fit the diagnostics inversion rule without coupling to `@flighthq/log`.
- **Universal Links / App Links** -- whether verified-domain association belongs here or in a sibling `@flighthq/applink`. Charter lists this as open.
- **`createProtocolUrl` query-key ordering** -- TS emits insertion order, Rust sorts alphabetically. Charter lists this as open.
- **Build-time association-file generation** (`protocol-formats` neighbor) for Apple/Android/Electron manifests. Charter and status both note this has no owner.
