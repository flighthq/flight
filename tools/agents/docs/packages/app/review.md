---
package: '@flighthq/app'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# app — Review

Merge-gate review of the **integration delta** for `@flighthq/app` into the approved `origin/main` baseline.

- **Baseline (approved floor, not critiqued):** `incoming/integration-b2824e3d8/base/packages/app/` = `origin/main` (`eb73c3d74`).
- **Candidate (judged):** `incoming/integration-b2824e3d8/head/packages/app/` — the integration-branch state. The delta (head vs base) is the incoming change. Findings cite `b2824e3d8:<path>` with quoted snippets.
- Rubric: `tools/agents/docs/packages/app/charter.md` (still a DRAFT stub — fell back to the codebase-map AAA + design-constraints standard where silent), `structural-forks.md`, `CONTRACT.md`, `index.md`.

This review **supersedes** the prior `solid — 84/100`. That score was earned by the **builder** bundle (`incoming/builder-67dc46d64`), where the `@flighthq/types` header carried the full `App`/`AppBackend` surface. The integration tree under review here does **not** carry that header: the `app.ts` implementation was advanced, but the `@flighthq/types` definitions it compiles against were not merged in alongside it. The delta as it sits in `b2824e3d8` does not compile.

## Verdict

`reject — 38/100`. The implementation work itself is high quality — 42 alphabetized free functions, a complete lazy web backend, a clean quit-veto, 57 colocated tests, correct sentinel/`dispose`/`Readonly` hygiene. But this is a **merge gate**, and the candidate **does not typecheck against the `@flighthq/types` header in the same integration tree**. The `app.ts` delta imports four types and references ~26 entity/backend members that are absent from `b2824e3d8:packages/types/src/App.ts`. The header half of the change was dropped on the way into the integration branch. A package that cannot build is not mergeable regardless of how good the source reads, so the axis-1/2/7 passes below are conditional on the blocking contract failure being fixed first.

## BLOCKING — the change does not compile against its own types header

The single decisive finding. `b2824e3d8:packages/types/src/App.ts` is **byte-identical to base** (`diff base/packages/types/src/App.ts head/packages/types/src/App.ts` → empty). It still declares the old, narrow surface:

```ts
export interface App {
  onActivate: Signal<() => void>;
  onOpenFile: Signal<(path: string) => void>;
  onSecondInstance: Signal<(argv: readonly string[]) => void>;
}
```

— three signals, and an `AppBackend` with 17 methods (`getName/getVersion/getLocale/quit/relaunch/focus/requestSingleInstanceLock/releaseSingleInstanceLock/hasSingleInstanceLock/setDockBadge/setBadgeCount/setDockMenu/bounceDock/cancelDockBounce/subscribeActivate/subscribeOpenFile/subscribeSecondInstance`).

The candidate `b2824e3d8:packages/app/src/app.ts` was rewritten against a **different, larger** header that was never merged:

1. **Four imported types do not exist anywhere in `head/packages/types`.** The import is:

   ```ts
   import type {
     App,
     AppActivationPolicy,
     AppBackend,
     AppLoginItem,
     AppLoginItemLike,
     AppPathKind,
     MenuItemTemplate,
   } from '@flighthq/types';
   ```

   `grep -rln "AppActivationPolicy|AppLoginItem|AppPathKind|AppLoginItemLike" head/packages/types/src` returns **nothing**. There is no `AppActivationPolicy.ts`, `AppLoginItem.ts`, or `AppPathKind.ts` file; `index.ts` exports only `./App`. `tsc -b` fails on this import line alone (TS2305, "has no exported member").

2. **Three signals referenced in code are absent from the `App` interface.** `createApp` returns `onAllWindowsClosed`, `onQuitRequest`, `onReady` (`b2824e3d8:packages/app/src/app.ts:75-78`) and `attachApp` reads `app.onQuitRequest.data?.cancelled` (`:31`) and emits `app.onAllWindowsClosed`/`app.onReady` (`:27,:39`) — none of which exist on the 3-signal `App` interface in the in-tree header. TS2339 on each.

3. **~23 backend methods called do not exist on `AppBackend`.** `getAppBackend().addRecentDocument` (`:15`), `.cancelAttention` (`:58`), `.clearRecentDocuments` (`:68`), `.getAppDirectoryPath` (`:294`), `.getAppPath` (`:319`), `.getCommandLine` (`:277`), `.getExecutablePath` (`:299`), `.getPreferredSystemLanguages` (`:325`), `.getSystemLocale` (`:331`), `.getLoginItem` (`:309`), `.hideApp` (`:351`), `.isAppHidden` (`:356`), `.requestAttention` (`:377`), `.setActivationPolicy` (`:389`), `.setLoginItem` (`:416`), `.setName` (`:422`), `.setUserModelId` (`:428`), `.showApp` (`:433`), `.subscribeAllWindowsClosed`, `.subscribeQuitRequest`, `.subscribeReady`. The web fill in `createWebAppBackend` implements all of them, so the returned object is **not assignable** to the in-tree `AppBackend` return type either (excess-property / structural mismatch).

This is a textbook **types-first violation in reverse**: the implementation was carried into the integration branch without the header it depends on. The codebase-map rule is explicit — "define its types in `@flighthq/types` first, then implement against them — the header is the design surface." Here the header is stale and the code is ahead of it, and the result is a non-building package. The embedded worker review inside `changes.patch` (lines 51141-51152, 64234-64235) _asserts_ these type files were "added and exported from `types/src/index.ts`" — but that is describing the **builder** bundle state, not the integration tree on disk. The integration merge lost them. **Must-fix before merge: land the full `App`/`AppBackend` type surface (six signals, ~40-method backend) plus `AppActivationPolicy.ts`, `AppLoginItem.ts`/`AppLoginItemLike`, `AppPathKind.ts` into `b2824e3d8:packages/types/src`, exported from the barrel, before this app delta can build.**

## Axis scorecard (delta vs the seven standards)

1. **Composition / bedrock — PASS (conditional).** The delta adds no fused-subject monolith and no config-gated branch in a hot path. Each new capability is a flat free function delegating to one backend method (`b2824e3d8:packages/app/src/app.ts:14-16`, `:57-59`, etc.). `getAppCommandLineSwitch`/`hasAppCommandLineSwitch` correctly compose over `getAppCommandLine` rather than duplicating a parser (`:281-289`, `:340-342`). No decomposition smell. Conditional only because a non-building unit cannot be fully verified.

2. **Naming clarity — PASS.** Every new export carries the full unabbreviated `App` word and the right verb prefix: `addAppRecentDocument`, `clearAppRecentDocuments`, `getAppDirectoryPath`, `getAppExecutablePath`, `getAppPreferredSystemLanguages`, `getAppSystemLocale`, `hasAppCommandLineSwitch`, `isAppHidden`, `requestAppAttention`, `setAppActivationPolicy`, `setAppLoginItem`, `setAppUserModelId`, `showApp`/`hideApp`. `get*`/`has*`/`is*` used correctly. One soft note: `hideApp`/`showApp` drop the noun to the end (verb-first) rather than `setApp*`, but these are imperative actions, not setters, and the `App` word is still present — defensible.

3. **Tree-shaking / bundle invariant — PASS.** `package.json` is unchanged from base — `sideEffects: false`, single `.` export, deps still only `@flighthq/signals` + `@flighthq/types` (`diff` empty). No new top-level side effect: the new module state is still just the two bottom-of-file privates (`b2824e3d8:packages/app/src/app.ts:436-437` `_backend`, `_subscriptions`), set only via `setAppBackend`/`attachApp`. New functions are independently importable; nothing taxes a primitive.

4. **Registry vs closed union (fork B) — PASS (n/a).** `@flighthq/app` is a backend-seam capability, not a `kind`/handler family. The new surface adds backend methods, not a dispatched switch. No closed-union-over-growing-family smell introduced.

5. **Subject triad + plurality guard — PASS.** No format-codec or backend code mis-homed into `app`; the native adapter remains in `@flighthq/host-electron` (out of this delta). No premature split.

6. **Contract hygiene — FAIL (blocking).** The types-first rule is violated by the missing header (see BLOCKING). Beyond that, where the code _can_ be read it is contract-clean: sentinels not throws (`requestAttention` → `-1` `:185`, `setLoginItem`/`setName`/`setUserModelId`/`hideApp`/`showApp` → `false`, `getAppPath`/`getExecutablePath` → `''`, `getCommandLine` → `[]`); `setAppLoginItem(settings: Readonly<AppLoginItemLike>)` uses `Readonly<>` and the read/`*Like`-write split (`:415`); `dispose*` vs `destroy*` unchanged and correct (`disposeApp` detaches to GC, `:260-262`). No `out`-param functions are added, so alias-safety is n/a for the delta. The Rust `flighthq-app` mirror is untouched here (no `crates/` hunk in the app slice) — conformance not advanced, consistent with base.

7. **Tests & honesty — PARTIAL.** The test delta is large and genuinely good: 42 exported functions, all alphabetized (`grep '^export function' | sort -c` → SORTED), and `app.test.ts` adds a `describe` block for every new export in alpha order, covering the three quit-veto branches (`:269` "wires…", and the `quits`/`hostCancelled` cases), idempotent re-attach, web sentinels, and the command-line switch parser. **But the honesty axis fails at the seam:** every one of these tests imports `AppLoginItem`/`AppLoginItemLike` from `@flighthq/types` (`b2824e3d8:packages/app/src/app.test.ts:2`) and constructs a `fakeBackend` implementing the ~40-method surface — so the **test file does not compile against the in-tree header either**. `tsc -b` typechecks `src/*.test.ts`, so the test suite is part of the build that is currently broken. The tests assert against a contract the merged tree does not define.

## What is approve-as-is (once the header lands)

If the missing `@flighthq/types` surface is merged in, the `app.ts` + `app.test.ts` delta is strong and would not need rework: the function set, naming, sentinel behavior, quit-veto wiring, and test coverage all hold up under the harsh bar. The failure is **entirely** the dropped header, not the implementation. This is a re-merge problem, not a redesign problem.

## Lower-severity notes (non-blocking, grounded)

- **`subscribeReady` web fill has a dead binding.** `b2824e3d8:packages/app/src/app.ts:237-242`:
  ```ts
  subscribeReady(listener) {
    const id = Promise.resolve().then(() => listener());
    void id;
    return () => {};
  },
  ```
  `id`/`void id` is a no-op leftover — the promise is fire-and-forget regardless. Drop the binding (`Promise.resolve().then(() => listener());`). Also: the returned unsubscribe is a no-op, so a listener registered and immediately unsubscribed still fires on the next microtask. Minor, web-only, but the unsubscribe contract is technically not honored.
- **Web-backend object keys are not fully alphabetized.** `getLoginItem` (`:144`) sits after `getSystemLocale` (`:137`) and `getName` (`:147`), out of key order. Object-literal keys are not policed by `npm run order` (only exported functions / describe blocks), so this is cosmetic, but it breaks the scan-ability the surrounding alpha ordering sets up. Reorder `getLoginItem` up with the other `get*` keys.
- **`requestAttention(critical)` ignores its argument in the web fill** (`:184-186` `return -1`) — correct (no web API), but worth a one-word `_critical` rename for parity with the other `_listener`-prefixed unused params in the same object.

## Orphaned-types carry-over (from the prior baseline)

The prior review flagged `AppLaunchKind` / `AppMemoryPressure` as types-without-implementers. In this integration tree those files **do not exist** either (`ls head/packages/types/src | grep -iE 'Launch|Memory'` → empty), so the orphan concern is moot here — but only because the entire enriched header is missing. When the header is re-landed, re-check whether `AppLaunchKind`/`AppMemoryPressure` come with it and remain unimplemented; if so, the prior Open direction (wire them or remove them; decide `app` vs `@flighthq/lifecycle` ownership) reapplies.

## Charter / docs fit

The charter is still a DRAFT stub (`draft: true`, Decisions empty), so no blessed rule is contradicted — but the five parked rulings (quit-veto, locale triad, paths boundary, badge-vs-tray, `setAppUserModelId` ownership) the implementation encodes remain unblessed and out of this review's remit. Do not promote them here. The `index.md` Package Map line for `@flighthq/app` still matches the _intended_ surface; it will be accurate once the header is restored.
