---
package: '@flighthq/protocol'
status: solid
score: 84
updated: 2026-07-13
ingested:
  - source
  - tests
  - packages/types/src/Protocol.ts
  - charter.md
  - assessment.md
  - status.md (skimmed)
  - prior review (2026-06-25 merge gate)
---

# protocol — Review

Light re-review of the **live tree**. Supersedes the 2026-06-25 merge-gate review (`partial — 58`), whose single hard blocker — the `@flighthq/types` contract missing `ParsedProtocolUrl` and five `ProtocolBackend` methods — is **resolved**: `packages/types/src/Protocol.ts` now defines `ParsedProtocolUrl` and the full 10-method `ProtocolBackend` (`register`/`unregister`/`isRegistered`/`getRegisteredSchemes`/`setAsDefault`/`isDefault`/`removeAsDefault`/`getLaunchUrl`/`drainPendingUrls`/`subscribe`), matching every call site in `packages/protocol/src/protocol.ts`. The types-first violation and the honesty failure that review documented no longer describe this tree.

## Verdict

`solid — 84/100`. The prior review projected "low 90s" once the types landed; this read is slightly more conservative. The realized surface is the full deep-linking capability a platform suite needs — scheme registration (single + batch), default-handler set/query/remove, cold-start launch URL vs warm `onOpenUrl` split, pre-attach URL drain, RFC 3986 scheme validation with reserved-scheme rejection, and a parse/build URL pair that round-trips — all sentinel-clean, types-first, and covered by 50 colocated tests with alphabetized `describe` blocks mirroring every export. What keeps it out of the 90s: `ParsedProtocolUrl` has no `fragment` field and `parseProtocolUrl` does not split on `#` (a `myapp://h/p?a=1#frag` leaks the fragment into the last query value); `ParsedProtocolUrl.query` landed as a mutable `Record<string, string>` where the prior review already asked for `Readonly<>`; the web backend's `unregister` hard-codes failure although the HTML spec (and Chromium) provide `navigator.unregisterProtocolHandler`; and there is no guard/`explain*` layer for the silent `false`/`null` sentinels. None of these are blockers; all are close-out polish on an otherwise textbook suite member.

## Verified against live source

- **Backend seam** (`protocol.ts`): `getProtocolBackend` (lazy web default), `setProtocolBackend(backend | null)`, `createWebProtocolBackend()` over `navigator.registerProtocolHandler` with a `/?url=%s` redirect and a local registered-scheme mirror; every web-impossible capability returns an honest sentinel with a durable comment.
- **Handler entity**: `createProtocolHandler` (inert signal) / `attachProtocolHandler` (idempotent; drains `drainPendingUrls()` before subscribing) / `detachProtocolHandler` / `disposeProtocolHandler` — correct `dispose*` verb (detach-to-GC), `WeakMap` subscription store at module bottom.
- **Commands**: `registerProtocolScheme(s)`/`unregisterProtocolScheme(s)` (+ batch pair, partial-failure → `false`), `setProtocolSchemeAsDefault`/`isProtocolSchemeDefault`/`removeProtocolSchemeAsDefault`, `isProtocolSchemeRegistered`, `getRegisteredProtocolSchemes`, `getProtocolLaunchUrl`.
- **URL pair**: `parseProtocolUrl` (scheme-lowercasing, authority/path/query split, percent-decode with `+`→space, last-value-wins multi-keys, `null` sentinel) and `createProtocolUrl` (round-trips; empty-key filtering).
- **Validation**: `isValidProtocolScheme` — RFC 3986 grammar, lowercase normalization, reserved set (`file`/`ftp`/`ftps`/`http`/`https`/`mailto`).
- **Contract hygiene**: `sideEffects: false`, single `.` export, thin barrel, deps = `signals` + `types` only, exports alphabetized, module statics at bottom, `Readonly<Partial<ParsedProtocolUrl>>` input.

## Remaining gaps

1. **No fragment support.** `ParsedProtocolUrl` lacks `fragment`; `parseProtocolUrl` never splits on `#`, so a fragment corrupts the final query value (or the path). Deep-link URLs in the wild (OAuth redirects especially) carry fragments. Fix spans `@flighthq/types` (add the field) + both URL functions.
2. **`ParsedProtocolUrl.query` should be `Readonly<Record<string, string>>`** per the contract's Readonly-by-default rule — carried over from the prior review; the type landed mutable.
3. **Web `unregister` could be real.** `navigator.unregisterProtocolHandler(scheme, url)` exists in the HTML spec; the backend unconditionally returns `false` ("no programmatic unregister"), which is stale for Chromium-family browsers. Sweep-safe: feature-detect and call it, keep the `false` sentinel otherwise.
4. **`createProtocolUrl` defaults a missing scheme to `'unknown'`**, silently emitting `unknown:...` instead of a sentinel. Minor design nit — a caller bug is masked rather than surfaced; an `explain*`/guard would cover it under the diagnostics inversion rule.
5. **No guards/`explain*` layer** for the sentinel surface (why did `registerProtocolScheme` return false — invalid grammar, reserved, or host denial?). `explainProtocolSchemeRejection` returning plain data would fit the diagnostics convention.

## Candidate open directions (not for the assessment's Recommended)

- App Links / Universal Links (association files) stay parked as charter siblings — unchanged.
- Whether the launch-URL query-param convention (`/?url=%s`) should be configurable on the web backend.
