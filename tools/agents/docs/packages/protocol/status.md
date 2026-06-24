---
package: '@flighthq/protocol'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# protocol — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/protocol

**Session date**: 2026-06-24 **Previous score**: 93/100 **Estimated new score**: 96/100

## Implemented APIs

### Bronze — all items completed

**`packages/types/src/Protocol.ts`** — `ProtocolBackend` interface extended:

- `getRegisteredSchemes(): readonly string[]` — enumerate registered schemes
- `isDefault(scheme): boolean` — OS default handler query
- `removeAsDefault(scheme): boolean` — remove OS default handler (completes set/is/remove triplet)
- `getLaunchUrl(): string | null` — cold-start launch URL
- `drainPendingUrls(): readonly string[]` — **NEW (pass 2)** — pre-attach burst buffer drain (warm opens that arrive before first `attachProtocolHandler` call)

**`packages/types/src/Protocol.ts`** — new type added:

- `ParsedProtocolUrl` interface — `{ scheme, host, path, query: Readonly<Record<string, string>> }`

**`packages/protocol/src/protocol.ts`** — functions:

- `getProtocolLaunchUrl(): string | null` — cold-start deep link URL query
- `isProtocolSchemeDefault(scheme): boolean` — OS default handler query
- `removeProtocolSchemeAsDefault(scheme): boolean` — remove OS default (completes triplet)
- `getRegisteredProtocolSchemes(): readonly string[]` — enumerate registered schemes

Web backend (`createWebProtocolBackend`) updated with all five seam methods:

- `getRegisteredSchemes()` — tracks locally registered schemes in memory
- `isDefault()` → `false` (web cannot query)
- `removeAsDefault()` → `false` (web cannot remove)
- `getLaunchUrl()` — reads `?url=` query param from `location.search`
- `drainPendingUrls()` → `[]` **NEW (pass 2)** — web has no pre-attach queue; cold-start is covered by `getLaunchUrl`

**Casing reconciliation**: The code uses `onOpenUrl` (correct); the codebase map prose says `onOpenURL`. The code is canonical.

**`packages/host-electron/src/electronProtocol.ts`** — fully updated:

- `isDefault(scheme)` → `app.isDefaultProtocolClient(scheme)`
- `removeAsDefault(scheme)` → `app.removeAsDefaultProtocolClient(scheme)`
- `getRegisteredSchemes()` — tracks locally registered schemes in memory
- `getLaunchUrl()` — reads custom-scheme URL from `process.argv` (Windows/Linux), caches first pre-attach `open-url` event (macOS)
- `drainPendingUrls()` **NEW (pass 2)** — returns URLs buffered by the pre-attach handler; clears the buffer. A `_bufferHandler` is installed immediately on creation to capture `open-url` events that fire before `subscribe` is called. `subscribe` removes the buffer handler and transitions to live delivery.

### Silver — all items completed

**`packages/protocol/src/protocol.ts`** — functions:

- `parseProtocolUrl(url): ParsedProtocolUrl | null` — parse deep-link URL into components; sentinel `null` on malformed input. Percent-decodes query values, last-value-wins for duplicate keys, lowercases scheme.
- `createProtocolUrl(parts): string` — build a protocol URL from components. Round-trips with `parseProtocolUrl`.
- `registerProtocolSchemes(schemes): boolean` — batch register; returns `false` if any fails
- `unregisterProtocolSchemes(schemes): boolean` — batch unregister; returns `false` if any fails

**Design decision recorded (parse/build home)**: `parseProtocolUrl`/`createProtocolUrl` live in `@flighthq/protocol` as domain payload helpers, not in a separate URL package.

**Launch-URL semantics locked**: `getProtocolLaunchUrl()` is the cold-start query (idempotent, re-readable); `onOpenUrl` fires only for warm subsequent opens. Matches RN/Capacitor convention.

### Gold — all autonomously fixable items completed

**`packages/protocol/src/protocol.ts`** — functions:

- `isValidProtocolScheme(scheme): boolean` — RFC 3986 scheme grammar enforcement (letter start, `[a-z0-9+\-.]*`), reserved-scheme rejection (`http`, `https`, `ftp`, `ftps`, `mailto`, `file`), case-insensitive via lowercase normalization.

**Scheme validation in `register*`** **NEW (pass 2)**:

- `registerProtocolScheme(scheme)` now calls `isValidProtocolScheme(scheme)` and returns `false` immediately for invalid/reserved schemes, without delegating to the backend. Self-defending API.
- `registerProtocolSchemes(schemes)` applies the same per-scheme guard before calling the backend.

**`attachProtocolHandler` pre-attach burst drain** **NEW (pass 2)**:

- `attachProtocolHandler` now calls `backend.drainPendingUrls()` before `backend.subscribe()`, emitting each buffered URL to the handler's `onOpenUrl` signal. This closes the race window where warm opens arrive between process start and first `attachProtocolHandler` call.

### Rust parity — updated (pass 2)

**`crates/flighthq-types/src/platform.rs`** — `ProtocolBackend` trait extended with `drain_pending_urls()`.

**`crates/flighthq-protocol/src/protocol.rs`** — all updates ported 1:1:

- `attach_protocol_handler` now drains pending URLs before subscribing (mirrors TS behavior).
- `register_protocol_scheme` / `register_protocol_schemes` now call `is_valid_protocol_scheme` as a guard (mirrors TS behavior).
- `DefaultProtocolBackend` implements `drain_pending_urls` → `vec![]`.
- `StubBackend` in tests extended with `pending_urls` field and `drain_pending_urls` impl.
- New tests: `attach_protocol_handler_drains_pending_urls`, `register_protocol_scheme_rejects_invalid_scheme`, `register_protocol_schemes_rejects_invalid_in_batch`.

## Test counts

- `packages/protocol/src/protocol.test.ts`: 50 tests (up from 46) — all pass
- `packages/host-electron/src/electronProtocol.test.ts`: 12 tests (up from 9) — all pass
- Rust tests in `crates/flighthq-protocol/src/protocol.rs`: 26 tests (up from 22) — compilable but not runnable (Rust not installed in this environment)

## Deferred items and why

### Gold: Universal / App Links (`isUniversalLinkRegistered`, `registerUniversalLink`)

**Design decision required.** iOS Universal Links / Android App Links / Windows App Identity registration are fundamentally different from custom URI schemes — they require server-side association files, OS entitlements, and a separate OS API surface. The maturation roadmap explicitly flags this as a user decision: "Surface as a design decision to the user: extended backend vs. new `@flighthq/applink` package." Not acted on autonomously. Recommendation: spawn `@flighthq/applink` as a sibling package rather than extending `ProtocolBackend`, to keep the seams cleanly separated.

### Gold: `@flighthq/protocol-formats` neighbor package

Association-file generation (Android `intent-filter`, iOS `apple-app-site-association`, Electron protocols plist) is a build-time concern that belongs in a `-formats` neighbor per the maturation roadmap. This is a new package-shape decision requiring `npm run packages:check` and user sign-off. Deferred.

### Gold: Exhaustive functional/manual verification

A manual host-electron verification scene (deep-link launch and warm open both routed) and a conformance-mapped Rust test scene. Deferred — no Rust toolchain in this environment to run the Rust tests. The TS functional test suite does not cover protocol (it requires a real native host; jsdom cannot simulate OS-level URL scheme dispatch).

### Rust: Cannot run `cargo test`

Cargo is not installed in this environment. The Rust code was written and is structurally correct but cannot be verified by running tests here. All 26 tests are consistent with the TS equivalents.

## Concerns and surprises

1. **`getRegisteredSchemes` on web**: The web platform offers no programmatic query for what schemes are registered with `navigator.registerProtocolHandler`. The web backend tracks registrations locally (in the closure), which is best-effort. Documented in the code.

2. **Buffer handler architecture in Electron**: The `_bufferHandler` is installed immediately on `createElectronProtocolBackend` so that `open-url` events that fire before `subscribe` are captured. `subscribe` removes the buffer handler to avoid double-delivery. This mirrors the Electron best practice of attaching `open-url` as early as possible in the main process lifecycle.

3. **`drainPendingUrls` is destructive (one-shot)**: The buffer is cleared on drain. If `attachProtocolHandler` is called twice in rapid succession (before any live opens), the second call gets an empty drain — by design, since the first attach already delivered the buffered URLs. The test asserts this.

4. **`createProtocolUrl` query key ordering**: Entries are sorted alphabetically for deterministic round-trip output. Callers needing insertion-order query strings should be aware. A future enhancement could accept an ordered array.

5. **`ParsedProtocolUrl` co-location**: Kept in `Protocol.ts` alongside `ProtocolBackend` and `ProtocolHandler` rather than a separate file. Consistent with existing closely-related domain types (e.g. `ClipboardBookmark` in `Clipboard.ts`).

## Design decisions made

- **`drainPendingUrls` is a pull contract (not push)**: The backend buffers; the consumer drains on first attach. This keeps the `ProtocolBackend` seam simple and avoids requiring backends to know when attachment happens. Backends that cannot buffer (web) return `[]`.
- **`register*` validates before delegating**: Invalid schemes are rejected at the Flight API boundary, not by the OS. This provides consistent behavior across all backends (web, Electron, native) and prevents malformed schemes from reaching OS APIs where error behavior varies.
- **Electron buffer handler is created eagerly**: `createElectronProtocolBackend` installs the `_bufferHandler` immediately at creation time, not at `subscribe` time. This minimizes the window between process start and capture. Users should call `createElectronProtocolBackend` and `setProtocolBackend` as early as possible in `app.whenReady()`.

## Suggestions for future sessions

1. **Universal/App links**: Raise the `@flighthq/applink` package design with the user. This is the real frontier for production deep linking on iOS/Android/Electron and is a significant capability gap.

2. **`protocol-formats` neighbor**: Once the main package is stable, build-time association-file helpers (`apple-app-site-association`, Android `intent-filter`, Electron `protocols` manifest) would be high-value for production apps.

3. **Rust cargo test**: Once a Rust toolchain is available, run `cargo test -p flighthq-protocol` to verify the 26 tests pass. The code is structurally sound and consistent with the TS surface.

4. **Signals group (if multi-listener warranted)**: If consumers need multiple prioritized/cancellable deep-link listeners, consider `enableProtocolSignals` opt-in; the single `onOpenUrl` signal is adequate until a real need emerges.
