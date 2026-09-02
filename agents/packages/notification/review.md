---
package: '@flighthq/notification'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - packages/notification/src/notification.ts
  - packages/notification/src/notification.test.ts
  - packages/notification/src/index.ts
  - packages/notification/src/contract.ts
  - packages/notification/package.json
  - packages/notification/tsconfig.json
  - packages/types/src/Notification.ts
  - packages/types/src/Host.ts (HostNotificationCapabilities, HasNotification* traits)
  - prior review (2026-08-30, score 90)
---

# notification -- Review

## Verdict

**Solid -- 88/100.** The package implements a types-first, explicit-dependency notification domain
with eleven independently optional Host traits, stable Entity resources, origin-pinned per-resource
operations, named outcomes for every path, and transactional Signal subscription lifecycle. All
exported types live in `@flighthq/types`. No ambient backend, default Host fallback, or module-scoped
mutable singleton exists. The architecture structurally prevents the failure classes it replaced
(id-rerouting, fake scheduling, silent field loss, false permission, swallowed errors). Remaining
distance is narrow: test depth covers lifecycle mechanics and failure paths well but omits the
concurrent-attach race path exercised by the runtime code, and device-level proof of OS prompts and
native delivery remains in external host-probe lanes by design.

The prior review scored 90. This review lowers to 88 after verifying the export count claim (the
prior review stated 31 public operations; the actual count is 30 public plus 4 contract-only, for 34
total) and after closer inspection of test depth gaps in the subscription race-condition paths.

## Present capabilities

**34 exported functions** in a single `notification.ts` source file, of which **30 are public**
(re-exported from `index.ts`) and **4 are contract-only** (available only through `./contract` for
host providers):

- **Subscription create** (5): `createNotificationActionSubscription`,
  `createNotificationClickSubscription`, `createNotificationDismissSubscription`,
  `createNotificationReceivedSubscription`, `createNotificationReplySubscription` -- each returns an
  Entity carrying an inert Signal.
- **Subscription attach** (5): `attachNotificationActionSubscription`,
  `attachNotificationClickSubscription`, `attachNotificationDismissSubscription`,
  `attachNotificationReceivedSubscription`, `attachNotificationReplySubscription` -- each takes the
  narrow `HasNotification*` trait and returns a `NotificationSubscriptionAttachOutcome` preserving
  both attach and release failure dimensions.
- **Subscription detach** (5): `detachNotification*Subscription` -- releases the acquired backend
  attachment. Returns `not-attached` sentinel when unattached.
- **Subscription dispose** (5): `disposeNotification*Subscription` -- terminal, idempotent. Clears
  the Signal, awaits any in-flight pending attach, and releases. Failed releases stay observable.
- **Delivery:** `showNotification` takes `HasNotificationDelivery` and returns the provider's
  `NotificationDeliveryOutcome` (accepted with Entity, invalid-request with field names,
  permission-denied, or operation-failed).
- **Close:** `closeNotification` (origin-pinned, idempotent per Entity), `closeAllNotifications`
  (dispatches through `HasNotificationClose`).
- **Scheduling:** `scheduleNotification` takes `HasNotificationScheduling`, returns outcome with
  `ScheduledNotification` Entity and precision indicator. `cancelScheduledNotification` is
  origin-pinned and idempotent.
- **Enumeration:** `getActiveNotifications` (via `HasNotificationActiveList`),
  `getPendingNotifications` (via `HasNotificationScheduling`).
- **Permission:** `getNotificationPermission`, `requestNotificationPermission` -- both via
  `HasNotificationPermission`. Query failure is preserved as `operation-failed`, never collapsed to
  `denied`.
- **Lifecycle:** `destroyNotificationCapabilities` dispatches through `HasNotificationLifecycle`.
- **Contract-only:** `bindNotificationClose`, `bindScheduledNotificationCancel` (origin-pin a
  provider's close/cancel to its Entity), `createNotificationResource`,
  `createScheduledNotificationResource` (Entity constructors for providers; native keys stay private).

**Export lanes** are correct: `contract.ts` does `export * from './notification'` (34 functions),
`index.ts` selectively re-exports 30 public functions from `./contract`. Both `.` and `./contract`
subpaths are declared in `package.json`.

**Dependencies** are minimal and correct: runtime `@flighthq/entity`, `@flighthq/signals`,
`@flighthq/types`; dev-only `typescript`. `tsconfig.json` references match the runtime dependencies
(entity, signals, types). No import from `@flighthq/sdk`.

**Side effects:** `sideEffects: false` declared. Module-scoped state is four `WeakMap`/`WeakSet`
instances and one `WeakMap<Entity, NotificationSubscriptionRuntime>` -- explicit registries at the
bottom of the file, not import side effects.

**All exported types in `@flighthq/types`:** `Notification`, `ScheduledNotification`,
`NotificationRequest`, `NotificationSchedule`, `NotificationAction`, all outcome types
(`NotificationDeliveryOutcome`, `NotificationCloseOutcome`, `NotificationCancelOutcome`,
`NotificationScheduleOutcome`, `NotificationLifecycleOutcome`, `NotificationPermissionQueryOutcome`,
`NotificationPermissionRequestOutcome`, `NotificationActiveListOutcome`,
`NotificationPendingListOutcome`), subscription types, event attachment types, all eleven backend
interfaces, five exact platform capability types (`WebPageNotificationCapabilities`,
`WebServiceWorkerNotificationCapabilities`, `ElectronNotificationCapabilities`,
`ElectronMacosNotificationCapabilities`, `TauriNotificationCapabilities`,
`CapacitorNotificationCapabilities`), and eleven `HasNotification*` trait interfaces in `Host.ts`. No
exported types are defined in the notification package itself.

**Platform profiles** (verified against `Notification.ts` types):

| Platform         | Traits | Exact coverage |
|------------------|--------|----------------|
| Web page         | 7      | click, close, delivery, dismiss, lifecycle, permission, received |
| Web Service Worker | 8    | action, activeList, click, close, delivery, dismiss, lifecycle, permission |
| Electron common  | 6      | click, close, delivery, dismiss, lifecycle, received |
| Electron macOS   | 8      | common 6 + action, reply |
| Tauri            | 3      | delivery, lifecycle, permission |
| Capacitor        | 6      | action, click, delivery, lifecycle, permission, scheduling |

## Tests

The test file (`notification.test.ts`) has **34 `describe` blocks**, one per exported function,
alphabetized and mirroring source order. Key behavioral coverage:

- **Action subscription:** Full round-trip -- attach, emit, verify Signal carries `Notification`
  Entity and `actionId`.
- **Click subscription:** Concurrent attach failure with release failure preserved
  (`attachFailed: true, releaseFailed: true`). Route test verifies the provider Entity identity reaches
  the Signal and that detach releases the backend listener.
- **Dismiss/Received/Reply subscriptions:** Acquire-and-release round-trips.
- **Close/Cancel origin pin:** `bindNotificationClose` and `bindScheduledNotificationCancel` pin a
  provider's private operation to its Entity; `closeNotification` and `cancelScheduledNotification`
  are idempotent (second call returns `already-closed`/`already-cancelled` without invoking the
  provider again; invocation count is asserted).
- **Close without binding:** `closeNotification` on an unbound Entity returns `operation-failed`
  (never accepts a replacement Host or reroutes a foreign id).
- **Lifecycle destroy:** Retry-only semantics tested -- first call returns `operation-failed` with
  failures, second call returns `ok`.
- **Detach before attach:** All five families return `not-attached` harmlessly.
- **Dispose idempotency:** All five families tested -- second dispose returns `already-disposed`.
- **Dispose with release failure:** `disposeNotificationClickSubscription` preserves the
  `releaseFailed: true` dimension when the backend's release fails.
- **Create subscriptions:** Entity identity verified via `EntityRuntimeKey`.
- **Resource constructors:** `createNotificationResource` carries `id`, `tag`, `title`;
  `createScheduledNotificationResource` carries `id`, `request`, `schedule`.
- **Active list identity stability:** Two successive `getActiveNotifications` calls return the same
  object reference, verifying provider-reconciled identity.
- **Permission query failure:** Preserved as `operation-failed`, not collapsed to `denied`.
- **Pending list failure:** Preserved as `operation-failed`, not collapsed to empty success.
- **Permission request:** Provider outcome (`dismissed`) is preserved.
- **Schedule/Show:** Provider-created Entity is returned unchanged.

Test helpers are well-isolated: `host()` constructs the minimal host shape from a capabilities
object, `createClickBackend()` builds a configurable fake backend with attach/release failure
toggles.

## Gaps

1. **Concurrent-attach race path is untested.** The `attachNotificationSubscription` runtime tracks a
   `generation` counter and a `pending` promise to handle the case where a second attach arrives
   while the first is still in flight (lines 346-383). This race-resolution logic -- where a late
   attach succeeds but the generation has advanced, so its attachment is immediately released -- has
   no dedicated test. The `disposeNotificationClickSubscription` concurrent test (lines 111-126)
   exercises the dispose-during-attach path but not the attach-during-attach path.

2. **Dispose with pending attach failure is untested.** The `disposeNotificationSubscription`
   function (lines 396-424) awaits `runtime.pending` and surfaces its `attachFailed`/`releaseFailed`
   dimensions. No test exercises a dispose where the pending attach itself fails
   (`outcome.reason === 'operation-failed'`), which would set `attachFailed = true`.

3. **Error-throwing backend paths rely on structural coverage only.** Both `cancelScheduledNotification`
   and `closeNotification` catch exceptions from the provider's operation and map to
   `operation-failed`. No test supplies a throwing backend to verify this catch path.

4. **Device-level proof is external by design.** Real OS prompt behavior, Capacitor scheduling, Tauri
   delivery, and Electron display verification live in host-probe interactive/device lanes, not in
   this package's unit tests. This is architecturally correct -- this package tests against
   dependency-injected facades -- but it means the full stack is unverified without those lanes
   running.

5. **No guard/diagnostics layer.** The package exposes no `enableNotificationGuards` or
   `explainNotification*` functions. A caller who passes a disposed subscription to `attach` gets
   `operation-failed` silently; a guard layer could warn about the misuse via `@flighthq/log`.

## Charter contradictions

None found. The charter specifies eleven independently optional traits derived from provider
coverage, and the source implements exactly that. The charter's decisions on exact injected profiles,
permission ownership, acceptance-is-not-display-success, and tray exclusion are all reflected in the
implementation. The superseded 2026-07-02 extraction premise (shared listener-registry/scheduler
primitive) is correctly absent -- the duplicated factories were deleted, not extracted. The charter's
open directions (provisional/progress/grouping/ongoing vocabulary and Rust crate) are absent from
source, which is correct since no provider-backed direction has justified them.

## Contract and docs fit

- Types are in `@flighthq/types`; no exported types defined in the package. Correct.
- No ambient backend getter/setter, no default Host fallback, no module-scoped singleton. Correct.
- Missing capability is a compile-time type error (narrow `HasNotification*` traits). Correct.
- Expected failures return named outcomes, never throw. Correct.
- `dispose*` clears the Signal and releases for GC; `destroy*` is used for lifecycle teardown of
  native resources. The naming distinction matches the convention.
- Functions are free functions, no classes. Correct.
- Exported functions are alphabetized. Correct.
- `describe` blocks are alphabetized and mirror exported names. Correct.
- `import type` is on its own line, separate from value imports. Correct.
- Module-scoped variables (`WeakMap`/`WeakSet`) are at the bottom of the file. Correct.
- No structural divider comments, no TODOs in source. Correct.
- `Readonly<T>` is used on parameters (`Readonly<NotificationRequest>`, `Readonly<NotificationSchedule>`,
  `Readonly<Notification>` in listener signatures). Correct.
- `sideEffects: false` declared. Correct.
- Function names are full and unabbreviated (`attachNotificationActionSubscription`, not
  `attachNotiActionSub`). Correct.

## Candidate open directions

1. **Guard/diagnostics layer.** An `enableNotificationGuards` module could warn via `@flighthq/log`
   when a disposed subscription is re-attached, when an unbound Entity is closed, or when a
   `destroyNotificationCapabilities` call is made on an already-destroyed host. Today these are
   silent sentinel returns.

2. **Concurrent-attach test coverage.** The generation-based race resolution in
   `attachNotificationSubscription` is a correctness-critical path that deserves an explicit test
   exercising two overlapping attaches on the same subscription.

3. **Provisional/progress/grouping/ongoing request vocabulary.** Parked by the charter until a
   provider-backed direction derives exact fields and coverage.

4. **Rust crate.** Cross-repository conformance work, parked by the charter.
