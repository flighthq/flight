---
package: '@flighthq/notification'
status: solid
score: 40
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/notification/src
  - head/packages/types/src/Notification.ts
  - changes.patch (packages/notification/ + packages/types/src/Notification.ts hunks)
  - charter.md
  - status.md (committed in the integration delta)
---

# notification — Merge Review (integration b2824e3d8 → approved origin/main eb73c3d74)

Evidence: the **delta** between `incoming/integration-b2824e3d8/base/packages/notification/` (origin/main `eb73c3d74`, the approved floor — not reviewed) and `incoming/integration-b2824e3d8/head/packages/notification/`, plus the `packages/notification/` and `packages/types/src/Notification.ts` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings reference `b2824e3d8:<path>`. The package source itself is the worker's rich rewrite (86 → 687 lines, 25 exports). The decisive finding is not in that source — it is in what the integration **dropped on the way in**.

## Verdict

`reject as a merge — 40/100`. The score is a merge-gate score, not a grade of the worker's package in isolation (which, judged on its own terms, is a strong `solid`). The integration head **does not typecheck**: `b2824e3d8:packages/notification/src/notification.ts` imports five cross-package types from `@flighthq/types` that this integration branch does not contain, and implements a `NotificationBackend` whose shape directly conflicts with the one the integration's `@flighthq/types` actually declares. The worker delivered a self-consistent package + types pair at its own SHA (the committed `status.md` documents exactly that), but the integration merge carried the rich `notification.ts`/`notification.test.ts` across while leaving `packages/types/src/Notification.ts` at the approved-base shape plus a single one-line addition. The result is a broken seam. This is a hard blocker; the secondary quality findings below are moot until it is fixed, and most are already parked in the charter's Open directions.

## The blocker — head does not compile (types dropped in integration)

`b2824e3d8:packages/notification/src/notification.ts` (lines 1–9):

```ts
import type {
  NotificationBackend,
  NotificationCapabilities,
  NotificationChannel,
  NotificationPermission,
  NotificationRequest,
  NotificationSchedule,
  ScheduledNotification,
} from '@flighthq/types';
```

But `b2824e3d8:packages/types/src/Notification.ts` — the integration head's authoritative header — contains only:

```ts
export interface NotificationAction {
  id: string;
  title: string;
}
export interface NotificationRequest {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
  actions?: NotificationAction[];
}
export interface NotificationBackend {
  notify(request: Readonly<NotificationRequest>): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  isSupported(): boolean;
  subscribeClick(listener: (tag: string) => void): () => void;
  subscribeAction(listener: (tag: string, actionId: string) => void): () => void;
  updateNotification(id: string, update: Readonly<Partial<NotificationRequest>>): Promise<boolean>;
}
```

A grep of `b2824e3d8:packages/types/src` for `NotificationCapabilities`, `NotificationChannel`, `NotificationPermission`, `NotificationSchedule`, `ScheduledNotification`, `NotificationImportance`, `NotificationPriority` returns **nothing**. The `changes.patch` hunk for `packages/types/src/Notification.ts` is a single added line (`+ updateNotification(...)`); the rich types the package needs are not in the patch and not on disk.

Concrete consequences in the integration head:

- **Missing exported members (TS2305).** The five imported type names above do not exist in `@flighthq/types`, so `tsc -b` fails outright.
- **`NotificationRequest` field mismatch.** `notification.ts` reads `request.id`, `request.badge`, `request.image`, `request.dir`, `request.lang`, `request.data`, `request.renotify`, `request.requireInteraction`, `request.timestamp`, `request.vibrate` (lines 86–101) — none of which exist on the integration's 6-field `NotificationRequest`.
- **`NotificationBackend` shape conflict.** The package's two factories return objects with ~20 methods (`getCapabilities`, `getPermission(): NotificationPermission`, `scheduleNotification`, `subscribeDismiss/Reply/Show`, `getActiveNotifications`, `getPendingNotifications`, `getLaunchNotification`, `closeNotification`, `closeAllNotifications`, `cancelScheduledNotification`, …) typed `as NotificationBackend`. The integration's `NotificationBackend` declares six methods, two of them with incompatible return types (`notify`/`requestPermission` are `Promise<boolean>` in the header but the package returns `Promise<string>`/`Promise<NotificationPermission>`).

The committed `status.md` in the same delta states these types **were** added ("All types added in the first pass… `NotificationCapabilities` … `ScheduledNotification`… `requestPermission(): Promise<NotificationPermission>` _(changed in pass 2)_"), and the committed `review.md` cites them at SHA `67dc46d6`. So this is an **integration merge defect**, not a defect in the worker's package: the type half of the change was lost when the package half was merged into `b2824e3d8`. Either way, the gate judges what lands — and what lands does not build.

## The seven standards, judged on the delta

1. **Composition / bedrock — fail (within-package).** `createWebNotificationBackend` (`b2824e3d8:notification.ts` 291–523) and `createServiceWorkerNotificationBackend` (62–284) are ~95% duplicated: each re-declares its own `_idCounter`, `_generateId`, `_fire`, the five listener `Set`s, the `_scheduled` map, the entire `scheduleNotification`/`cancelScheduledNotification` setTimeout scheduler, and five identical `subscribe*` bodies. The shared spine (a listener-registry primitive and a best-effort scheduler primitive) wants extracting — this is the "missing primitive underneath a bundled unit" smell, not simple-by-composition. ~250 lines collapse to two thin backends over one registry + one scheduler.

2. **Naming clarity — pass.** Exports carry the full `Notification` type word and are self-identifying (`getNotificationPermission`, `scheduleNotification`, `onNotificationDismiss`, `createServiceWorkerNotificationBackend`). `notifyServiceWorkerBackendAction` is the only slightly awkward name and it is documented; acceptable.

3. **Tree-shaking / bundle invariant — pass.** `package.json` keeps `"sideEffects": false`, a single root `.` export, and a thin `index.ts` barrel (`export * from './notification'`). The backend is created lazily in `getNotificationBackend` (546–549), `_backend` initialized to `null` at file bottom (687) — no module-top side effect, no eager registration. `_repeatMs` (670–685) is a closed `switch` over a fixed calendar-unit set, a legitimate closed system (units don't grow by user extension), so it does not tax importers.

4. **Registry vs closed union — pass.** No growing `kind`/handler family is forced through a closed switch; the only switch is the calendar-unit one in (3), correctly closed.

5. **Subject triad + plurality guard — pass.** notification stays a thin subject: two web backends (basic + service-worker) behind one `*Backend` seam, no premature `-formats`/`-backend` split. Native delivery is left to `host-*`. Matches the charter's "thin subject" boundary.

6. **Contract hygiene — mixed (the blocker plus parked forks).** The types-first rule is the blocker above: the header the package designs against is absent from the integration. Beyond that, three pre-existing design-fork frictions (all already in the charter's Open directions, none a sweep blocker):
   - **Monkey-patched dispatch via cast.** `createServiceWorkerNotificationBackend` bolts `_dispatchAction`/`_dispatchClick`/`_dispatchDismiss` onto the returned object through `backend as SwBackendInternal` (262–281), read back by `notifyServiceWorkerBackendAction` via another cast (588–596) — the legacy `internal.ts`-style cast the codebase map says not to extend.
   - **Off-header channel methods.** `createNotificationChannel`/`deleteNotificationChannel`/`getNotificationChannels` reach the backend through structural casts `getNotificationBackend() as NotificationBackend & { … }` (37–40, 527–530, 559–562) rather than living on the seam type.
   - **Lossy `getActiveNotifications`.** The SW backend returns `{ title, tag }` mapped objects (160–161) typed as `Promise<ReadonlyArray<Readonly<NotificationRequest>>>` (535) — the type over-promises. `Readonly<>` and sentinels (`''`, `[]`, `false`, `null`, no-op) are otherwise used correctly throughout; `dispose*`/`destroy*` are correctly absent (nothing to free). No Rust `flighthq-notification` crate exists yet (conformance-map gap, charter-tracked).

7. **Tests & honesty — pass (with one style nit).** `notification.test.ts` is colocated and its `describe` blocks are alphabetized and mirror the 25 exports (verified: `cancelScheduledNotification` … `updateNotification`). Claims match code; no dead exports. The committed `status.md`'s "64 tests" and surface inventory are accurate against the source. The one nit: the file is littered with stale `// ----` divider-comment headers (e.g. the `// createWebNotificationBackend` divider above `describe('createServiceWorkerNotificationBackend'`) — these violate the codebase-map "avoid structural divider comments" rule and have drifted out of sync with the blocks beneath them. Cosmetic; not an `order:check` failure.

## Self-check (objections re-examined, dropped where ungrounded)

- **Dropped:** "`describe` blocks are not alphabetized." Re-grepping the file shows they are correctly alphabetized; only the divider _comments_ are misaligned. Re-filed as a cosmetic style nit, not an order failure.
- **Dropped:** treating the `_dispatch*` cast / lossy active cast / off-header channels as merge blockers. These pre-exist the worker's intent, are explicitly enumerated in the charter's Open directions as design forks for the user, and pre-release latitude (no back-compat duty) means they are not sweep-fixable without a direction decision. Retained only as Open-direction pointers, not must-fix.
- **Retained:** the missing-types blocker. It is grounded in the head tree and the `changes.patch` hunk, it is about the **delta** (the integration head, not the approved base), and pre-release latitude does not excuse a non-compiling head. It stands.
- **Retained:** the backend duplication (Composition/bedrock). Grounded in two cited line ranges of the delta; within-package; sweep-safe once the build is restored.
