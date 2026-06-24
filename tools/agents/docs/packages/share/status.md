---
package: '@flighthq/share'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# share — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/share

**Session date**: 2026-06-24 **Previous score**: 72/100 (solid) **Estimated new score**: 93/100

## Implemented APIs

### New types in `@flighthq/types/Share.ts`

- `ShareFile` — portable file descriptor (`name`, `mimeType`, `dataUrl`, `size?`). Uses data URLs to stay browser-File-agnostic for Rust port and native backends. The web backend converts `dataUrl → Blob → File` at the boundary.
- `ShareFile` field added to `ShareContent.files?: readonly ShareFile[]`
- `ShareResult` — full outcome type: `{ completed, activityType, dismissed }`. `activityType` is the iOS UIActivityType / Android component string, null on web. `dismissed` distinguishes cancel (AbortError) from failure.
- `ShareOptions` — presentation/targeting options: `parentWindow?`, `sourceRect?` (iPad popover), `chooserTitle?` (Android/Electron), `excludedActivityTypes?` (iOS).
- `ShareBackend` updated: added `isAvailable()`, `shareWithResult(content, options?)` methods; `share(content)` now accepts optional `options?`.

### New types in `@flighthq/types/ShareSignals.ts` (new file)

- `ShareSignals` — signals group for share completion events: `onShareResult: Signal<(result) => void>`.

### New functions in `@flighthq/share`

- `attachShareSignals(signals)` — registers a signals group to receive `onShareResult` emits from `shareContentWithResult`. Idempotent (replaces prior attachment).
- `detachShareSignals(signals)` — stops delivery; removes from listener map. Safe when not attached.
- `disposeShareSignals(signals)` — calls detach; signals group is then GC-eligible.
- `enableShareSignals()` — allocates a `ShareSignals` group with inert signals. Opt-in entry point.
- `isShareAvailable()` — capability-level probe ("can this platform share at all?"), distinct from `canShareContent` which asks about specific content.
- `isShareContentValid(content)` — returns true when at least one field (title, text, url, or non-empty files) is populated. Documents and enforces the Web Share API precondition.
- `shareContentWithResult(content, options?)` — full variant returning `ShareResult`; emits `onShareResult` to all attached signal groups. `shareContent` remains as the boolean convenience wrapper.
- `shareText(text, options?)` — convenience wrapper over `shareContent({ text })`.
- `shareUrl(url, options?)` — convenience wrapper over `shareContent({ url })`.

### Updated functions in `@flighthq/share`

- `shareContent(content, options?)` — now validates via `isShareContentValid` (returns false immediately for empty payload instead of forwarding to backend), and accepts optional `options` parameter.
- `createWebShareBackend()` — now implements `isAvailable`, `shareWithResult` (distinguishes AbortError → `dismissed=true` vs other errors → `dismissed=false`), and wires `files` through `navigator.share`/`navigator.canShare` (converting ShareFile data URLs to DOM Files at the boundary). `canShare` now passes files to `navigator.canShare`.

### Dependency change

Added `@flighthq/signals` as a runtime dependency (previously only `@flighthq/types`). Added `signals` reference to `tsconfig.json`.

### Test coverage

44 tests total (previously 5). New test coverage includes:

- File sharing path (canShare/share with files)
- `isShareContentValid` for all populated/empty combinations
- `isShareAvailable` (web absent, backend available, navigator.share present)
- `shareContentWithResult` cancel vs failure distinction (AbortError → dismissed=true, DataError → dismissed=false)
- `shareContentWithResult` emits to attached signal groups, not to detached ones
- `attachShareSignals` idempotency (double-attach fires once)
- `shareOptions` plumbed through shareContent/shareContentWithResult/shareText/shareUrl
- `activityType` reported from backend
- `canShare` delegates files to `navigator.canShare` (File instance check)

## Deferred items and why

### `@flighthq/share-formats` neighbor package

A helper like `createShareFileFromImageSource(image, name): ShareFile` to convert a rendered `Surface`/screenshot into a `ShareFile` would pull `@flighthq/surface` or `@flighthq/resources` into the `share` cell's dependency tree. Per the maturation roadmap, this is a design decision for the user to approve before proceeding: the split into a `-formats` sibling is only warranted if the helper is non-trivial. Surface as a suggestion, not acted on here.

### `flighthq-share` Rust crate

The TS field set is now frozen at Gold. The Rust crate should mirror: `ShareContent`/`ShareFile`/`ShareOptions`/`ShareResult` in `flighthq-types`, free functions `share_content`, `share_content_with_result`, `can_share_content`, `is_share_content_valid`, `is_share_available`, `share_text`, `share_url`, and the `ShareBackend` trait. Native default: a no-op backend; `host-web` fills `navigator.share`; future `host-electron`/`host-tauri`/`host-capacitor` fill the native sheet. Should be recorded in the conformance map. Deferred because this is Rust-scope work.

### Host-adapter share backends (`host-electron`, `host-tauri`, `host-capacitor`)

The Silver/Gold fields (`parentWindow`, `sourceRect`, `activityType`, `excludedActivityTypes`, `chooserTitle`) are forward-declared in `ShareOptions`/`ShareResult` but web-ignored. They become real when native host adapters in the `host-*` packages implement them. Those live in host packages, not `share`.

## Concerns and surprises

- The `_signalSubscriptions` map (reserved for future backends with subscribe/unsubscribe streams) is currently unused. It was pre-written in the forward-compatible pattern used by screen/network/other event capabilities, but the share web backend has no subscription model — it's call-based. Left in as a forward stub but is dead code currently. Could be removed if it causes confusion; kept for pattern consistency.
- `isShareContentValid` treats any non-empty string as valid. An empty-string title/text/url is caught. However, we do not validate that `url` is a well-formed URL — `navigator.share` may throw `TypeError` on some engines for malformed URLs. This is swallowed to `false` rather than surfaced, per the expected-failure contract. Adding URL validation would be a Bronze+ addition if desired.
- The Web Share API exposes `activityType` as `null` on web — there's no way to know which app the user chose. This is documented in `ShareResult.activityType`'s comment. Native hosts filling the `shareWithResult` backend method can return the actual activity type.

## Suggestions for future sessions

1. **`createShareFileFromImageSource` in `@flighthq/share-formats`** — a convenience to share a rendered screenshot directly from a `Surface`/`ImageSource`. Requires user approval of the `-formats` split first.
2. **Rust crate `flighthq-share`** — now straightforward to port since the TS field set is stable.
3. **Host adapter share backends** — `createElectronShareBackend(electron)` in `@flighthq/host-electron` realizing `parentWindow`, file-path sharing, and `activityType`/`dismissed` from Electron's `shell.openExternal`/dialog/custom IPC.
4. **`shareContentWithResult` + `shareText`/`shareUrl` with result variants** — `shareTextWithResult(text, options?)`, `shareUrlWithResult(url, options?)` convenience wrappers for the full-result path. Currently not added to keep the surface minimal; they are trivial to add if demand arises.
