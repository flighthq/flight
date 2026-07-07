---
package: '@flighthq/clipboard'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head tree + changes.patch (packages/clipboard hunks)
  - packages/types/src/Clipboard.ts (base == head)
  - status.md (as-claimed)
  - charter.md (draft)
---

# Review: @flighthq/clipboard — merge gate (integration b2824e3d8 → origin/main eb73c3d74)

## Verdict

**REJECT for merge as-is — partial, 35/100.** This is a merge-gate score, not a quality score for the work the builder did. The **clipboard package half** of the change is well-shaped in isolation — a generic MIME format seam, atomic multi-flavor write, batch read, file flavor, a completed `has*` set, and an `@flighthq/network`-shaped `ClipboardWatch` change-event capability, all with colocated tests. But the integration head is **not buildable**: the `@flighthq/types` half of the change — the new `ClipboardWatch` / `ClipboardWriteItem` types and the ~10 new `ClipboardBackend` methods the package and its tests depend on — **never landed in the integration tree**. `packages/clipboard/src/clipboard.ts` imports symbols and calls interface methods that do not exist in `@flighthq/types`. `tsc -b` cannot pass. The status doc claims the types shipped; the diff proves they did not. The package cannot merge until the types half is restored.

The other axes (composition, naming, tree-shaking, sentinels, dispose-correctness) are clean and would pass on their own — see the per-axis pass/fail below. The score is dominated by the single hard compile break, because a merge gate cannot pass code that does not type-check.

## The merge blocker — types-first half was lost in integration

**Grounded.** `b2824e3d8:packages/clipboard/src/clipboard.ts:2`:

```ts
import type { ClipboardBackend, ClipboardBookmark, ClipboardWatch, ClipboardWriteItem } from '@flighthq/types';
```

`ClipboardWatch` and `ClipboardWriteItem` are imported from `@flighthq/types`, but neither type exists there. `b2824e3d8:packages/types/src/Clipboard.ts` is **byte-identical** between base and head (`diff` is empty), and a tree-wide grep finds `ClipboardWatch` / `ClipboardWriteItem` only inside `packages/clipboard/` — never in `packages/types/`. Likewise the `ClipboardBackend` interface in head's `Clipboard.ts` still declares only the original surface (`readText`/`writeText`/`readHtml`/`writeHtml`/`hasText`/`readImage`/`writeImage`/`hasImage`/ `readRTF`/`writeRTF`/`readBookmark`/`writeBookmark`/`clear`) — yet the new web backend in `b2824e3d8:packages/clipboard/src/clipboard.ts:30-225` implements and the free functions call: `readFormat`, `writeFormat`, `hasFormat`, `getFormats`, `writeItems`, `readItems`, `readFiles`, `writeFiles`, `getChangeCount`, `subscribeClipboardChange`. None of these are members of `ClipboardBackend` in the integration tree.

The status doc itself describes the missing files as if they shipped — `b2824e3d8:agents/packages/clipboard/status.md` (in `changes.patch` ~L52930):

> - `packages/types/src/ClipboardFormat.ts` — canonical MIME string constants …
> - `packages/types/src/ClipboardWatch.ts` — event entity … `ClipboardWatch { onChange: Signal<…> }`.
> - `packages/types/src/ClipboardWriteItem.ts` — `{ readonly format: string; readonly data: string }` …
> - `Clipboard.ts` — extended `ClipboardBackend` with: … `readFormat`, `writeFormat`, `hasFormat`, `getFormats`, `writeItems`, `readItems` … `readFiles`, `writeFiles` … `getChangeCount`, `subscribeClipboardChange`.

`changes.patch` contains **no `diff --git a/packages/types/src/Clipboard*.ts`** hunk at all. The package + status doc were carried into integration; the `@flighthq/types` commits were dropped in the merge. The status entry is correctly flagged "as-claimed, not yet review-verified" — and this review verifies it as **not true of the integration tree**.

Consequences in the head tree:

- `clipboard.ts` fails to compile (missing type imports; calls to non-existent interface methods).
- `b2824e3d8:packages/clipboard/src/clipboard.test.ts:38-47` annotates `fakeBackend(): ClipboardBackend & { … }` and implements `readFormat`/`writeFormat`/`writeItems`/`readItems`/`getChangeCount`/ `subscribeClipboardChange`. Against the un-extended `ClipboardBackend`, those are excess methods on a literal typed as `ClipboardBackend & {…}` — the test file cannot type-check either (`tsc -b` typechecks `src/*.test.ts`).
- Every new free function (`getClipboardFormats`, `hasClipboardFormat`, `readClipboard`, `writeClipboard`, `readClipboardFiles`, `writeClipboardFiles`, `readClipboardFormat`, `writeClipboardFormat`, `getClipboardChangeCount`, `hasClipboardBookmark`, the watch quartet) delegates to a backend method the type does not expose.

This is the textbook "types-first" violation the contract guards against, surfacing as a merge artifact: the header layer is the design surface, and here the implementation shipped without its header.

## Per-axis pass/fail (the DELTA, against the 7 standards)

1. **Composition / bedrock — PASS.** The delta is flat free functions over the `ClipboardBackend` seam plus a small `ClipboardWatch` event entity; no config-gated mega-function, no fused subjects. The generic `readClipboardFormat`/`writeClipboardFormat` seam is the bedrock primitive and the named-flavor functions (`readClipboardHtml` → `readFormat('text/html')`, `b2824e3d8:packages/clipboard/src/clipboard.ts:143-148,184-189`) are thin convenience over it — the right decomposition.

2. **Naming clarity — PASS (one minor consistency note).** New exports carry the full `Clipboard` word and correct verbs (`getClipboardFormats`, `hasClipboardFormat`, `readClipboard`, `writeClipboard`, `attachClipboardWatch`/`detachClipboardWatch`/`disposeClipboardWatch`/ `createClipboardWatch`). `hasClipboardRTF` (`:281`) keeps the upper-case `RTF` acronym — this matches the base's existing `readClipboardRTF`/`writeClipboardRTF`, so it is consistent with the approved baseline, not a delta regression. Not a blocker.

3. **Tree-shaking / bundle invariant — PASS.** `package.json` keeps `"sideEffects": false` and a single root `.` export (`b2824e3d8:packages/clipboard/package.json:7-12,37`); `index.ts` is a thin `export * from './clipboard'`. No eager registration, no top-level execution. The new module state — `const _watchSubscriptions = new WeakMap<…>()` (`:376`) and the lazy `_backend` (`:375`) — sits at the file bottom and is touched only inside functions, not at import time. The named-flavor functions delegate rather than branch, so no shared hot-loop switch taxes a primitive importer.

4. **Registry vs closed union (fork B) — PASS / n/a.** No `switch (kind)` over a growing family; the flavor surface is keyed by MIME string through `readFormat(format)` / `writeFormat(format, …)`, which is already the open, user-extensible shape this fork prefers.

5. **Subject triad + plurality guard — PASS / n/a.** No format-codec or backend split is introduced; the change stays inside the one command-capability package. Correct.

6. **Contract hygiene — MIXED, dominated by the types-first FAIL.** Sentinels are right (`getChangeCount` → `-1` at `:209-211`; `readFiles` → `[]` at `:199-201`; `readFormat`/`readItems` → `''`/`{}`; `writeFiles` → `false`). `dispose*` vs `destroy*` is correct: `disposeClipboardWatch` (`:240-242`) detaches the backend subscription and releases to GC, owning no non-GC resource — `dispose*`, not `destroy*`, is the right verb. `Readonly<>` is used on the new aggregate params/returns (`readClipboard(formats: readonly string[])`, `writeClipboard(items: readonly Readonly<ClipboardWriteItem>[])`, `Promise<Readonly<Record<string, string>>>`). **But** the axis fails overall because the seam types (`ClipboardWatch`, `ClipboardWriteItem`, the extended `ClipboardBackend`) are **not** in `@flighthq/types` — the single most important contract rule for this delta is broken (see merge blocker above).

7. **Tests & honesty — FAIL (compile) + one logic nit.** The new `describe` blocks are alphabetized and mirror the new exports (`attachClipboardWatch`, `createClipboardWatch`, `detachClipboardWatch`, `disposeClipboardWatch`, `getClipboardChangeCount`, `getClipboardFormats`, `hasClipboardBookmark`, `hasClipboardFormat`, `hasClipboardHtml`, `hasClipboardRTF`, `readClipboard`, `readClipboardFiles`, `readClipboardFormat`, `writeClipboard`, `writeClipboardFiles`, `writeClipboardFormat`) — good shape. But they cannot compile against the un-extended `ClipboardBackend` (blocker above), so the "tests pass" claim in status.md is false **for the integration tree**. Separately, the web backend's change-event feature-detect is sloppy: `b2824e3d8:packages/clipboard/src/clipboard.ts:216-219`

   ```ts
   if (
     'onclipboardchange' in target ||
     typeof (window as unknown as Record<string, unknown>)['clipboardchange'] !== 'undefined'
   ) {
   ```

   The second clause probes a non-standard `window.clipboardchange` property (not `onclipboardchange`); it is effectively always `undefined` and dead, and the double-cast through `unknown as Record<string, unknown>` is the kind of escape hatch the surrounding code otherwise avoids. Harmless at runtime, but it should be a single honest `'onclipboardchange' in window` feature test. Minor; not a merge blocker.

## What is genuinely good in this delta (so the fix is cheap to restore)

The package-side design is the right shape and should survive intact once the types are restored: the generic MIME seam as bedrock, the named flavors as convenience, the atomic `writeClipboard(items)` write, the `[]`/`{}`/`-1`/`false` sentinel discipline, and the `create*`/`attach*`/`detach*`/`dispose*` event-entity shape that mirrors `@flighthq/network`. The fix is not a redesign — it is restoring the three `@flighthq/types` files and the `ClipboardBackend` extension that the package was written against.

## Where the contract/admin docs need a follow-up

- The Package Map line in `index.md` still reads "system clipboard read/write (text, HTML)"; the delta covers HTML, image, RTF, bookmark, files, the generic MIME seam, atomic write, and change events. (Recommended in assessment, but **after** the merge is buildable — not a gate item.)
- `package.json` `description` (`b2824e3d8:packages/clipboard/package.json:36`) likewise understates the surface.
- The `ClipboardFormat` constants the status doc says were added are unused by the package's own code even in the builder's worktree (the `has*` paths hardcode `'text/x-moz-url'` / `'text/html'` / `'text/rtf'`); fold that into the same types-restore pass.
