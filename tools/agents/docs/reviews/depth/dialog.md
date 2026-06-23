# Depth Review: @flighthq/dialog

**Domain:** Native host dialogs — file open/save pickers and message/confirm/prompt boxes — over a swappable web/native backend seam.

**Verdict:** solid — 72/100

This is a deliberately thin capability cell, not a sprawling library, and judged against what a _dialog_ capability actually needs to cover, it is close to complete. The score reflects a few genuine omissions in the canonical dialog feature set rather than a stub-level surface.

## Present capabilities

Exported free functions (`src/dialog.ts`):

- `showOpenFileDialog(options) → Promise<string[]>` — open-file picker with `multiple`, `directory`, `filters`, `defaultPath`, `title`, `parentWindow`. Web backend builds a transient `<input type=file>`, maps `filters` to an `accept` attribute, honors `multiple` and `webkitdirectory`, and resolves `[]` on cancel (handling both the missing-`change` case and the newer `cancel` event).
- `showSaveFileDialog(options) → Promise<string | null>` — save picker with `title`, `defaultPath`, `filters`. Web returns `null` by design (browsers cannot expose a writable host path).
- `showMessageDialog(options) → Promise<MessageDialogResult>` — message box returning `{ buttonIndex, checkboxChecked }`. Option shape covers `title`, `message`, `detail`, `buttons`, `kind` (`info`/`warning`/`error`/`question`), `checkboxLabel`, `checkboxChecked`, `defaultId`, `cancelId`, `parentWindow`.
- `showConfirmDialog(options) → Promise<boolean>`.
- `showPromptDialog(message, defaultValue) → Promise<string | null>`.
- Backend seam: `createWebDialogBackend()`, `getDialogBackend()` (lazy web default), `setDialogBackend(backend | null)`. Matches the platform-suite command pattern exactly.

The **type surface** (`@flighthq/types/Dialog.ts`) is notably richer than what the web backend can deliver, which is correct: the option interfaces describe the full native contract (multi-button message boxes, checkbox, default/cancel button ids, message kind, parent-window attachment), and the web backend gracefully degrades to sentinels. The web backend is carefully guarded for jsdom/non-document hosts and never throws — dismissal is treated as an expected outcome, per the sentinel convention. This is the right design for the domain.

## Gaps vs an authoritative dialog library

Measuring against the canonical native-dialog surface (Electron `dialog`, Tauri `dialog`, GTK/Win32/Cocoa file+message dialogs, OpenFL's `FileReference`/`FileReferenceList`), the following are absent:

- **No file content I/O.** This is the largest functional gap relative to OpenFL/Flash, the stated feature target. OpenFL's `FileReference.load`/`save`/`browse` round-trips actual _bytes_, and the modern web `showSaveFilePicker`/`showOpenFilePicker` (File System Access API) return writable/readable handles. This package returns only file _names_ on open and `null` on save — there is no way to read picked-file contents or write data back through the dialog. A user picking a file gets a name they cannot then read. This is arguably the defining feature of a "file dialog" library and is missing-by-omission, not missing-by-design (the web platform does support it via the File System Access API and `FileReader`).
- **No directory-selection dialog as a first-class call.** Directory picking is folded into `showOpenFileDialog({ directory: true })`. Most mature APIs expose a distinct "select folder" entry (Electron `properties: ['openDirectory']`, Tauri `open({ directory: true })` is similar, but GTK/Cocoa treat it as a distinct dialog). Acceptable as a flag, but worth noting the canonical surface often names it.
- **No `showErrorBox` / severity-specialized helpers.** `kind` carries severity, but Electron-style convenience (`dialog.showErrorBox(title, content)`) and the common `showWarning`/`showError`/`showInfo` triad are absent. Minor — derivable from `showMessageDialog`.
- **No multi-line / list / custom-input dialogs.** `showPromptDialog` is single-line only. No combo/select-from-list dialog. These exist in some toolkits; arguably out of scope for a "native dialog" cell (custom content is a UI-layer concern).
- **No progress dialog.** Common in native toolkits (GTK `GtkProgressBar` dialog, Win32 `IProgressDialog`). Reasonably out of scope.
- **`defaultPath` semantics on save are untestable on web.** The save-file native contract includes a suggested filename + starting directory; the web backend discards it entirely. Correct degradation, but means the package ships zero working save behavior on its always-available default backend.

The single most impactful addition would be **byte-level file read/write through the picked handle** (open → bytes, save → write bytes), since that is what makes a file dialog _useful_ rather than a name reporter. Without it, the package is a competent dialog-launcher but not an authoritative file-dialog library.

## Naming / API-shape notes

- Naming is clean and self-identifying: `showOpenFileDialog`, `showSaveFileDialog`, `showMessageDialog`, `showConfirmDialog`, `showPromptDialog` all carry the full domain word, alphabetized in source. Backend trio (`createWebDialogBackend`/`getDialogBackend`/`setDialogBackend`) matches the platform-suite command convention precisely.
- Sentinel discipline is exemplary and documented inline: `[]` / `null` / `{ buttonIndex: 0 }` / `false` on cancel or missing surface, never throws.
- `showPromptDialog` is the lone signature that takes positional args `(message, defaultValue)` rather than an options object, while every sibling takes an options bag. Minor asymmetry; a `PromptDialogOptions` (title, default, placeholder) would align it and leave room for the missing title/placeholder fields.
- `Readonly<>` is applied to all option parameters in both the package and the `DialogBackend` interface. Good.
- Option types correctly live in `@flighthq/types`; the package is a pure delegating seam with no inline cross-package types.

## Recommendation

Mark as **solid**, not authoritative. The seam, naming, sentinel behavior, and message/confirm/prompt coverage are AAA-quality for their scope. To reach authoritative for the _file_-dialog half of the domain, add byte-level I/O on the modern web backend (File System Access API: `showOpenFilePicker`/`showSaveFilePicker` returning readable/writable handles, with the current `<input>` path as fallback), so `showOpenFileDialog` can yield contents and `showSaveFileDialog` can actually persist on web — this directly serves the OpenFL `FileReference` feature target. Lower-priority follow-ups: an options-object form for `showPromptDialog`, and convenience `showErrorBox`/severity helpers over `showMessageDialog`. Directory picking as a dedicated call is optional given the existing `directory` flag.
