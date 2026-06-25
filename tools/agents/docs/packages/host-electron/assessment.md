---
package: '@flighthq/host-electron'
updated: 2026-06-25
basedOn: ./review.md
---

# host-electron — Assessment (merge gate: integration-b2824e3d8)

The review verdict is `solid` package, **revise the incoming change** (78/100 for the delta). The b2824e3d8 delta is one file pair: a clean `updateNotification` addition and a half-landed `requestPermission` retype that fails `tsc` and breaks its own tests. The fixes are small and entirely sweep-safe **within `@flighthq/host-electron`**, except for one cross-package open question (does the `requestPermission` seam itself move to tri-state?), which is routed to the charter's Open directions rather than acted on here.

The structural forks barely apply: no growing `kind` switch (fork B), no codec/backend triad to split, no new package (bedrock test does not fire). The bundle invariant and tree-shaking posture are untouched by the delta. The only live questions are correctness/conformance of the incoming change.

## Recommended

Strictly sweep-safe: within `@flighthq/host-electron` (source + its own tests), no `@flighthq/types` seam change, no new design decision.

- **Re-align `requestPermission` with the `NotificationBackend` seam.** The head implementation returns `Promise<NotificationPermission>` (`'granted'`/`'denied'`) but the seam in the same tree is `requestPermission(): Promise<boolean>` (`b2824e3d8:packages/types/src/Notification.ts:22`), so the factory no longer satisfies its `: NotificationBackend` annotation and fails `tsc`. _Within host-electron_, the sweep-safe fix is to return a `boolean` again (`return electron.Notification.isSupported()`), matching the seam. If instead the seam is intended to become tri-state (the web `@flighthq/notification` backend already assumes it), that is a `@flighthq/types` change — see Open directions; do not make that call from this cell. (review.md#must-fix-before-merge, item 1)
- **Update the stale `requestPermission` test assertions.** `electronNotification.test.ts:44` and `:55` assert `.toBe(true)`/`.toBe(false)` against a method that now returns strings, so they fail at runtime. Make the assertions match whichever return contract the seam fix above settles on. (review.md#must-fix-before-merge, item 2)

## Backlog

- **(none new for this delta).** The package's standing roadmap items (Gold seam-audit table, renderer- targeted IPC, updater fidelity, `WindowBackend` depth, power battery detail) are unchanged by this delta and remain parked exactly as in the prior assessment revision — they are cross-package or design-gated and out of scope for the merge gate. No b2824e3d8 hunk touches them.

### Routed to the charter's Open directions (not edited here)

- **`requestPermission` seam shape (cross-package fork).** Should `NotificationBackend.requestPermission` move from `Promise<boolean>` to `Promise<NotificationPermission>` (tri-state)? The web `@flighthq/notification` backend and the host-electron delta both already assume tri-state, but `@flighthq/types/Notification.ts` still declares `Promise<boolean>` — the integration is internally inconsistent. This is a `@flighthq/types` decision the host-electron cell must not make unilaterally; it determines whether the host-electron fix is "return a boolean" or "keep the tri-state and the seam catches up." Surfaced for the user / a types-owning direction pass.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
