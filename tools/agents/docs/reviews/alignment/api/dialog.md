# API Alignment: @flighthq/dialog

**Verdict:** Strong alignment with the command-capability seam pattern and convention rules; the only substantive issues are a parameter-shape asymmetry in `showPromptDialog` and a missing support-probe relative to sibling packages — both minor.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `showPromptDialog(message, defaultValue)` | Parameter-shape asymmetry. Every other `show*Dialog` function takes a single `Readonly<*DialogOptions>` object; `showPromptDialog` takes positional `message: string, defaultValue = ''`. This breaks the options-object symmetry of the package and gives the prompt no room for `title`/`parentWindow` that the other dialogs all carry. | Introduce a `PromptDialogOptions` type in `@flighthq/types` (`message`, `defaultValue?`, `title?`, `parentWindow?`) and change the signature to `showPromptDialog(options: Readonly<PromptDialogOptions>)`. The backend `prompt` method would follow. |
| Low | (package surface) | No support/availability probe. Sibling command packages expose one (`isNotificationSupported`); dialog has none, so a caller cannot distinguish "host has no dialog surface" from "user cancelled" without invoking the dialog. | Consider adding `isDialogSupported(): boolean` (or per-capability `canShowOpenFileDialog`) for parity with `notification`. Optional — sentinels already cover the cancel/missing-surface cases, so this is a discoverability nicety, not a correctness gap. |
| Info | `showConfirmDialog(options: Readonly<MessageDialogOptions>)` | Type reuse: confirm and message share `MessageDialogOptions`, but the web backend's `confirm` only reads `options.message`, ignoring `buttons`/`checkboxLabel`/etc. The shared type implies fields that confirm does not honor. | Acceptable as-is (native hosts may honor more of it), but document that confirm consumes a subset, or split a narrower `ConfirmDialogOptions`. No action required. |
| Info | `MessageDialogResult.buttonIndex` vs `MessageDialogOptions.defaultId` / `cancelId` | Same concept (a button position) is named `buttonIndex` in the result but `defaultId` / `cancelId` in the options. Mild index-vs-id vocabulary drift within one feature. | Optional: unify on `index` (`defaultIndex` / `cancelIndex`) so the button-position vocabulary is consistent across the type quartet. Lives in `@flighthq/types`. |

## Clean

- **Backend-seam shape is canonical.** `createWebDialogBackend` / `getDialogBackend` / `setDialogBackend(backend: DialogBackend | null)` exactly match the command-capability pattern used by `clipboard`, `shell`, `storage`, and `notification` — verb-for-verb (`createWeb*`, `get*`, `set*`).
- **Full, unabbreviated type words in every export.** `showOpenFileDialog`, `showSaveFileDialog`, `showMessageDialog`, `showConfirmDialog`, `showPromptDialog`, `*DialogBackend` — no abbreviation of the `Dialog` / `FileDialog` / `MessageDialog` type words; names are globally self-identifying and `Dialog`-namespaced for root-barrel uniqueness.
- **Sentinels, never throws, for expected failure.** `[]` (open cancel/no document), `null` (save/prompt cancel or no surface), `false` (confirm cancel), `{ buttonIndex: 0, ... }` (message dismissed). Every web-backend path guards `window`/`document` and `try/catch`es into a sentinel rather than throwing — matching the "dialog dismissal is an expected outcome" rule. No precondition throws either.
- **`Readonly<T>` on every option parameter.** `showMessageDialog`, `showConfirmDialog`, `showOpenFileDialog`, `showSaveFileDialog` all take `Readonly<*DialogOptions>`; primitive args (`message`, `defaultValue`) are correctly exempt.
- **`import type {}` isolated.** Types are imported in a single dedicated `import type { ... } from '@flighthq/types'` block; no inline `import { type Foo, bar }` mixing.
- **Cross-package types live in `@flighthq/types`.** `DialogBackend`, all `*DialogOptions`, `MessageDialogResult`, `MessageDialogKind`, and `FileDialogFilter` are defined in `types/src/Dialog.ts`, not inline in the package.
- **`getDialogBackend` is a true getter** returning `DialogBackend`; no boolean masquerading as `get*`, no accessor misuse. Lazy web-default creation is documented at the slot (`let _backend` at file bottom) per Source Style.
- **Side-effect-free / no top-level registration.** `sideEffects: false`; the backend slot starts `null` and is only populated via `getDialogBackend`/`setDialogBackend` — no module-top-level install.
- **Single root `.` export, thin barrel.** `index.ts` is `export * from './dialog'` only; no per-file subpaths.
- **Source Style: helpers at the bottom.** Public `show*`/backend functions are alphabetized first; the `_backend` slot and private `openWebFileDialog` / `buildAcceptAttribute` helpers sit after the public surface.
