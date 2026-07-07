---
package: '@flighthq/keyboard'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/keyboard.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# keyboard — Review (merge gate: integration-b2824e3d8 → origin/main)

## Verdict

**`revise` — do not merge as-is.** This is a merge-gate review of the **delta** (`incoming/integration-b2824e3d8/head` vs the approved baseline `origin/main` `eb73c3d74`), not a survey of the package's eventual shape. The keyboard _source_ change in isolation is the same idiomatic event-capability upgrade a prior review scored 90 against the builder worktree `<67dc46d64>` — will/did phases, the frame rect, the native control extensions, and a Chromium VirtualKeyboard web path. **But this integration branch carries the keyboard package's source upgrade without the `@flighthq/types` changes it depends on.** The head `@flighthq/types` is byte-identical to base for keyboard: `Keyboard.ts` still has the 3-signal `SoftKeyboard`, the 2-field `SoftKeyboardInfo`, and the bare `subscribe(() => void)`; none of the four new `SoftKeyboard*.ts` type files exist; `index.ts` exports zero `SoftKeyboard*` symbols. The head keyboard package imports five symbols and several fields that **are defined nowhere in the head bundle**. It cannot typecheck or build. That is a hard merge blocker regardless of the source's standalone quality.

The score (45) reflects the **integration state**, not the source's intrinsic quality: a package that does not compile against its own dependency in the branch being merged is not `solid`. The earlier 90 stands only against `<67dc46d64>`, where the types shipped alongside.

## The blocker — dangling `@flighthq/types` imports (standard 7: compiles)

The delta `b2824e3d8:packages/keyboard/src/keyboard.ts` opens with:

```ts
import type {
  SoftKeyboard,
  SoftKeyboardBackend,
  SoftKeyboardInfo,
  SoftKeyboardPhase,
  SoftKeyboardResizeMode,
  SoftKeyboardStyleKind,
  SoftKeyboardTransition,
} from '@flighthq/types';
import { SoftKeyboardResizeNoneKind } from '@flighthq/types';
```

And `b2824e3d8:packages/keyboard/src/keyboard.test.ts` additionally imports the value consts `SoftKeyboardResizeBodyKind`, `SoftKeyboardResizeNoneKind`, `SoftKeyboardStyleDarkKind`, `SoftKeyboardStyleDefaultKind`, plus the types `SoftKeyboardPhase`, `SoftKeyboardResizeMode`, `SoftKeyboardTransition`.

In the head bundle:

- `head/packages/types/src/Keyboard.ts` is **identical to base** — `SoftKeyboardInfo { visible; height }` (no `x`/`y`/`width`), `SoftKeyboardBackend.subscribe(listener: () => void)` (no `phase`/`transition` parameter, no optional `getResizeMode`/`setResizeMode`/`setStyle`/`getAccessoryBarVisible`/`setAccessoryBarVisible`/`getScrollAssistEnabled`/`setScrollAssistEnabled` methods), and a 3-signal `SoftKeyboard` (`onShow`/`onHide`/`onResize` only — no `onWill*`/`onDid*`).
- `head/packages/types/src/index.ts` exports **no** `SoftKeyboard*` symbols (`grep "SoftKeyboard" head/packages/types/src/index.ts` → empty).
- The four type files the prior review verified at `<67dc46d64>` — `SoftKeyboardTransition.ts`, `SoftKeyboardEasingKind.ts`, `SoftKeyboardResizeMode.ts`, `SoftKeyboardStyleKind.ts` — **do not exist** in `head/packages/types/src/`.
- A whole-bundle grep confirms `SoftKeyboardResizeNoneKind`, `SoftKeyboardPhase`, `SoftKeyboardTransition`, `SoftKeyboardResizeMode` are **defined nowhere** under `head/packages/`.

Concrete consequences, each a `tsc` error against head types:

1. `import type { SoftKeyboardPhase, SoftKeyboardResizeMode, SoftKeyboardStyleKind, SoftKeyboardTransition }` — four type imports with no declaration. (`b2824e3d8:packages/keyboard/src/keyboard.ts:2-10`)
2. `import { SoftKeyboardResizeNoneKind }` — value import with no declaration; the test imports three more such consts. (`b2824e3d8:packages/keyboard/src/keyboard.ts:10`, `keyboard.test.ts:8-13`)
3. `createSoftKeyboard()` returns an object with `onWillShow … onDidResize` (`b2824e3d8:packages/keyboard/src/keyboard.ts:56-66`) but the head `SoftKeyboard` interface declares only `onShow`/`onHide`/`onResize` — excess-property / assignability error.
4. `createSoftKeyboardInfo()` returns `{ visible, height, x, y, width }` (`b2824e3d8:packages/keyboard/src/keyboard.ts:69`) against a 2-field `SoftKeyboardInfo` — excess-property error; and every `out.x = … out.width = …` write in `createWebSoftKeyboardBackend.getInfo` references fields the type does not have.
5. `backend.subscribe((phase, transition) => …)` (`b2824e3d8:packages/keyboard/src/keyboard.ts:11`) does not match `subscribe(listener: () => void)`; and `backend.getResizeMode?.()` / `setResizeMode?.()` / `setStyle?.()` / `getAccessoryBarVisible?.()` / `setAccessoryBarVisible?.()` / `getScrollAssistEnabled?.()` / `setScrollAssistEnabled?.()` reference optional methods absent from the head `SoftKeyboardBackend`.

This is the textbook merge-gate failure: a feature branch was sliced so that the consumer (`packages/keyboard`) advanced but the header (`packages/types`) did not come with it. The source is good; the **integration** is broken.

## The delta judged in isolation (standards 1–6) — assuming types were present

To keep the dispatch honest, here is the delta against the other six standards _as if_ the types changes accompanied it. All pass; the only gate failure is the missing dependency above.

- **1. Composition / bedrock — PASS.** The native-control commands (`get/setSoftKeyboardResizeMode`, `setSoftKeyboardStyle`, `is/setSoftKeyboardAccessoryBarVisible`, `is/setSoftKeyboardScrollAssistEnabled`) are flat free functions that each delegate to one optional backend method (`b2824e3d8:packages/keyboard/src/keyboard.ts:163-217`). No config-gated branch fuses subjects; the will/did split is one subject (the soft keyboard) modeled across two animation phases, not two subjects bundled. Not over-split either — these are bedrock commands.
- **2. Naming clarity — PASS.** Every new export carries the full `SoftKeyboard` type word and the correct prefix: `getSoftKeyboardHeight`, `getSoftKeyboardResizeMode`, `setSoftKeyboardResizeMode`, `setSoftKeyboardStyle`, `isSoftKeyboardAccessoryBarVisible`, `setSoftKeyboardAccessoryBarVisible`, `isSoftKeyboardScrollAssistEnabled`, `setSoftKeyboardScrollAssistEnabled`, `createSoftKeyboardTransition`. Self-identifying; nothing abbreviated.
- **3. Tree-shaking / bundle invariant — PASS.** `package.json` is unchanged (`"sideEffects": false`, single `.` export, deps still only `signals` + `types`). `index.ts` unchanged (`export * from './keyboard'`). New module state (`VirtualKeyboard` interface, `getVirtualKeyboard`, `getWebKeyboardGeometry`) sits at the file bottom after the exports (`b2824e3d8:packages/keyboard/src/keyboard.ts:225-265`); no top-level side effect, no eager registration. The added native-control functions are independently importable; they do not tax `getSoftKeyboardInfo`'s baseline.
- **4. Registry vs closed union — N/A to the delta.** The keyboard _source_ does no `switch (kind)`; the closed-vs-open `*Kind` question lives in `@flighthq/types` (and is moot here, since those types are absent). Pre-existing Open direction, not introduced by this delta.
- **5. Subject triad + plurality guard — PASS.** No format/backend mis-homing; this is an event capability with one swappable `*Backend`, exactly the platform-suite shape.
- **6. Contract hygiene — PASS (in isolation).** `out`-param readers return `out` and are alias-safe; native-control readers return sentinels (`SoftKeyboardResizeNoneKind` / `false`) via `?? `, never throw (`b2824e3d8:packages/keyboard/src/keyboard.ts:165, 178, 184`); `disposeSoftKeyboard` is the correct verb (detach-to-GC; no non-GC resource). The Rust mirror `flighthq-keyboard` still does not exist — a pre-existing conformance gap, unchanged by this delta.

## Minor, non-blocking observations on the source

- **Web backend `transition.height` is a frozen 0.** `createWebSoftKeyboardBackend.subscribe` allocates `const transition = { durationSeconds: 0, height: 0 }` once and never updates it before `fire()` (`b2824e3d8:packages/keyboard/src/keyboard.ts:98-99`). The web default only emits `'did'`, and `did`-phase dispatch reads `info.height` fresh — so the stale `transition` is never consumed and this is harmless today. It would matter only if the web backend ever emitted `'will'`. Consistent with the documented "All did-phase only" contract; note as a follow-up, not a fix.
- **Tests assert the 9-signal shape and rect fields** (`createSoftKeyboard … expect(keyboard.onWillShow).toBeDefined()`, `createSoftKeyboardInfo … toEqual({ visible:false, height:0, x:0, y:0, width:0 })` — `b2824e3d8:packages/keyboard/src/keyboard.test.ts`). These tests are well-formed and mirror the new exports, alphabetized — but they will fail to compile in this branch for the same dangling-types reason. The test quality is fine; the dependency is the problem.

## What must happen before merge

The keyboard source delta is mergeable **only** bundled with the `@flighthq/types` keyboard edits it was written against. Either carry those edits into the integration branch (the four `SoftKeyboard*.ts` files, the rect fields on `SoftKeyboardInfo`, `SoftKeyboardPhase`, the 9-signal `SoftKeyboard`, the phase/transition `subscribe` signature, the optional backend methods, and their `index.ts` re-exports) or hold the keyboard package change back until they land together. See `outgoing/integration/keyboard.md` for the imperative directives.

## Pre-existing Open directions (unchanged by this delta)

These predate the integration and are not merge blockers; they are routed to the charter's Open directions (see `assessment.md`): the keyboard↔textinput boundary, `SoftKeyboardEasingKind` scope + wiring + value namespacing, open-vs-closed `*Kind` unions (fork B at the type level), safe-area / `@flighthq/device` coordination, the duplicate `types` re-export site, the understated Package Map line, and Rust conformance timing.
