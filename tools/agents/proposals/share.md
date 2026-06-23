---
id: share
title: '@flighthq/share'
type: depth
target: share
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/share.md
  - tools/agents/docs/reviews/depth/share.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100. A correct, well-tested `{title, text, url}`-only subset of the canonical Web Share Level 2 surface; the seam shape is right but file sharing, presentation positioning, and result detail are missing.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The first genuinely useful version: a graphics SDK whose share capability cannot share an image is the glaring gap. Close it, plus the trivial precondition guard.

- **`ShareFile` descriptor in `@flighthq/types/Share.ts`** — a portable, browser-`File`-agnostic shape so the Rust port and native backends can carry it: `{ name: string; mimeType: string; dataUrl: string }` (mirrors `clipboard`'s data-URL image convention; avoids leaking the DOM `File`/`Blob` type into the header layer). Add `files?: readonly ShareFile[]` to `ShareContent`.
- **Wire `files` through `createWebShareBackend`** — convert each `ShareFile` to a DOM `File` (`dataUrl` → `Blob` → `File(name, type)`) and pass `{ files }` to `navigator.share` / `navigator.canShare`. Guard the conversion in `try/catch` and fall back to `false` (the existing expected-failure contract).
- **`canShareContent({ files })` becomes meaningful** — this is the canonical reason `navigator.canShare` exists; the probe must now genuinely delegate file shareability, not just title/text/url.
- **`isShareContentValid(content): boolean`** — documents and exposes the Web Share precondition ("at least one of title/text/url/files populated"). `shareContent` calls it and returns `false` early on an empty payload instead of swallowing an engine throw, so an obvious programmer mistake is a clean sentinel rather than a silent failure.
- **Tests** — file-share path (success/aliased/absent-API), `canShareContent({ files })` true/false, and `isShareContentValid` for each populated/empty combination. Colocated `share.test.ts`, `describe` blocks alphabetized.

Effort: small — one type field + one descriptor, ~30 lines of web-backend wiring, no new files.

### Silver

Competitive and solid: matches what the Capacitor / Tauri / Electron share surfaces this suite explicitly targets actually offer — presentation positioning, richer results, and a clean availability-vs-shareability split.

- **`ShareOptions` in `@flighthq/types`** — presentation/targeting that native sheets need and web ignores: `{ parentWindow?: ApplicationWindow; sourceRect?: Readonly<Rectangle>; dialogTitle?: string }`. `sourceRect` is the iPad/iPadOS popover anchor (required there); `parentWindow` mirrors `dialog`'s owner-window field; `dialogTitle` is the Android/Electron sheet title. Add an optional `options` parameter: `shareContent(content, options?)`.
- **`ShareResult` + `shareContentWithResult(content, options?): Promise<ShareResult>`** — `{ completed: boolean; activityType: string | null; dismissed: boolean }` so callers can distinguish _cancel_ from _failure_ and learn _which_ target the user picked (`activityType` is the iOS `UIActivityType` / Android component; `null` on web where it is unknowable). Keep `shareContent` as the boolean convenience wrapper (`(await shareContentWithResult(...)).completed`) so the simple path stays one call.
- **`isShareAvailable(): boolean`** — capability-level probe distinct from content-level `canShareContent`: "can this platform share at all" vs "is _this content_ shareable." Matters once files/MIME types exist (platform supports sharing, but not this type). Add `isAvailable(): boolean` to `ShareBackend`; web backend returns `typeof navigator !== 'undefined' && 'share' in navigator`.
- **`ShareBackend` grows `share(content, options?)` and `shareWithResult(content, options?)`** — the web `shareWithResult` returns `{ completed, activityType: null, dismissed }` (web cannot report the chosen target, but _can_ distinguish the `AbortError` cancel from other rejections via the caught error name).
- **`shareUrl(url, options?)` / `shareText(text, options?)` convenience free functions** — the two overwhelmingly common single-payload shares, each a thin wrapper over `shareContent`. Globally-unique names, full type words.
- **`@flighthq/share-formats` neighbor (optional, evaluate)** — only if file payload construction from SDK entities (e.g. `createShareFileFromImageSource(image, name): ShareFile` to share a rendered `Surface`/screenshot) grows beyond a one-liner. Keeps the `surface`/`resources` dependency out of the core `share` cell. Surface as a design decision, not built speculatively (see Sequencing).
- **Tests** — `ShareOptions` plumbed but web-ignored; `shareContentWithResult` cancel-vs-failure distinction (mock `navigator.share` rejecting with `AbortError` vs `TypeError`); `isShareAvailable` true/false; the `shareUrl`/`shareText` wrappers.

Effort: medium — additive across types + web backend + tests; the cancel/failure distinction requires reading the rejected error's `name`, which the current blanket `catch` discards.

### Gold

Authoritative / AAA: nothing a domain expert finds missing across the cross-platform share surface, plus 1:1 Rust-port parity and the host adapters that make the native fields real.

- **Full Web Share / native field coverage** — extend `ShareFile` to carry `size?: number` and accept multiple MIME categories; document the per-backend support matrix (web: title/text/url/files; iOS: + `activityType`, excluded-activity list; Android: + `dialogTitle`, chooser; Electron/Tauri: file paths). Add `excludedActivityTypes?: readonly string[]` to `ShareOptions` (iOS) and `chooserTitle?: string` (Android) where they have no portable equivalent.
- **`onShareResult` signal group via `enableShareSignals()`** — opt-in loose notification for hosts that complete a share asynchronously after the call returns (some native sheets fire completion on a later runloop tick). Lives in `@flighthq/share`, payload `ShareResult`, off by default so the cost is opt-in and the package stays `sideEffects: false`.
- **`flighthq-share` Rust crate** — 1:1 mirror: `ShareContent`/`ShareFile`/`ShareOptions`/`ShareResult` in `flighthq-types`, free functions `share_content`, `share_content_with_result`, `can_share_content`, `is_share_content_valid`, `is_share_available`, `share_url`, `share_text`, and the `ShareBackend` trait with `set_share_backend`/`create_web_share_backend`. Native default: a no-op/`false` backend (std cannot share without a host); `host-web` fills `navigator.share`; future `host-electron`/`host-tauri`/`host-capacitor` fill the native sheet. Recorded in the conformance map; assertion-ported tests for the validity/sentinel logic.
- **`@flighthq/host-electron` / future `host-tauri` / `host-capacitor` share backend** — concrete `createElectron*`-style adapters realizing `parentWindow`, file-path sharing, and `activityType`/dismissed reporting so the Silver fields are not web-stubs forever. (Cross-package — surface as a suggestion; these live in the host packages, not `share`.)
- **Exhaustive edge-case + error tests** — empty `files` array vs absent, oversized data-URL handling, malformed data-URL → `false`, `canShare` divergence (text shareable, files not), `AbortError`/`NotAllowedError`/`SecurityError`/`DataError` each mapped to the correct sentinel/result, alias-safety where applicable. Run under `jsdom` with `navigator.share`/`canShare`/error-shapes mocked.
- **Docs** — a short README / doc-comment matrix of which fields each backend honors, the "at least one populated field" precondition, and the cancel-vs-failure semantics of `ShareResult.dismissed` vs `completed`.

Effort: large but mostly breadth — the Rust crate and host adapters are the real work; the TS additions are incremental field/signal adds.

## Sequencing & effort

1. **Bronze first, in order: `ShareFile` type → web-backend `files` wiring → `canShareContent({files})` → `isShareContentValid` → tests.** This closes the single most-cited gap (sharing a rendered image — the obvious use for a graphics SDK) and is the highest value-per-effort. No external dependencies; ships independently.
2. **Silver next: `ShareResult`/`shareContentWithResult` and `ShareOptions` before the convenience wrappers.** `ShareOptions.parentWindow` depends on `ApplicationWindow` (already in `@flighthq/types`, used by `dialog`) and `sourceRect` on `Rectangle` from `@flighthq/geometry`/`types` — both already exist, no new cross-package types. The cancel-vs-failure distinction is the one non-trivial bit: replace the blanket `catch {}` with an error-`name` inspection.
3. **Gold is breadth, not depth: do the Rust crate (`flighthq-share`) and conformance-map entry once the TS field set is frozen at end of Silver** — porting a moving target wastes effort. Add it to the conformance map alongside the other platform-suite stubs.

Cross-package / design-decision items to surface to the user rather than act on autonomously:

- **`ShareFile` representation: portable `dataUrl` vs DOM `File`/`Blob`.** Recommendation: portable `{ name, mimeType, dataUrl }` to keep `@flighthq/types` browser-agnostic for the Rust port (matches `clipboard`'s data-URL image convention). The web backend converts to `File` at the boundary. This is a header-layer decision worth confirming before Bronze.
- **`@flighthq/share-formats` neighbor package** — only if `createShareFileFromImageSource` / share-a-`Surface` helpers materialize; they pull `surface`/`resources` and must not land in the core `share` cell. Decide at Silver whether the helper is big enough to warrant the `-formats` split.
- **Host-adapter share backends (`host-electron`/`host-tauri`/`host-capacitor`)** live in the host packages, not `share`. The Silver native fields (`parentWindow`, `activityType`, `excludedActivityTypes`) are web-ignored stubs until those adapters exist; flag that the fields are forward-declared, not yet honored anywhere but a future native host.

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

> Build `@flighthq/share` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
