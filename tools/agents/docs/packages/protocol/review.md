---
package: '@flighthq/protocol'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/protocol.md
  - reviews/maturation/depth/protocol.md
  - source
  - changes.patch
---

# protocol — Review

## Verdict

solid — 90/100. The incoming pass (builder-67dc46d64) closed every gap the prior depth review (70/100) flagged as table-stakes — cold-start launch URL, the default-handler triplet, deep-link parse/build, multi-scheme ergonomics, scheme validation, and a pre-attach burst-drain — across `@flighthq/types`, the package, the Electron host backend, and the Rust crate. What remains between here and authoritative is genuinely out of autonomous scope (Universal/App Links, the `-formats` neighbor, real host routing) plus one small TS↔Rust divergence and a doc/code drift the status report introduced.

This supersedes `reviews/depth/protocol.md` (70/100) and the maturation roadmap: Bronze and Silver are done in code, and the autonomously-fixable Gold items (scheme validation, pending-URL queue) are done.

## Present capabilities

All grounded in `67dc46d64:packages/protocol/src/protocol.ts` and `packages/types/src/Protocol.ts`.

Control surface over the swappable backend (web default lazily created in `getProtocolBackend`):

- `registerProtocolScheme` / `unregisterProtocolScheme`, `isProtocolSchemeRegistered`.
- `registerProtocolSchemes` / `unregisterProtocolSchemes` — batch, `false` if any element fails.
- The complete default-handler triplet: `setProtocolSchemeAsDefault` / `isProtocolSchemeDefault` / `removeProtocolSchemeAsDefault`.
- `getRegisteredProtocolSchemes` — enumerate (backend tracks its own set; web/Electron track locally).
- `getProtocolLaunchUrl` — cold-start one-shot query, idempotent, distinct from warm `onOpenUrl`.
- `getProtocolBackend` / `setProtocolBackend(backend|null)` / `createWebProtocolBackend` — the standard command-capability seam.

Event-entity surface (mirrors `@flighthq/application` window wiring):

- `createProtocolHandler` → `ProtocolHandler { onOpenUrl }` (inert until attached).
- `attachProtocolHandler` / `detachProtocolHandler` / `disposeProtocolHandler` — `attach` is idempotent (tears down a prior subscription first) and **drains the backend's pre-attach buffer** via `drainPendingUrls()`, emitting each buffered URL before going live. This closes the process-start↔ first-attach race that drops warm opens.

Payload helpers (decided to live here as the domain payload helper, not a separate URL package):

- `parseProtocolUrl(url): ParsedProtocolUrl | null` — hand-rolled scheme/authority/path/query split, percent-decodes values (`_safeDecode` with `+`→space), last-value-wins on duplicate keys, lowercases scheme, `null` sentinel on malformed/empty/`:noscheme` input. Does not lean on the WHATWG `URL` parser (which mangles custom schemes), which is the right call.
- `createProtocolUrl(parts: Readonly<Partial<ParsedProtocolUrl>>): string` — all parts optional, normalizes a leading `/` on path, percent-encodes query, round-trips with `parseProtocolUrl`.
- `isValidProtocolScheme(scheme): boolean` — RFC 3986 grammar (`/^[a-z][a-z0-9+\-.]*$/`), reserved-scheme rejection (`http/https/ftp/ftps/mailto/file`), lowercase-normalized. Both `register*` paths self-defend by calling it before delegating, so malformed schemes never reach the OS.

Backends: `createWebProtocolBackend` honestly degrades — `register` wraps `navigator.registerProtocolHandler` (origin + `/?url=%s` template) and tracks schemes locally; `getLaunchUrl` reads `?url=` from `location.search`; `isDefault`/`removeAsDefault`/`unregister`/ `isRegistered` return `false`; `drainPendingUrls` returns `[]`; `subscribe` is inert. The Electron backend (`67dc46d64:packages/host-electron/src/electronProtocol.ts`) wires the triplet onto `setAsDefaultProtocolClient`/`isDefaultProtocolClient`/`removeAsDefaultProtocolClient`, reads the cold-start URL from `getCommandLine()` argv (skipping http/https/file) with a macOS `open-url` cache fallback, and installs an eager `_bufferHandler` on `open-url` at creation that buffers into `_pendingUrls` until `subscribe` removes it — the host half of the burst-drain contract.

Types live in `@flighthq/types` (`ParsedProtocolUrl`, `ProtocolHandler`, `ProtocolBackend` with the five new seam methods) as the contract requires. Tests are colocated, one `describe` per export, alphabetized; 50 protocol tests + 12 Electron tests per the status report (count consistent with the test file read). Rust crate `flighthq-protocol` mirrors the full surface (`parse_protocol_url`, `create_protocol_url`, `is_valid_protocol_scheme`, the triplet, launch URL, drain) — verified in `changes.patch`.

## Gaps

Measured against a mature deep-link integration (Electron / Tauri `deep-link` / Capacitor / RN-Expo `Linking`). The narrow custom-scheme domain is now essentially complete; the remaining gaps are the deliberately-deferred frontier and a few small edges:

- **Universal / App Links** (iOS Universal Links, Android App Links, `https://` verified domain opens). This is the genuine other half of production deep linking and is correctly deferred — it needs server-side association files, OS entitlements, and a different API surface. Cross-package design decision (extend `ProtocolBackend` vs. a new `@flighthq/applink` sibling), surfaced not acted on.
- **Association-file generation** (`@flighthq/protocol-formats`): build-time emission of `apple-app-site-association`, Android `intent-filter`, Electron `protocols` manifest. A `-formats` neighbor (subject-triad fork B/D); a new package-shape decision, deferred correctly.
- **`createProtocolUrl` query-key ordering is unspecified and divergent across impls** (see Contract & docs fit) — the one substantive correctness/conformance gap in the shipped surface.
- **No parsed warm-open delivery option.** `onOpenUrl` carries the raw string only; the Silver "parse at the listener as a one-liner" convention is documented intent but there is no `getProtocolHandlerLastUrl` / parsed-payload affordance. Minor; the raw string is lossless.
- **No functional/manual verification.** Protocol can't be exercised by jsdom (needs a real native host for OS URL dispatch) and the Rust tests were unrunnable in the worker env (no cargo). The seam is unit-tested via fakes, but no end-to-end "deep-link launch + warm open both routed" scene exists.

## Charter contradictions

The charter (`charter.md`) is a stub — "What it is" is seeded from the depth review; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore no blessed principle to contradict. Judged against the codebase-map AAA fallback, the package is exemplary: free functions, backend seam, entity/runtime split, sentinels-not-throws, `sideEffects: false`, single root export, types-first. No contradictions found. (The charter's silence is itself the finding — see Candidate open directions.)

## Contract & docs fit

Lives up to the contract well, with three flags:

- **(a) Contract adherence — strong.** Full unabbreviated `Protocol` type word on every export; the `get*`/`is*`/`register*`/`create*`/`attach*`/`detach*`/`dispose*` verbs match the command + event capability conventions; sentinels (`null`/`false`/`[]`) for every expected absence, no throws on bad input (`isValidProtocolScheme` makes invalid input a `false`, not an exception); types in `@flighthq/types`; Rust crate mirrors the surface. `dispose*` is correctly chosen over `destroy*` (handler is GC memory, nothing to free). No `out`-param functions apply here. The comment on `parseProtocolUrl` claiming it "reads all fields before writing to avoid aliasing issues if the caller reuses a buffer" is **misleading boilerplate** — the function allocates a fresh object and has no `out` param or caller buffer; the aliasing note does not apply and should be dropped.

- **(b) TS↔Rust conformance drift — `createProtocolUrl` query ordering.** The TS `createProtocolUrl` emits query entries in **`Object.entries` insertion order** (no sort), while the Rust `create_protocol_url` **sorts keys alphabetically** (`entries.sort_by_key(|(k,_)| k.as_str())`, confirmed in `changes.patch`). The two builders produce different strings for the same multi-key input — a real conformance divergence that should be reconciled (pick one ordering, ideally a stable sort in both for deterministic round-trips) or recorded in the divergence map. Compounding this, the status report's "Concerns #4" **claims the TS code sorts alphabetically for deterministic output** — it does not; the TS source uses insertion order. That status claim is **AS-CLAIMED-but-wrong** and should not be promoted. Also minor: Rust `create_protocol_url(&ParsedProtocolUrl)` takes a full value where TS takes `Readonly<Partial<…>>` — TS allows omitting parts, Rust does not.

- **(c) Package Map casing drift — candidate revision.** The codebase-map Package Map line still reads "plus an `onOpenURL` handler entity," but the code/type use `onOpenUrl` (matching the `Url` trend and the `url` listener arg). The worker correctly judged the code canonical and left the map prose unchanged. **Candidate revision: fix the Package Map prose to `onOpenUrl`** so the doc and code agree. (Outside this package's files, so flagged not done.)

## Candidate open directions

The charter is a stub; each silence below is a question for the user to settle, not something to assume:

- **North star.** The package strongly implies one — "the OS deep-link/URI-scheme seam: a thin, honest-degrading backend boundary with the domain's payload helpers colocated, never a host dependency." Worth blessing explicitly.
- **Scope boundary: custom schemes vs. full deep linking.** Is Universal/App-Link support in scope for `@flighthq/protocol`, or is it a sibling `@flighthq/applink`? The worker recommends a sibling. This is the single largest direction question and gates whether the package is "authoritative" for its domain or just for custom schemes. (Structural-forks: cross-package, design-level.)
- **`protocol-formats` neighbor.** Is build-time association-file generation in scope for this package family at all, or does it belong with host/build tooling? (Subject-triad fork B/D — a `-formats` cell; passes the plurality guard only once ≥2 target formats are real, which they are: plist + intent-filter
  - plist again.)
- **Parse/build home — record the decision.** The worker decided `parseProtocolUrl`/`createProtocolUrl` live here rather than a URL utility package. Sound, but it is a Decision the charter should record so a future URL package doesn't silently re-home them.
- **`createProtocolUrl` query ordering — bless one rule.** Insertion-order vs. sorted is currently unspecified and the two impls disagree. A one-line Decision (recommend: stable sort, both impls) closes the conformance gap and the round-trip determinism question at once.
- **Signals group.** Whether `enableProtocolSignals` (multi-listener/prioritized/cancellable deep-link delivery) is ever warranted, or the single `onOpenUrl` is the permanent shape. Defer until a real need.
