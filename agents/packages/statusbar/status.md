---
package: '@flighthq/statusbar'
updated: 2026-08-08
by: principal
---

# statusbar — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/statusbar/src/` and `packages/host-capacitor/src/` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The direct setters bypass the style stack.** `setStatusBarStyle` (`statusbar.ts:199`),
  `setStatusBarVisible` (`:204`), `setStatusBarColor` (`:189`), and `setStatusBarOverlaysContent`
  (`:194`) write straight to the backend without touching `_applied`, so a direct call made while a
  stack is live is invisible to `_applyTopStyleEntry` (`:231`) and is silently reverted by the next
  push or pop. Whether the stack should own every write, or a direct write should rebase the stack,
  is unruled.
- **Animation reaches visibility only.** An entry's `animation` merges down the stack (`:245`) but is
  passed only to `setVisible` (`:258`); `setBackgroundColor` is always called with `animated: false`
  (`:259`), so a stacked color change cannot animate even on a host that supports it.
- **The one native backend cannot report change or truth.** `createCapacitorStatusBarBackend` serves
  Flight's synchronous `getInfo` from a single prefetched snapshot cached at construction
  (`host-capacitor/src/capacitorStatusBar.ts:17-27`) — later OS changes are never re-read — and its
  `subscribe` is inert (`:51-53`), so `attachStatusBar`'s `onChange` never fires on any host today.
  This is the async-native-snapshot gap; the web no-op subscribe (`statusbar.ts:97`) is by design.
- **The height / safe-area boundary is documented, not decided.** `getStatusBarHeight`
  (`statusbar.ts:130`) returns the backend height and its comment (`:127-129`) points callers at
  `@flighthq/device` for layout padding. That function exists (`device/src/device.ts:260`), so the
  choice — forward on native, or keep the two concepts distinct — is now answerable and unanswered.
- **Style-entry handles are process-global.** `_nextHandle` (`statusbar.ts:209`) is a module counter
  beside the module-level `_styleStack` (`:211`), so handles are unique across the process rather
  than per-registry. Consistent with the stack being module state; noted because it forecloses a
  future per-window stack without a handle rework.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three carried items checked out
  **false** and were dropped: the `enableStatusBarSignals` no-op (the export is gone; `createStatusBar`
  owns signal allocation, `statusbar.ts:42`), the suggested `clearStatusBarStyleStack` and
  `hasStatusBarStyleEntry` (both landed, `:35` and `:143`), and the "tests pop handles 0–99" teardown
  hack (`afterEach` now calls `clearStatusBarStyleStack`, `statusbar.test.ts:82-87`).
- **2026-07-30** — Live-tree closure pass: confirmed the type layer is complete in `@flighthq/types`,
  and that pop/clear restore the pre-push baseline rather than leaving released values applied.
- **2026-06-24** — Gold landing: the per-field style stack (`pushStatusBarStyleEntry` /
  `popStatusBarStyleEntry`), the `StatusBar` event entity with attach/detach/dispose, out-param
  `getStatusBarInfo` / `createStatusBarInfo`, `getStatusBarHeight`, and animation parameters threaded
  through `setStatusBarVisible` / `setStatusBarColor`.
