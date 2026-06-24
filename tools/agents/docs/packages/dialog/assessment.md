---
package: '@flighthq/dialog'
updated: 2026-06-24
basedOn: ./review.md
---

# dialog — Assessment

> Recommendations over `review.md` (solid, 86/100). Most of the prior depth roadmap's Bronze and much of Silver have **already landed** (handle-returning pickers, the severity triad, `showOpenDirectoryDialog`, options-bag `showPromptDialog`, `showErrorBox`, `MessageDialogResult.cancelled`, the File System Access primary path with `<input>` fallbacks, `startIn` filtering, MIME-aware filter translation, the two WeakMap registries, and the `filesystem → dialog` handle bridge). What remains is a small within-package finish line plus a set of cross-package / design-fork items. The prior roadmap (`reviews/maturation/depth/dialog.md`) is fully absorbed here and can be removed as one-time seed.

## Recommended

Sweep-safe: all within `@flighthq/dialog`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

1. **Test the File System Access web-backend paths.** The single largest hole (review § Gaps). The suite only asserts "returns a Promise" / "returns null in jsdom" plus fake-backend delegation; the real picker paths (`openFileSystemAccessPicker`, `saveWebFile`, `openDirectoryPickerAccessApi`) and their helpers are untested. Inject a fake `window` carrying `showOpenFilePicker` / `showSaveFilePicker` / `showDirectoryPicker` and assert: the handle round-trips (`getWebFileSystemHandle(handle) === nativeHandle`, and the directory variant), the `<input>` fallback still yields handles with `path: null`, and `AbortError`/`SecurityError` both collapse to the sentinel. The helpers are pure and trivially testable in isolation. — review.md#gaps

2. **Pin `buildFileSystemAccessTypes` behavior for an all-wildcard MIME filter.** When `filter.mimeTypes` is `['image/png']` and `extensions` is all `'*'`, the produced `accept` map is empty (`{ accept: {}, description }`), which the FS-Access API rejects at runtime. Add a guard (drop the empty entry, or fold `mimeTypes` into `accept` keys) and a colocated test that pins the intended behavior either way. — review.md#gaps

3. **Verify and (if needed) fix source order via `npm run order`.** `showWarningDialog` and the loose module state (`let _backend`, the two registries) sit between/among exported functions rather than exports-first-then-loose-state-at-bottom. Run `npm run order` (and `order:fix`) and confirm `exports:check` / `api dialog` are green; leave the file in the canonical scan order. — review.md #contract-&-docs-fit (small nits)

4. **Resolve the `Readonly<FileDialogHandle>` → `FileDialogHandle` cast nit.** `getWebFileSystemHandle` takes `Readonly<FileDialogHandle>` then casts to index the `WeakMap<FileDialogHandle, …>`. Harmless (WeakMap keys by identity), but the param type and registry key type are deliberately mismatched — either align the key type or add a one-line comment that the cast is identity-only, so the intentional mismatch is documented rather than read as an oversight. — review.md#contract-&-docs-fit (small nits)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **Native `startIn` resolution.** `FileDialogStartIn` is honored on web; the Electron backend still uses `defaultPath`. A `startIn`→path resolver lives in `host-electron` / `host-tauri`, not in the dialog cell. **Parked: cross-package** (host backends own native path resolution). — review.md#gaps

- **Directory-handle filesystem bridge.** `getWebDirectorySystemHandle` exposes the handle, but no `readDialogHandleDirectory` / `walkDialogHandleDirectory` consumes it. **Parked: cross-package** — the consumer belongs in `@flighthq/filesystem`, not here (the accessor correctly exists ahead of it). — review.md#gaps

- **`@flighthq/host-electron` / `host-tauri` / `host-capacitor` dialog backends.** Proving the seam is not web-shaped (multi-button message boxes, checkbox, `defaultId`/`cancelId`, `parentWindow`, real save paths, directory dialogs; desktop + mobile). **Parked: cross-package** — out-of-cell work that should follow the now-frozen handle contract, not precede it. (host-electron's dialog backend appears already started per the status; the remaining hosts are net-new.) — depth-roadmap Silver/Gold

- **End-to-end filesystem-bridge integration test.** `showOpenFileDialog → handle → readFile` and `showSaveFileDialog → handle → writeFile` exercised as a cross-package round-trip. **Parked: cross-package** — a root-level logic-only integration flow spanning `dialog` + `filesystem`, not a within-`dialog` unit test. — depth-roadmap Silver

- **Rust `flighthq-dialog` crate.** `crate: flighthq-dialog` is declared but unbuilt; the web/native `path` divergence (`null` vs `PathBuf`) needs a conformance-map entry. **Parked: other worktree** — out of scope for this TS worktree; noted for the port. — review.md#gaps

- **Lifecycle signals (`enableDialogSignals` / `onDialogOpen` / `onDialogResult`).** Adds a `@flighthq/signals` dependency that most sibling platform cells avoid. **Parked: design decision** — routed to the charter's Open directions (North star: pure command cell vs. lifecycle owner). Not a defect. — review.md#candidate-open-directions (1)

- **`@flighthq/dialog-formats` (named filter presets).** Per structural-forks' plurality guard this is correctly _not_ split now (no plurality; would overlap `resources` formats). **Parked: design decision** — belongs as a one-line non-goal in charter Boundaries so a later agent does not re-litigate. Routed to Open directions. — review.md#candidate-open-directions (4)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

These are charter silences this assessment had to assume past — surfaced for an explicit direction conversation, not actioned:

- **North star — command cell vs. lifecycle owner** (the `enableDialogSignals` / `@flighthq/signals` question). — review.md#candidate-open-directions (1)
- **Boundary — the `filesystem → dialog` dependency direction** (I/O domain imports from the handle-source domain). A real coupling between two platform cells; promote from implicit to a recorded Decision. — review.md#candidate-open-directions (2)
- **Boundary — handle as cross-cell currency** ("dialog never gains `readFile`/`writeFile`; the handle is the currency"). Reads like a Decision, not an assumption. — review.md#candidate-open-directions (3)
- **Boundary — `dialog-formats` non-goal** (filter presets stay out unless plurality appears and does not overlap `resources`). — review.md#candidate-open-directions (4)
- **Scope — native `startIn` + directory bridge** as in-scope completeness work vs. parked cross-package follow-ups. — review.md#candidate-open-directions (5)
