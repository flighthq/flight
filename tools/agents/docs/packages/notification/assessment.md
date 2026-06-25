---
package: '@flighthq/notification'
updated: 2026-06-25
basedOn: ./review.md
---

# notification — Assessment (merge gate, integration b2824e3d8)

Reasoned over `./review.md`. The package, judged in isolation at the worker's own SHA, is a strong `solid`. As a **merge into the approved baseline** (`origin/main eb73c3d74`) it currently **rejects**: the integration head does not typecheck because the rich `@flighthq/types` notification header was dropped on the way in. Recommendations below are split between what restores the merge (must precede anything else) and what is parked.

## Recommended (sweep-safe, within-package)

These are within-package and safe to apply without a direction decision — but only the first is a gate. The rest are genuine cleanups that should not be touched until the build is restored, since they edit a file that does not currently compile.

1. **Restore the dropped `@flighthq/types` notification header so head compiles.** `packages/types/src/Notification.ts` in the integration must regain `NotificationCapabilities`, `NotificationChannel`, `NotificationPermission`, `NotificationSchedule`, `ScheduledNotification` (and the rich `NotificationRequest` fields + the full `NotificationBackend` seam) that the package imports. This is a cross-file-but-within-feature integration fix; it is the precondition for every other item. (Strictly this edits `@flighthq/types`, so the _merge worker_, not a notification-package sweep, should land it — see the dispatch brief.)
2. **De-duplicate the two backend factories.** Extract a `createNotificationListenerRegistry` (the five `Set`s + `_fire` + `subscribe*`) and a best-effort `createNotificationScheduler` (`_scheduled`, `scheduleNotification`, `cancelScheduledNotification`, `getPendingNotifications`, the `fireAndReschedule`/`_repeatMs` loop), then express `createWebNotificationBackend` and `createServiceWorkerNotificationBackend` as thin compositions over them. ~250 duplicated lines collapse; the bedrock primitives become independently testable. Apply only after item 1.
3. **Remove the stale `// ----` divider comments in `notification.test.ts`.** They violate the codebase-map "avoid structural divider comments" rule and have drifted out of sync with the `describe` blocks they label. Pure cleanup.

## Backlog (parked)

- **Monkey-patched SW dispatch (`_dispatchAction`/`_dispatchClick`/`_dispatchDismiss` via cast).** Parked: replacing the cast with a typed companion handle (`{ backend, dispatch }`) is a public-shape decision for `createServiceWorkerNotificationBackend` + `notifyServiceWorkerBackendAction`, not a sweep — see Open directions #7.
- **Off-header channel methods.** Parked: promoting the `createNotificationChannel`/`deleteNotificationChannel`/`getNotificationChannels` trio onto the `NotificationBackend` header vs keeping them as structural casts is an API-shape fork — Open directions #6.
- **Lossy `getActiveNotifications` cast.** Parked: introducing an `ActiveNotification` summary type vs narrowing the return is a types-first decision — Open directions #3.
- **`progress?` / ongoing notifications.** Parked: `updateNotification`'s doc promises progress-bar support the header cannot express — Open directions #4. Cross-package (touches `@flighthq/types`).
- **Signals opt-in (`enableNotificationSignals`).** Parked: adopting `@flighthq/signals` for the lifecycle feed is a cross-package dependency decision — Open directions #5.
- **`flighthq-notification` Rust crate / conformance-map entry.** Parked: cross-worktree; no crate exists yet.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

- **New, gate-relevant:** the integration **lost the notification type header**. This is the single most important thing for a direction/merge session to confirm is fixed before notification is blessed at `solid`+. The package source and tests are correct against the _intended_ header; the integration branch simply did not carry it. Re-confirm the rich `@flighthq/types/Notification.ts` is present and matches the package's imports before scoring this above ~40 as a merge.
- The pre-existing forks (#3 lossy active, #6 channel-on-header, #7 SW dispatch handle) remain exactly as the charter enumerates them; this review found no new design fork beyond the dropped-header integration defect.
- **Doc drift, user-gated:** the Package Map one-liner ("OS notifications and permission") still understates what the worker built (rich content, scheduling, channels, lifecycle, SW backend, capability descriptor). Raise when direction is set — but note it can only be made true once the dropped types are restored.
