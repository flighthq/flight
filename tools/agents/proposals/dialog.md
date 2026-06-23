---
id: dialog
title: '@flighthq/dialog'
type: depth
target: dialog
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/dialog.md
  - tools/agents/docs/reviews/depth/dialog.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100. A clean, sentinel-disciplined capability cell whose biggest gap is that a picked file yields only a _name_, never its _bytes_; the seam, naming, and message/confirm/prompt coverage are already AAA for their scope.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that turns this from a name-reporter into a useful file dialog, plus the cheap polish the review names.

- **`FileDialogHandle` type in `@flighthq/types`** — an opaque, `Readonly` plain-data descriptor for a picked file/directory: `{ kind: FileDialogHandleKind; name: string; path: string | null }` where `FileDialogHandleKind` is a `*Kind` string (`'File'` | `'Directory'`). `path` is the real host path on native, `null` on web. The handle is the cross-cell currency; its readable/writable identity is realized by `@flighthq/filesystem`, not by carrying a live web `FileSystemFileHandle` in the public type (that stays on the web backend's internal slot).
- **`showOpenFileDialog` returns `FileDialogHandle[]`** (was `string[]`). Web backend keeps the `<input type=file>` fallback but, when `window.showOpenFilePicker` exists (File System Access API), uses it and stashes the live handle on a backend-private registry keyed by the returned `FileDialogHandle`. Still resolves `[]` on cancel.
- **`showSaveFileDialog` returns `FileDialogHandle | null`** (was `string | null`). Web backend uses `window.showSaveFilePicker` when present (honoring `defaultPath`'s suggested filename via `suggestedName` and `filters` via `types`), returning a handle whose writable can be opened by `@flighthq/filesystem`; falls back to `null` only when the API is absent. This finally gives the always-available web backend _working save behavior_.
- **`PromptDialogOptions` type in `@flighthq/types`** — `{ title?; message: string; defaultValue?; placeholder? }`. Add an options-object overload/signature so `showPromptDialog` aligns with its siblings; keep the positional form working in Bronze only if cheap, otherwise migrate (pre-release, no compat owed).
- **`showErrorBox(title, content)` free function** — the canonical Electron-named convenience over `showMessageDialog({ kind: 'error', ... })`. The one named helper users reach for by name.
- **Tests** for the new return shapes: handle arrays, save-handle on a mocked File System Access surface, `<input>` fallback path still yields handles with `path: null`, prompt options form.

### Silver

Competitive with Electron/Tauri `dialog`: the full canonical surface, severity helpers, and a real native host backend so the seam is proven by more than the web default.

- **Severity helper triad** — `showInfoDialog`, `showWarningDialog`, `showErrorDialog` over `showMessageDialog`, mirroring `showErrorBox` but returning the full `MessageDialogResult`. Thin, named, derivable, expected.
- **`showOpenDirectoryDialog(options) → Promise<FileDialogHandle[]>`** — directory picking as a first-class call (the canonical toolkits name it distinctly even though `showOpenFileDialog({ directory: true })` already works). Shares `OpenDirectoryDialogOptions` (`title`, `multiple`, `defaultPath`, `parentWindow`) in `@flighthq/types`.
- **`OpenFileDialogOptions` enrichment** — `buttonLabel?` (custom confirm-button text; Electron/Tauri support it), `showHiddenFiles?`, and `properties` parity flags consolidated where they map cleanly (`treatPackageAsDirectory`, `dontAddToRecent`). Keep `directory`/`multiple` as the canonical flags.
- **`SaveFileDialogOptions` enrichment** — `buttonLabel?`, `defaultName?` split from `defaultPath` (suggested filename vs. starting directory; native honors both, web maps `defaultName` → `suggestedName`).
- **`MessageDialogResult` parity** — add `cancelled: boolean` derived from `cancelId` so callers don't re-derive it; web `confirm`/`alert` set it correctly.
- **`@flighthq/host-electron` dialog backend** — the depth review notes the package ships zero working native behavior. Provide `createElectronDialogBackend(electron)` honoring multi-button message boxes, checkbox, `defaultId`/`cancelId`, `parentWindow` attachment, real save paths, and directory dialogs. This is what proves the seam is not web-shaped. (Lands in `host-electron`, surfaced here as a cross-package item.)
- **Filesystem bridge documented & tested end-to-end** — `showOpenFileDialog → FileDialogHandle → readFile(handle)` and `showSaveFileDialog → FileDialogHandle → writeFile(handle, bytes)` exercised as an integration test, proving the cellular round-trip OpenFL's `FileReference.load`/`save` covers, without dialog owning I/O.
- **Signals group (opt-in)** — `enableDialogSignals()` exposing an `onDialogOpen`/`onDialogResult` signal pair for apps that want to observe dialog lifecycle (analytics, focus management). Opt-in per the `enable*` convention so the cost stays off by default; signals stay tree-shaken when unused.

### Gold

Authoritative: exhaustive native parity, full edge-case/error handling, the importer neighbor pattern where relevant, and 1:1 Rust-port mirror.

- **`@flighthq/host-tauri` / `@flighthq/host-capacitor` dialog backends** — complete the host matrix (desktop + mobile). Mobile share/save semantics (`@flighthq/share` interplay) handled or explicitly delegated.
- **Filter completeness** — MIME-type filters alongside extension filters in `FileDialogFilter` (`mimeTypes?: string[]`), correct `<input accept>` + File System Access `types[].accept` mapping, and the "All Files" sentinel (`extensions: ['*']`) handled uniformly across every backend.
- **Recent-files / bookmark seam** — `startIn` (well-known directory: `'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos'`) on open/save options, mapping to File System Access `startIn` and native start directories; coordinated with `@flighthq/filesystem`'s standard-directory paths so the two cells agree on the vocabulary.
- **`@flighthq/dialog-formats` neighbor package (only if warranted)** — if dialog grows file-type _presets_ (named filter bundles: "Images", "Audio", "Video", "Flight scenes") that overlap with `@flighthq/resources` formats, factor them into a focused `-formats` neighbor rather than baking a registry into the cell. Surface as a design decision; may instead live in `resources`.
- **Full error-path coverage** — every backend method exhaustively tested for: missing surface, permission denial (File System Access `SecurityError`/`AbortError` distinction — `AbortError` → sentinel cancel, `SecurityError` → sentinel cancel + optional signal), oversized selection, and aliased/duplicate handles. Confirm _nothing_ throws on any expected path; document the one misuse case that may.
- **Performance** — multi-thousand-file directory selections return handles without O(n) DOM churn or eager byte reads; handles stay lazy until `filesystem` reads them.
- **API/order/exports gates green** — `npm run api dialog`, `exports:check`, `order:check` clean; every exported function has a colocated test; docs note the dialog↔filesystem handle contract.
- **Rust crate `flighthq-dialog`** — 1:1 mirror: `show_open_file_dialog`, `show_save_file_dialog`, `show_open_directory_dialog`, `show_message_dialog`, `show_confirm_dialog`, `show_prompt_dialog`, `show_error_box`, severity helpers; `DialogBackend` trait + `set_dialog_backend`; native default backend (rfd / native file dialogs) behind the `native` feature; `FileDialogHandle` carrying a real `PathBuf` on native; `host-web` fills the File System Access seam. Conformance map entry pairs it with the TS package. Recorded in the divergence map: web returns path-less handles, native returns real paths — an intentional, documented divergence.

## Sequencing & effort

Recommended order, with dependencies and the items that need a decision before code:

1. **DESIGN DECISION FIRST — the I/O ownership line (blocks all of Bronze).** Confirm dialog returns `FileDialogHandle` and `@flighthq/filesystem` owns the bytes; dialog never gains a `readFile`/`writeFile`. This determines the `@flighthq/types` shape and prevents duplicating the filesystem cell. Surface to the user before implementing — it touches two packages' contracts. (Low effort to decide, high blast radius.)
2. **Bronze types in `@flighthq/types`** (`FileDialogHandle`, `FileDialogHandleKind`, `PromptDialogOptions`) — the header layer goes first, per the rules. Small. Then the dialog package implementation (handle returns, File System Access path with `<input>` fallback, `showErrorBox`, prompt options) and its tests. Medium effort; self-contained in `dialog` + `types`. The handle return-type change is a breaking signature change — fine pre-release, but note it ripples to any example using `showOpenFileDialog`.
3. **Bronze↔Silver hinge: the filesystem bridge** must be wired (read/write a `FileDialogHandle`) before the Silver integration test and before host backends are worth writing. This is a **cross-package coordination item** with `@flighthq/filesystem` — decide whether the live web `FileSystemFileHandle` registry lives in `dialog`'s backend, in `filesystem`, or in a shared internal. Recommend dialog's backend holds it and hands `filesystem` an opaque token; surface this seam choice to the user.
4. **Silver** — severity helpers, `showOpenDirectoryDialog`, option enrichments, and `MessageDialogResult.cancelled` are quick and local. The **`host-electron` backend** is the larger Silver item and lives in another package; schedule it once the handle/filesystem contract is frozen so the native side implements the final shape, not a moving one. The signals group is independent and small; do it last in Silver.
5. **Gold** — additional host backends (`host-tauri`, `host-capacitor`) are each a meaningful effort and depend on those host packages existing/maturing; gate on demand. The `-formats` neighbor is a **design decision to defer**: only split it out if filter presets actually grow and overlap `@flighthq/resources` — otherwise it is premature. Full error-path coverage and the API/order/exports gates are the cheap finish line. The **Rust `flighthq-dialog` crate** is the final parallel track; it depends on `flighthq-types` carrying `FileDialogHandle` and on the conformance map entry, and mirrors the same divergence (path-less web handles vs. native paths).

**Cross-package / decision items to raise explicitly:** (a) the dialog-returns-handle vs. dialog-reads-bytes ownership line with `@flighthq/filesystem`; (b) where the live web handle registry lives; (c) whether a `dialog-formats` neighbor or `resources` owns filter presets; (d) the `host-electron`/`host-tauri` backends are out-of-cell work that should follow, not precede, the frozen handle contract.

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

> Build `@flighthq/dialog` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
