---
package: '@flighthq/dialog'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
  - 'types: Dialog.ts (head, unchanged from base)'
---

# dialog — Merge Review (integration b2824e3d8 vs approved origin/main eb73c3d74)

> This is a **merge-gate** review of the incoming delta only. Baseline is `origin/main` (`eb73c3d74`), the blessed floor (`incoming/integration-b2824e3d8/base/packages/dialog/`) — not under review. Candidate is the integration head (`incoming/integration-b2824e3d8/head/packages/dialog/`). Every objection below is grounded in a `b2824e3d8:<path>` hunk. The prior package review (score 86, evidence `incoming/builder-67dc46d64`) graded a _different_ bundle that **did** carry the new dialog types in `@flighthq/types`; the integration bundle reviewed here **dropped them**, which is the central finding.

## Verdict

**REJECT for merge — partial / 38.** The dialog source delta is, on its own, a good redesign in the direction the charter already drafts: pickers return a `FileDialogHandle` (handle-as-currency), a first-class `showOpenDirectoryDialog`, the kind-forcing message family (`showInfoDialog` / `showWarningDialog` / `showErrorDialog` / `showErrorBox`), and a File System Access API web backend with honest `<input>` fallbacks. But the integration head **does not compile**: the head `dialog.ts` (and the head `filesystem.ts`, and three test files) import types from `@flighthq/types` that the integration head's `@flighthq/types` does not define. The type-layer half of the change was lost in integration. As a gate into the approved baseline this is an automatic block — the approved floor builds; this delta does not.

## Blocking finding — the delta does not type-check

The head implementation imports four types from `@flighthq/types` that are **absent** from the head types package:

`b2824e3d8:head/packages/dialog/src/dialog.ts:1-11`

```ts
import type {
  DialogBackend,
  FileDialogHandle,
  FileDialogStartIn,
  MessageDialogOptions,
  MessageDialogResult,
  OpenDirectoryDialogOptions,
  OpenFileDialogOptions,
  PromptDialogOptions,
  SaveFileDialogOptions,
} from '@flighthq/types';
```

But `b2824e3d8:head/packages/types/src/Dialog.ts` is **byte-identical to base** (a `diff base head` on the file exits 0; the `changes.patch` slice contains **no** hunk under `packages/types/src/Dialog.ts`), and it defines none of `FileDialogHandle`, `FileDialogStartIn`, `OpenDirectoryDialogOptions`, or `PromptDialogOptions`. There is no `FileDialogHandle.ts` in the head types package (`ls head/packages/types/src/FileDialogHandle.ts` → not found), and `head/packages/types/src/index.ts` exports no such symbol. `FileDialogHandle` is _referenced_ in `dialog.ts`, `dialog.test.ts`, and `filesystem.test.ts`, and _defined nowhere_ in the entire head tree. `tsc -b` cannot resolve these imports — the build fails.

Three concrete shape mismatches follow from the same lost type-layer change, each independently a compile error against the head `@flighthq/types`:

1. **`MessageDialogResult` has no `cancelled` field.** `b2824e3d8:head/packages/types/src/Dialog.ts:48-51` still declares only:

   ```ts
   export interface MessageDialogResult {
     buttonIndex: number;
     checkboxChecked: boolean;
   }
   ```

   yet the head backend returns `cancelled` — `b2824e3d8:head/packages/dialog/src/dialog.ts:33` (`return { buttonIndex: 0, cancelled: false, checkboxChecked };`) — and the tests assert it (`b2824e3d8:head/packages/dialog/src/dialog.test.ts:63`, `expect(typeof result.cancelled).toBe('boolean')`). `cancelled` is excess-property on the typed result.

2. **`DialogBackend.openFile` / `saveFile` return strings, not handles.** `b2824e3d8:head/packages/types/src/Dialog.ts:57-58` still declares `openFile(...): Promise<string[]>` and `saveFile(...): Promise<string | null>`, but the head impl resolves `FileDialogHandle[]` / `FileDialogHandle | null` (`b2824e3d8:head/packages/dialog/src/dialog.ts:45-47, 56-58`).

3. **`DialogBackend.prompt` is positional; head calls it option-bagged, and `openDirectory` is missing.** `b2824e3d8:head/packages/types/src/Dialog.ts:60` is `prompt(message: string, defaultValue: string)`, but the head backend implements `prompt(options)` reading `options.message` / `options.defaultValue` (`b2824e3d8:head/packages/dialog/src/dialog.ts:48-55`) and adds an `openDirectory` method (`b2824e3d8:head/packages/dialog/src/dialog.ts:42-44`) that the interface does not declare.

This is not a stylistic nit — it is a missing half of an atomic change. The dialog/filesystem source was integrated without the `@flighthq/types` edit (the new `FileDialogHandle`, the reshaped `OpenFileDialogOptions`/`SaveFileDialogOptions`, `OpenDirectoryDialogOptions`, `PromptDialogOptions`, `FileDialogStartIn`, and the `cancelled`/handle-shaped `DialogBackend`). The fix is to land that types delta into the integration `@flighthq/types`, not to touch dialog further.

## Secondary findings (delta-introduced, non-blocking)

- **New web FS-Access surface is effectively untested.** The head adds `openFileSystemAccessPicker`, `saveWebFile`, `openDirectoryPickerAccessApi`, and the three translators (`buildFileSystemAccessTypes`, `buildAcceptAttribute`, `toFileSystemAccessStartIn`) — `b2824e3d8:head/packages/dialog/src/dialog.ts:142-377` — but the test delta only asserts "returns a Promise" / "null in jsdom" / delegation through a fake backend (`b2824e3d8:head/packages/dialog/src/dialog.test.ts:66-86, 227-231`). None of the FS-Access paths, the two `WeakMap` registry round-trips, or the builders are exercised. These helpers are pure and trivially testable with an injected fake `window`. Not a merge blocker by itself, but it is new, behaviorally significant code shipping dark.

- **`buildFileSystemAccessTypes` can emit an `accept: {}` the API rejects.** `b2824e3d8:head/packages/dialog/src/dialog.ts:146-160`: when a filter has only mimeTypes-less wildcard extensions (all `'*'`) the `accept` map stays empty, yielding `{ accept: {}, description }`, which the File System Access API throws on. Caught by the surrounding `try/catch` → sentinel `[]`, so it silently degrades to "picker did nothing" rather than throwing — but it is an avoidable dead-on-arrival filter group. Worth a guard or a pinning test.

- **Source order: `showWarningDialog` sits below the private helpers.** The new export is at `b2824e3d8:head/packages/dialog/src/dialog.ts:391`, after the registries and the private FS-Access helpers, breaking the "exported functions first (alphabetized), loose/private state last" scan order (`index.md › Source Style`). `npm run order` should be run; this is a one-move fix.

- **`Readonly`-then-cast on the bridge accessors (cosmetic).** `b2824e3d8:head/packages/dialog/src/dialog.ts:71-72, 78-79` take `Readonly<FileDialogHandle>` then immediately `handle as FileDialogHandle` to key the `WeakMap`. Harmless (WeakMap keys by identity), but the param `Readonly` is decorative against a same-type cast. Acceptable.

## What is right in the delta (do not relitigate)

- **Composition / bedrock (PASS).** Dialog stays a single command cell; it does not fuse byte-I/O (that stays in `@flighthq/filesystem` via the `getWebFileSystemHandle` / `getWebDirectorySystemHandle` bridge — `b2824e3d8:head/packages/dialog/src/dialog.ts:71-80`). Handle-as-currency is the right cut and matches the charter's North star.
- **Naming (PASS).** Full unabbreviated names throughout (`showOpenDirectoryDialog`, `getWebDirectorySystemHandle`, `createWebDialogBackend`); `get*`/`set*`/`createWeb*` command shape; `show*` for the dialog verbs. Globally self-identifying.
- **Tree-shaking (PASS).** `b2824e3d8:head/packages/dialog/package.json` keeps `sideEffects: false`, a single `.` export, and `@flighthq/types` as the only dependency. No eager registration, no top-level side effects; `index.ts` is a thin `export * from './dialog'`.
- **Registry-vs-union (N/A).** No `kind` dispatch family here; the swappable `DialogBackend` is the seam. No closed-union smell.
- **Subject triad / plurality (PASS).** No premature `dialog-formats` split; named filter presets are correctly parked (charter Boundaries). Filters pass as data.
- **Sentinels-not-throws (PASS).** Every web path guards `window`/`document`/method existence and resolves to `false`/`null`/`[]`/zero-button on cancel or absence; `AbortError`/`SecurityError` collapse to the sentinel inside `try/catch` (`b2824e3d8:head/packages/dialog/src/dialog.ts:264-267, 341-344`).

## Charter fit

The charter (`draft: true`) already describes the head design — handle-as-currency, a first-class directory picker, the message family, FS-Access-first with honest fallbacks. The **design** of the delta matches the drafted charter. The **integration** of it does not deliver that design, because the type-layer dependency is missing. Open direction #6 ("the untested web backend") is confirmed by this review and remains live.

## Contract & docs fit

- **Types-first contract — VIOLATED in the integration head**, not by intent but by omission: the source depends on `@flighthq/types` shapes that the head types package does not contain (see the blocking finding). The contract requires the header layer to define the surface _first_; here the implementation ships without it.
- Everything else (single `.` export, `sideEffects: false`, `import type` on its own lines, comments carrying ownership/aliasing rules on the two registries) is contract-clean in the delta.
