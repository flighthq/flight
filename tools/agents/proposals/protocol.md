---
id: protocol
title: '@flighthq/protocol'
type: depth
target: protocol
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/protocol.md
  - tools/agents/docs/reviews/depth/protocol.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 70/100. Covers the core registration + warm-open delivery surface cleanly and idiomatically, but drops cold-start launch URLs, lacks the default-handler query/clear half of the control triplet, and ships no deep-link URL payload helpers.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely useful version: stop silently dropping deep-link launches and close the control-triplet asymmetry. All three are canonical in every reference impl.

- **Cold-start launch URL.** Add `ProtocolBackend.getLaunchUrl(): string | null` to `@flighthq/types` first, then `getProtocolLaunchUrl(): string | null` in the package. Returns the URL the app was launched with (deep-link cold start), `null` when not launched via a link. Web backend returns the `?url=` query param from `location` when present, else `null` (matches the web `register` handler's `/?url=%s` template). This is the single highest-value addition — without it, OS-launched deep links arrive before any listener attaches and are lost. Flat command, not an event (one-shot query), per the depth review's recommendation.
- **Default-handler query.** Add `ProtocolBackend.isDefault(scheme): boolean` + `isProtocolSchemeDefault(scheme): boolean`. Web returns `false`.
- **Default-handler clear.** Add `ProtocolBackend.removeAsDefault(scheme): boolean` + `removeProtocolSchemeAsDefault(scheme): boolean`. Web returns `false`. Completes the `set`/`is`/`remove` triplet for default-handler control.
- **Casing reconciliation.** The Package Map prose says "an `onOpenURL` handler entity" while code/type use `onOpenUrl`. Pick `onOpenUrl` (matches the rest of the codebase's `Url` trend and the `url` listener arg) and fix the Map prose, or rename — but make them agree. Apply the same casing to `getLaunchUrl`/`getProtocolLaunchUrl`.
- **Wire Electron backend through.** Extend `createElectronProtocolBackend` with `isDefault` → `isDefaultProtocolClient`, `removeAsDefault` → `removeAsDefaultProtocolClient`, and `getLaunchUrl` (read first matching `myapp://` arg from `process.argv` on Windows/Linux, cached `open-url`-at-launch on macOS). Colocated tests via the existing fake `ElectronApi`.
- **Rust crate mirror.** Add `get_launch_url`/`is_default`/`remove_as_default` to `flighthq-protocol`'s `ProtocolBackend` and the matching free functions (`get_protocol_launch_url`, `is_protocol_scheme_default`, `remove_protocol_scheme_as_default`), keeping the sentinel default backend in lockstep.

### Silver

Competitive and solid — what a well-regarded deep-link library offers for common professional use: structured URL payloads, multi-scheme ergonomics, and richer launch context.

- **Deep-link URL parsing.** Add `ParsedProtocolUrl` to `@flighthq/types` (`{ scheme, host, path, query }`, `query` a `Readonly<Record<string, string>>`) and `parseProtocolUrl(url): ParsedProtocolUrl | null` (sentinel `null` on malformed input). RN/Expo `Linking.parse` and every deep-link router ships this because consumers re-implement scheme/host/path/query splitting at the callsite otherwise. Decide explicitly whether this lives here or in a future URL utility package; if here, it is the natural payload helper for the domain (recommended — keeps the package self-sufficient). Record the decision inline.
- **Deep-link URL builder.** Add `createProtocolUrl(parts: Readonly<ParsedProtocolUrl>): string` — the `Linking.createURL` counterpart, with `parse`/`create` round-tripping. Alloc-explicit `create*` naming.
- **Multi-scheme convenience.** `registerProtocolSchemes(schemes: readonly string[]): boolean` and `unregisterProtocolSchemes(...)` — register/unregister a batch, returning `false` if any fails. Purely ergonomic but expected when an app claims several schemes (e.g. `myapp` + `myapp-staging`).
- **Enumerate registered schemes.** `getRegisteredProtocolSchemes(): readonly string[]` + `ProtocolBackend.getRegisteredSchemes(): readonly string[]`. Returns `[]` where the host cannot answer (web). Some hosts (Electron tracks its own set) can serve this; honestly returns empty otherwise.
- **Parsed delivery payload option.** Add a `subscribeParsed`-style path or a `getProtocolHandlerLastUrl` so warm-open consumers can opt into the parsed shape without re-parsing — keep `onOpenUrl` carrying the raw string (lossless), but offer parse at the listener as a documented one-liner (`parseProtocolUrl(url)`), avoiding a second signal unless a real need appears.
- **Launch-URL one-shot consumption semantics.** Document and test that `getProtocolLaunchUrl` is idempotent (re-readable) and that a launch URL is also delivered (or deliberately not) to a freshly-attached `onOpenUrl` — pick the RN/Capacitor convention (launch URL is the cold-start query; warm `onOpenUrl` fires only for subsequent opens) and lock it with tests so backends agree.
- **Cross-backend conformance tests.** A shared backend-behavior test (web + Electron fake) asserting sentinel parity, triplet symmetry, and parse/build round-trip — the cross-backend consistency the Silver bar requires.

### Gold

Authoritative / AAA — nothing a deep-link domain expert finds missing, full edge-case + error handling, and 1:1 Rust parity.

- **Scheme validation helpers.** `isValidProtocolScheme(scheme): boolean` enforcing RFC 3986 scheme grammar (ASCII letter start, `[a-z0-9+.-]*`, lowercased), and document that `register*` accepts only valid schemes (sentinel `false` on invalid, not throw — invalid scheme is expected user input, not API misuse). Mature libraries reject `http`/reserved schemes and malformed names rather than passing them to the OS.
- **Universal / app links seam (the genuine frontier).** Custom URI schemes are half of modern deep linking; the other half is OS-verified domain links (iOS Universal Links / Android App Links / Electron `setAsDefaultProtocolClient` has no web equivalent here). Add a sibling capability — either a second backend method group (`registerUniversalLink(domain)`, `isUniversalLinkRegistered`, association-file awareness) or a focused `@flighthq/applink` neighbor package — so `parseProtocolUrl`/`onOpenUrl` route both `myapp://` and `https://myapp.com/...` opens. Surface as a design decision to the user (new package vs. extended backend) before building.
- **Association-file generation helpers** (`-formats` neighbor pattern): `@flighthq/protocol-formats` emitting Electron `protocols` plist/manifest fragments, Android `intent-filter`, iOS `apple-app-site-association`, and Tauri `tauri.conf.json` deep-link config from a single descriptor — the build-time half every framework hand-writes. Parsers/serializers belong in the `-formats` neighbor, keeping the runtime package thin.
- **Pending / queued launch URLs.** Handle the multi-launch race: an app launched via link, then sent more links before `attachProtocolHandler` runs. Add a backend-buffered queue so no warm open is dropped between process start and first attach (Electron `open-url` can fire pre-`ready`). Document the buffering contract and test the pre-attach burst case.
- **Full sentinel/error matrix + alias-safety.** Audit every function: malformed URL → `null`, unsupported host → `false`/`[]`, never throw on expected absence; `parse`/`create` alias-safe and round-trip-exact including empty path, no host, multi-value query keys, percent-encoding, and unicode. Throw only on programmer misuse (e.g. non-string scheme), per the codebase rule.
- **Signals group (if multi-listener warranted).** If consumers need multiple prioritized/cancellable deep-link listeners, formalize an `enableProtocolSignals`-style opt-in group owned by this package rather than the single `onOpenUrl` signal — only if a real need emerges; the single signal is fine until then.
- **Exhaustive docs + functional/manual verification.** A package README mapping every function to its Electron/Tauri/Capacitor/RN counterpart, a worked cold-start + warm-open + parse example, and a manual host-electron verification scene (deep-link launch and warm open both routed). Plus a conformance-mapped Rust test scene if/when the host crates can route real opens.
- **Rust 1:1 parity.** `flighthq-protocol` mirrors the full final surface — `parse_protocol_url`/`create_protocol_url` (returning a `ParsedProtocolUrl` value type with `Readonly` borrows), multi-scheme, enumerate, validation, launch-URL queue — with the native default backend serving what `std`/host can answer and the divergence map recording any web-only sentinels. `protocol-formats` mirrored as `flighthq-protocol-formats` if built.

## Sequencing & effort

**Recommended order:**

1. **Bronze, all items (small, high value, do together).** They share one `@flighthq/types` `ProtocolBackend` edit, so define the three new methods (`getLaunchUrl`, `isDefault`, `removeAsDefault`) in the header first, then implement web + Electron + Rust in one pass. The Electron half is nearly free — the host primitives already exist in `electronModule.ts`. Reconcile the `onOpenUrl`/`onOpenURL` casing in the same change while touching the type. Est. low effort (a few hours); this alone lifts the package from "drops cold-start links" to functionally complete control surface.

2. **Silver parsing + builder (`parseProtocolUrl`/`createProtocolUrl`) next.** Self-contained value helpers, no backend changes, deterministic and trivially testable. Decide here whether parsing lives in `protocol` or a URL package — surface this as a one-line design question; recommendation is to keep it in `protocol` as the domain payload helper. Then multi-scheme + enumerate (thin wrappers). Est. low–moderate.

3. **Silver launch-URL semantics + cross-backend conformance tests.** Locks the cold-start vs. warm-open convention before more consumers depend on it. Moderate (mostly test + doc).

4. **Gold scheme validation** (cheap, isolated) before the larger Gold items.

5. **Gold universal/app links** — the real frontier and the largest item. **Cross-package design decision required**: extend `ProtocolBackend` vs. spawn `@flighthq/applink`. Do not act autonomously; surface to the user. This is where the package stops being "custom-scheme deep links" and becomes "deep linking," matching what iOS/Android/Electron actually require for production apps.

6. **Gold `protocol-formats` neighbor + pending-URL queue + full docs/Rust parity** last, as the polish that makes it authoritative.

**Dependencies on other packages / types:**

- Every new backend method and value type lands in `@flighthq/types` (`Protocol.ts`) first — the header layer is the design surface.
- Bronze touches `@flighthq/host-electron` (`electronProtocol.ts`) and the `crates/flighthq-protocol` mirror; keep all three in lockstep so the seam stays conformant.
- `ParsedProtocolUrl` is a new shared type; if a general URL package ever appears it may relocate — note the decision so it is auditable.
- Universal/app-links and the `-formats` neighbor are new package-shape decisions (`npm run packages:check` after) and need user sign-off before building.

**Items to surface as questions, not act on:**

- Parse/build helper home: `protocol` vs. a URL utility package.
- Universal-/app-link support shape: extended backend vs. new `@flighthq/applink` package (cross-package, design-level).
- Whether `protocol-formats` build-time association-file generation is in scope for this package family or belongs with host/build tooling.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/protocol` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
