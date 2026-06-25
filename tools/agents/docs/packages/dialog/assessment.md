---
package: '@flighthq/dialog'
updated: 2026-06-25
basedOn: ./review.md
---

# dialog — Assessment (merge gate, integration b2824e3d8)

> Sorted from `review.md` (this revision: **partial / 38**, a merge-gate review of the integration delta vs the approved `origin/main` baseline). The dominant item is a **build-breaking integration gap**, not a package-design gap: the dialog source design is sound and charter-aligned, but the integration head dropped the `@flighthq/types` half of the change, so the head does not type-check. The prior assessment (over the builder bundle, 86/100) is superseded by this merge-gate revision; its within-package recommendations carry forward where still applicable.

## Recommended

Sweep-safe: within `packages/dialog/`, no cross-package coupling, no open design decision. The headline **blocker is deliberately not here** — its fix is in `@flighthq/types`, outside this folder — so it is routed to Backlog and to the integration dispatch brief instead.

1. **Move `showWarningDialog` into source order.** It sits at `dialog.ts:391`, below the private FS-Access helpers and the two registries, breaking exports-first/loose-state-last order. Lift it into the alphabetized exported block and run `npm run order`. — review.md (secondary findings)

2. **Test the File System Access web backend.** The new picker paths (`openFileSystemAccessPicker`, `saveWebFile`, `openDirectoryPickerAccessApi`) and the three translators are untested; the suite only asserts "returns a Promise" / "null in jsdom" / fake-backend delegation. Inject a fake `window` carrying `showOpenFilePicker` / `showSaveFilePicker` / `showDirectoryPicker` and assert the two `WeakMap` registry round-trips (`getWebFileSystemHandle(handle) === nativeHandle`), the `startIn` mapping, the builders, and that `AbortError` / `SecurityError` both collapse to the sentinel. Pure helpers, isolatable. — review.md (secondary findings)

3. **Pin `buildFileSystemAccessTypes` empty-accept behavior.** An all-wildcard filter group yields `{ accept: {} }`, which the FS-Access API rejects (degrading silently to `[]`). Add a guard or a test that pins the intended behavior (`dialog.ts:146-160`). — review.md (secondary findings)

4. **Resolve the `Readonly<FileDialogHandle>` → cast nit.** `getWebFileSystemHandle` / `getWebDirectorySystemHandle` take `Readonly<FileDialogHandle>` then cast to key the `WeakMap`. Harmless (identity keying) but the param and key types are mismatched; align them or add a one-line comment that the cast is identity-only (`dialog.ts:71-72, 78-79`). — review.md (secondary findings)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **[MERGE BLOCKER — cross-package] Land the dialog/filesystem `@flighthq/types` delta into the integration head.** Missing from the head `@flighthq/types`: `FileDialogHandle`, the reshaped `OpenFileDialogOptions` / `SaveFileDialogOptions`, `OpenDirectoryDialogOptions`, `PromptDialogOptions`, `FileDialogStartIn`, and a `DialogBackend` whose `openFile`/`saveFile` return handles, whose `prompt` is options-bagged, that adds `openDirectory`, plus `MessageDialogResult.cancelled`. **Parked here: the edit is in `@flighthq/types`, not in this package's folder** — an in-`dialog` change cannot fix it. Routed to the integration worker (`outgoing/integration/dialog.md`). The predecessor builder bundle already contained this types delta; integration dropped it. — review.md (blocking finding)

- **Native `startIn` path resolution.** Honored on web; the path-resolving form is a `host-electron` / `host-tauri` concern. **Parked: cross-package.** — review.md (Backlog)

- **Directory-handle filesystem consumer.** `getWebDirectorySystemHandle` exists ahead of any `readDialogHandleDirectory` / walk consumer. **Parked: cross-package** (lives in `@flighthq/filesystem`). — review.md (Backlog)

- **Host dialog backends (`host-electron` / `host-tauri` / `host-capacitor`).** Multi-button message boxes, checkbox, `defaultId`/`cancelId`, `parentWindow`, real save paths, directory dialogs. **Parked: cross-package** — follows the frozen handle contract, does not precede it. — review.md (Backlog)

- **End-to-end filesystem-bridge integration test.** `showOpenFileDialog → handle → readFile` and `showSaveFileDialog → handle → writeFile` as a cross-package round-trip. **Parked: cross-package** root-level logic-only flow. — review.md (Backlog)

- **Rust `flighthq-dialog` crate.** Declared, unbuilt; the web/native `path` divergence (`null` vs `PathBuf`) needs a conformance-map entry. **Parked: other worktree.** — review.md (Backlog)

- **Lifecycle signals (`enableDialogSignals` / `onDialogResult`).** Adds a `@flighthq/signals` dependency most sibling platform cells avoid. **Parked: design decision** — routed to Open directions, not a defect. — review.md (charter fit)

- **`@flighthq/dialog-formats` (named filter presets).** Correctly not split now (no plurality; would overlap `resources` formats). **Parked: design decision** — one-line non-goal in charter Boundaries. — review.md (charter fit)

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses an item._

---

### Notes for the charter's Open directions (not edited here)

Charter silences this assessment surfaced for an explicit direction conversation, not actioned:

- **North star — command cell vs. lifecycle owner** (the `enableDialogSignals` / `@flighthq/signals` question). — charter Open directions (1)
- **Boundary — the `filesystem → dialog` dependency direction.** A real coupling between two platform cells; promote from implicit to a recorded Decision. — charter Open directions (2)
- **Boundary — handle as cross-cell currency** ("dialog never gains `readFile`/`writeFile`"). Reads like a Decision, not an assumption — promote. — charter Open directions (3)
- **Scope — `dialog-formats` non-goal** and **native `startIn` + directory bridge** as in-scope completeness vs. parked cross-package follow-ups. — charter Open directions (4, 5)
- **Integration process (meta).** This merge split an atomic change: the source landed without its `@flighthq/types` half. Worth a charter/process note that `dialog` + `filesystem` + their `@flighthq/types` shapes move as one unit, ideally enforced by a per-package check that the head `@flighthq/types` resolves the package's imports.
