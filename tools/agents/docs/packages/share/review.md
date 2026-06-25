---
package: '@flighthq/share'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - status.md
  - source
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# Review: @flighthq/share — merge gate (integration-b2824e3d8 → origin/main)

## Verdict

**REJECT — does not compile as integrated.** `partial — 35/100`, scored against the _integrated state_, not the design intent.

The delta's _design_ is the right shape: it is the same canonical Web-Share-Level-2 surface the prior 88/100 review blessed (files + `ShareResult` + `ShareOptions` + a `isShareContentValid` precondition + the `isShareAvailable` vs `canShareContent` two-probe split + an `onShareResult` signals seam). On its own merits the share-package code would pass most of the bar. But this is a **merge gate**, and the integration head ships the share-package half of a two-package change _without its other half_: every `@flighthq/types` definition the new code depends on (`ShareFile`, `ShareResult`, `ShareOptions`, the extended `ShareBackend`, `ShareContent.files`, and the whole `ShareSignals.ts` file) is **absent** from `incoming/integration-b2824e3d8/head/`. `head/packages/types/src/Share.ts` is byte-identical to `base`. The package cannot typecheck. Merging it red-lines `tsc -b` for the monorepo. That single fact dominates the score; the rest of the surface is secondary until it compiles.

## Showstopper — the dependent `@flighthq/types` change did not land in this head

This is the whole verdict. `b2824e3d8:packages/share/src/share.ts:2` declares:

```ts
import type { ShareBackend, ShareContent, ShareOptions, ShareResult, ShareSignals } from '@flighthq/types';
```

and the body calls `getShareBackend().isAvailable()` (`share.ts:110`), `getShareBackend().shareWithResult(content, options)` (`share.ts:151`), `content.files` (`share.ts:121`, `:184`), and returns `ShareResult` literals. The test adds `import type { … ShareFile, ShareOptions, ShareResult } from '@flighthq/types'` (`b2824e3d8:packages/share/src/share.test.ts:2`).

But in the same head bundle, `@flighthq/types` still declares only the base surface:

```ts
// head/packages/types/src/Share.ts — IDENTICAL to base, no diff
export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}
export interface ShareBackend {
  share(content: Readonly<ShareContent>): Promise<boolean>;
  canShare(content: Readonly<ShareContent>): boolean;
}
```

`grep` over `head/packages/types/src/` for `ShareOptions | ShareResult | ShareSignals | ShareFile | shareWithResult | isAvailable | onShareResult` returns **nothing**, and there is **no `head/packages/types/src/ShareSignals.ts`**. The package's own `status.md` (as-claimed by `builder-67dc46d64`) explicitly lists those exact additions ("New types in `@flighthq/types/Share.ts`" and "New types in `@flighthq/types/ShareSignals.ts` (new file)") — so the change was authored, but the types half was **dropped on the way into this integration branch**. The `changes.patch` slice confirms it: it touches `packages/share/{package.json,src/share.test.ts,src/share.ts,tsconfig.json}` and the share doc cell, and **never** `packages/types/src/Share.ts` or `ShareSignals.ts`.

Concrete compile failures this produces:

- `share.ts:2` / `share.test.ts:2` — import of non-existent named type exports `ShareOptions`, `ShareResult`, `ShareSignals`, `ShareFile`.
- `share.ts:110`, `:151` — `Property 'isAvailable' / 'shareWithResult' does not exist on type 'ShareBackend'` (the type still has only `share`/`canShare`).
- `share.ts:121`, `:184`, `:118-122` — `Property 'files' does not exist on type 'ShareContent'`.
- `enableShareSignals` (`share.ts:94-98`) returns `{ onShareResult: createSignal() }` typed as `ShareSignals`, which does not exist; and `emitSignal(signals.onShareResult, result)` (`share.ts:154`) has no payload contract to check against.

**Verdict consequence:** this is not mergeable as-is regardless of code quality. Either the matching `@flighthq/types` commit must be brought into the integration head, or the share-package change must be reverted from it. A package that fails `tsc -b` cannot enter the approved baseline.

## Delta judged against the 7 standards (assuming the types were present)

The following grades the _share-package_ delta on its own, so the dispatch brief can distinguish "broken integration" from "bad design." With the types present, the code is largely sound.

1. **Composition / bedrock — PASS.** The unit stays a thin invoker: `shareText`/`shareUrl` compose `shareContent`, which composes `isShareContentValid` + `getShareBackend().share` (`share.ts:135-167`). No fused subjects, no config-gated mega-function. The command+event blend is the charter-endorsed suite shape, not a smell.
2. **Naming clarity — MOSTLY PASS, one nit.** Exported names carry the full type word and the right verb prefixes (`isShareAvailable`/`isShareContentValid`/`canShareContent`/`enableShareSignals`/`attach*`/`detach*`/`dispose*`). The lone slip is a private helper: `shareFileTodomFile` (`share.ts:185`, `:191`) mis-cases the boundary word — should be `shareFileToDomFile`. Not exported, so it is a readability nit, not an API-surface break.
3. **Tree-shaking / bundle invariant — PASS.** Single `export * from './share'` barrel (`index.ts`), `sideEffects: false` unchanged, no eager registration, no new hot-loop branch taxing existing importers. The module-level `_signalListeners`/`_signalSubscriptions` maps are empty-initializer allocations, not observable import side effects; the lazy `_backend` is the pre-existing suite pattern.
4. **Registry vs closed union — N/A.** No `kind` family here; the backend seam is already an open `set*Backend` swap.
5. **Subject triad + plurality guard — PASS, with a parked fork.** `ShareFile` is correctly a portable data-URL descriptor at the header layer, converted to a DOM `File` _inside_ the web backend (`shareContentToNavigatorData` / `shareFileTodomFile`, `share.ts:179-211`), keeping `@flighthq/types` browser-File-agnostic. Whether a `share-formats`/screenshot→`ShareFile` neighbor is warranted is charter Open direction #1 — correctly out of this cell.
6. **Contract hygiene — types-first VIOLATED by the integration (see showstopper); the rest PASS.** The cell _should_ be types-first, and the worker authored it that way — but the integration shipped the implementation without the header, which is the exact inversion the rule exists to prevent. Setting that aside: `Readonly<ShareContent>`/`Readonly<ShareOptions>` params throughout; sentinels not throws (`shareContent` short-circuits empty payloads to `Promise.resolve(false)`, `share.ts:136`; the web backend swallows every browser error to `false`/`dismissed`, `share.ts:46-72`); `dispose*` vs `detach*` used correctly for a GC-only entity. No `out`-params in this cell (nothing mutates a caller buffer). Rust mirror `flighthq-share` is named consistently.
7. **Tests & honesty — code is honest, but the claim of "compiles/passes" is false for this head.** Tests are colocated, alphabetized, and mirror exports (44 cases across `attachShareSignals`/`canShareContent`/`createWebShareBackend`/`detach*`/`dispose*`/`enable*`/`getShareBackend`/`isShareAvailable`/`isShareContentValid`/`setShareBackend`/`shareContent`/`shareContentWithResult`/`shareText`/`shareUrl`). No dead exports. But the suite **cannot run in this head** — it imports types that do not exist (`share.test.ts:2`) — so the status.md "44 tests" claim is un-verifiable against the integrated tree. Honesty fails at the integration layer, not the authoring layer.

## Secondary findings (non-blocking, real)

- **Casing nit (F2):** `shareFileTodomFile` → `shareFileToDomFile` (`share.ts:185`, `:191`). Private; sweep-safe.
- **Dead scaffolding (parked):** `_signalSubscriptions` (`share.ts:80-83`, `:173-175`) is declared and read by `detachShareSignals`, but nothing ever populates it — the web backend never `.set`s an unsubscribe. The comment admits it is "currently unused… reserved for future backends." Per the pre-release "remove it when it's wrong" rule this is speculative scaffolding, but it is already charter **Open direction #2** ("keep or cut the `_signalSubscriptions` stub?") and is a design call for the user, not a merge blocker. Routed to the assessment's charter notes, not to must-fix.

## What I am NOT objecting to (self-check drops)

- The command+event fusion is **not** a composition smell — the charter blesses it.
- The two module-level `Map`s are **not** a `sideEffects: false` violation — empty allocations, no registration.
- `shareText`/`shareUrl` returning `boolean`-only (no `*WithResult` twins) is **not** a delta defect — it is charter Open direction #3, a deliberate surface-size question for the user.
- None of these critique the approved base; the base `ShareContent`/`ShareBackend` are the floor and are untouched.

## Doc-revision flag

The existing `review.md` (88/100) and the Package Map line in `tools/agents/docs/index.md` ("native share sheet") both describe the _intended_ realized surface — files/result/options/signals — which is **not** what this integration head actually contains. Until the types land, the prior 88 was scored against a different (complete) tree (sha `67dc46d6`); this `partial — 35` is the honest score for `b2824e3d8` as a standalone mergeable unit.
