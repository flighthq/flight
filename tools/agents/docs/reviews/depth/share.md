# Depth Review: @flighthq/share

**Domain**: Native share sheet / system share invocation (Web Share API + native host backends)

**Verdict**: solid — 72/100

This is a small-surface platform-integration capability, not a sprawling domain like easing or path. The honest bar is: does it cover what a mature cross-platform "share" capability is expected to do? Against that bar it covers the core well but leaves real, canonical share features unaddressed (files, validation, presentation positioning), so it lands at the top of "solid" rather than "authoritative."

## Present capabilities

The package exposes the full command-capability seam described in the Package Map (flat functions + `get*/set*/createWeb*` backend trio):

- `shareContent(content)` — opens the share sheet; resolves `true` on success, `false` on deny/cancel/unavailable. Correct sentinel-not-throw semantics.
- `canShareContent(content)` — capability probe delegating to the backend.
- `createWebShareBackend()` — default backend over `navigator.share` / `navigator.canShare`, fully guarded for jsdom and unsupported browsers (typeof checks, try/catch, `?? false`).
- `getShareBackend()` — lazy web default; always returns a backend.
- `setShareBackend(backend | null)` — install a native host backend, `null` resets to web default.

The `ShareContent` shape (`title`, `text`, `url`) and `ShareBackend` trait live in `@flighthq/types/Share.ts` as the codebase rules require. Tests cover every exported function including the aliased/cancel/absent-API paths. Web-backend feature detection and error swallowing are genuinely robust — this is a well-built seam, not a sketch.

## Gaps vs an authoritative share library

A canonical share capability (Web Share API Level 2, plus the Capacitor/Tauri/Electron native share surfaces this suite explicitly targets) is expected to cover more than `{title, text, url}`:

- **File sharing (`files`).** The single biggest omission. Web Share API Level 2 and every native share sheet support sharing files/blobs/images. `ShareContent` has no `files` field and `canShareContent` cannot probe file shareability (`navigator.canShare({ files })` is the canonical use of `canShare`, and the whole reason `canShare` exists). Without it, sharing an image/screenshot — the obvious use case for a _graphics_ SDK — is impossible. This is missing-by-omission, not by-design.
- **Share targets / dialog positioning.** Native sheets and some platforms accept an anchor rect / source view (iPad popover requires `sourceRect`; Tauri/Electron want an owner window). No `ShareOptions` for presentation. Missing-by-omission for the native backends this suite promises.
- **Result detail.** Returns a bare `boolean`. Several native share APIs report _which_ activity/app the user chose (`activityType`) or distinguish cancel from failure. The boolean collapses cancel and error, which the doc comment acknowledges but does not expose.
- **Text/url validation or normalization.** No guard that at least one field is present, or that `url` is a valid/absolute URL — `navigator.share({})` throws on some engines; here it is swallowed to `false`, hiding a likely programmer error. A canonical lib documents the "at least one of title/text/url/files" precondition.
- **`canShareContent` granularity.** It is the only probe; there is no separate "is sharing available at all" vs "is _this content_ shareable" distinction, which matters once files exist (platform supports sharing, but not this MIME type).

None of these require leaving the established backend-seam style; they are additions to `ShareContent`/`ShareBackend` plus web-backend wiring.

## Naming / API-shape notes

- Naming is consistent with the suite and the design rules: full type words (`shareContent`, `canShareContent`, `ShareBackend`), `createWeb*Backend`, `get*/set*Backend`. No abbreviations.
- `canShareContent` correctly returns `boolean` (sync) while `shareContent` is `Promise<boolean>` — this mirrors the native APIs precisely.
- The module-level `_backend` singleton is the standard pattern for these capabilities and is `sideEffects: false`-clean (lazy, no top-level instantiation).
- Doc comments are accurate and carry the expected-failure contract well. Good.
- One shape concern for future-proofing: adding `files` later is a non-breaking field add, so the current `ShareContent` does not paint the API into a corner — but `canShare` returning a plain bool may want a richer return once files land.

## Recommendation

Promote toward authoritative by closing the file-sharing gap first: add `files?: readonly (File | Blob)[]` (or a portable `ShareFile` descriptor in `@flighthq/types` to stay browser-File-agnostic for the Rust port) to `ShareContent`, wire it through the web backend's `navigator.share`/`canShare`, and add a test for `canShareContent({ files })`. Then add a small `ShareOptions` (anchor rect / owner) for native sheet positioning, and consider a documented precondition for "at least one populated field." With files + presentation options this becomes an authoritative share capability; as-is it is a correct, well-tested, but `{title,text,url}`-only subset of the canonical Web Share Level 2 surface.
