---
package: '@flighthq/lifecycle'
status: solid
score: 78
updated: '2026-07-13'
ingested:
  - status.md
  - charter.md
  - source (packages/lifecycle/src)
  - packages/types/src/Lifecycle.ts
---

# lifecycle — Review

## Verdict

**`solid` — 78/100.** The prior review (2026-06-25, 58/partial) was a merge-gate review of an integration slice whose implementation had outrun its header — `AppLaunchKind`, `AppMemoryPressure`, the three new signals, and the optional backend methods were absent from `@flighthq/types`, so the package did not compile. **That blocker is resolved:** `packages/types/src/Lifecycle.ts` now declares the complete surface — the tri-state `AppLifecycleState`, `AppLaunchKind` (`cold`/`warm`), `AppMemoryPressure` (`normal`/`moderate`/`critical`), the 7-signal `AppLifecycle`, and `LifecycleBackend` with optional `getLaunchKind`/`subscribeMemoryWarning` — all with durable doc comments. Every import resolves; types-first is satisfied.

What stands is the strongest event capability in the platform suite: a full tri-state lifecycle (active/inactive/background) with deduped resume/pause edges, save/restore-state across backgrounding, OS memory-pressure delivery, cold/warm launch classification, boolean state queries, and a vetoable back-button request — over a swappable backend whose web default is a genuine reference implementation (visibilitychange + focus/blur + pagehide/pageshow, bfcache-based launch kind, experimental memory-pressure events), SSR-safe throughout. Test coverage includes property/fuzz storms over transition sequences. Held below the high-solid band by one textbook-surface hole (no before-quit/exit hook), the undecided 4-edge signal set, and the absence of any native backend proof.

## Present capabilities (verified against source)

13 exports in `packages/lifecycle/src/lifecycle.ts`, 43 tests, `describe` blocks alphabetized 1:1 with exports:

- **Entity quartet:** `createAppLifecycle` (7 inert signals), `attachAppLifecycle` (idempotent; emits raw `onStateChange` per notification; derives deduped `onResume`/`onPause` on the `'active'` boundary — the `inactive↔background` transitions correctly do not re-fire them; emits `onSaveState` with a fresh mutable bag on leaving active and `onRestoreState` with that bag on next resume; wires `subscribeMemoryWarning` when the backend has it), `detachAppLifecycle`, `disposeAppLifecycle` (also clears the saved-state `WeakMap` entry).
- **State queries:** `getAppLifecycleState`, `isAppActive` / `isAppInactive` / `isAppBackground`.
- **Launch:** `getAppLaunchKind` — delegates to optional `backend.getLaunchKind`, falls back to `'warm'` for backends that omit it (the web backend returns `'cold'` unless `PerformanceNavigationTiming.type === 'back_forward'`, i.e. a bfcache thaw — the closest web analog of a warm resume).
- **Back button:** `requestAppBack` — emits `onBackButton`, returns `false` when a listener vetoed via `cancelSignal`; mirrors `@flighthq/application`'s `requestWindowClose`/`onCloseRequest` contract.
- **Backend seam:** `getLifecycleBackend` / `setLifecycleBackend` / `createWebLifecycleBackend`. Web backend: three states over document visibility + window focus; `subscribeMemoryWarning` wires the experimental `memory-pressure`/`memory-pressure-relieved` window events (critical→`critical`, moderate→`moderate`, unknown-but-present→`moderate` rather than a silent drop, relieved→`normal`); degrades to `'active'`/no-op in SSR.

Test depth is real: all transition edges including the inactive dedup cases, save→restore round-trip, memory delivery + unsubscribe, all four launch-kind navigation types, veto and no-veto back paths, and four property/fuzz suites (100–200 random trials each) pinning the raw-vs-deduped invariants: `onStateChange` fires per notification, resume/pause collapse to the minimal edge set, an all-active flutter emits zero pause/resume, and pause/resume counts alternate within one.

## Gaps (AAA-depth judgment)

1. **No before-quit/exit hook.** A textbook lifecycle surface includes app-termination: a vetoable `onBeforeExit`/`requestAppExit` (native `before-quit`, web `beforeunload`/`pagehide`-as-final) and/or an `onExitRequested` signal. Nothing here covers it. Note the boundary question: `@flighthq/application` owns the *window*-close veto (`requestWindowClose`/`onCloseRequest`); app/process-level quit arguably belongs in this package as the process sibling of `onBackButton`. A design decision, not a sweep — but the largest hole in the domain coverage.
2. **The 4-edge signal set is undecided.** `onResume`/`onPause` key on the `'active'` boundary, so "focus lost" and "fully backgrounded" are indistinguishable without deriving from `onStateChange`. First-class `onForeground`/`onBackground` (and possibly `onActivate`/`onResignActive`) remain the charter's first Open direction.
3. **No native backend proof.** The seam has only run against fakes and the web default; the Electron mapping (app focus/blur events, `low-memory-notification`, launch heuristics) is specced in status but unbuilt (cross-package, `host-electron`).
4. **`getAppLaunchKind` fallback asymmetry.** A backend omitting `getLaunchKind` yields `'warm'` while the web path defaults `'cold'`. The `'warm'` choice is documented in the function comment as the safe cache-assumption for minimal backends, so it is now a recorded rationale rather than a surprise — but it remains worth a deliberate bless-or-flip.
5. **Stale self-description.** `package.json` still reads "foreground/background lifecycle state and resume/pause/back signals" — omits the inactive state, memory pressure, save/restore, and launch kind. Within-package, sweep-safe.
6. **Minor comment drift.** The `subscribeMemoryWarning` function-level comment describes only the critical→critical and relieved→normal mappings; the unknown-pressure→`'moderate'` mapping is documented only at the branch. Cosmetic, sweep-safe.
7. **No diagnostics layer.** SSR sentinels and the memory-events-unsupported no-op have no `explain*`/guards seams. Suite-wide pattern.

Also unbuilt: `timeInBackground` payload on resume (charter Open direction), idle/user-inactivity (ownership vs `@flighthq/input` unresolved), the `flighthq-lifecycle` Rust crate.

## Charter contradictions

None. The What-it-is paragraph matches source exactly. One stale detail: it cites "highest suite review score (58)" — a reference to the June merge-gate number, which this review supersedes. The 2026-07-02 Decision ("no specific issues to fix") predates this review's gap 5/6 findings but those are cosmetic, not bugs, so no contradiction. The save-state bag remains the mutable `Record<string, unknown>` the charter asks to have confirmed (Open direction 4) — still awaiting blessing, faithfully implemented meanwhile.

## Contract & docs fit

- **Envelope:** front matter valid; `crate: flighthq-lifecycle` — no Rust crate exists (cross-worktree conformance gap).
- **Types-first:** satisfied; `Lifecycle.ts` fully describes the API with good doc comments. All concepts share one file rather than one-per-file (`AppLaunchKind`/`AppMemoryPressure` did not get the separate files the status log claims) — consistent with the other platform-suite headers, noted against the types-layout convention.
- **Shared docs:** the `agents/packages/map.md` line ("active/inactive/background, resume/pause, back button") omits memory/save-restore/launch-kind; `agents/index.md` lists the package bare. Shared-doc edits, out of sweep scope.
- **No package README**, where `keyboard`/`device` set the suite convention.

## Candidate open directions

Carried from charter (all still live): the 4-edge signal set; memory-warning home (here vs `power`-adjacent); idle ownership vs `input`; the save-state bag blessing; `timeInBackground`. Add: the before-quit/exit hook and its lifecycle-vs-application boundary (gap 1), and the `'warm'` fallback bless-or-flip (gap 4).
