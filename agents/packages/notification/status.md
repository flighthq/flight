---
package: '@flighthq/notification'
updated: 2026-08-29
by: builder5
---

# notification — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/notification/src/` (and `packages/types/src/`) on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **No signal group exists.** There is no `NotificationSignals` type anywhere in `packages/types/`
  and no `enableNotificationSignals`; the only observation path is the five direct callbacks
  (`notification.ts:612-639`), each a single-listener-per-call subscription. Every other event-shaped
  capability in the suite offers an opt-in signal group, so this is an asymmetry, not a scope choice.
- **`NotificationRequest` has no `progress` field** (`packages/types/src/Notification.ts:5-46`). A
  determinate/indeterminate progress notification is an Android and Windows staple with no web
  equivalent, so this stays type-only until a native host can honor it.
- **`NotificationPermission` has no `'provisional'` arm** (`packages/types/src/Notification.ts:48`).
  Apple's quiet-delivery state currently has to collapse into `'granted'` or `'default'`, and the
  distinction is not recoverable downstream.
- **The service-worker `updateNotification` cannot reconstruct fields the caller omits.** The SW
  exposes no request payload after show, so the merge is `{ ...partial, id }` and the call returns
  `false` when `partial.title` is missing (`notification.ts:248-257`) — unlike the basic web backend,
  which merges against a retained `_requests` registry (`notification.ts:509`).
- **Scheduling is `setTimeout` on both web backends** (`notification.ts:200-208`, `:458-466`), so
  every pending notification is lost on reload. `getCapabilities().scheduling` reports `true` on both
  (`notification.ts:148`, `:407`), which is honest about the API existing but not about it surviving
  the page.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-29** — Pending enumeration folded into `NotificationSchedulingBackend` beside schedule
  and cancel across Web, Service Worker, and Capacitor providers; the standalone pending-list slot
  and trait were deleted, while enumerated handles remain pinned to their originating scheduler.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: "`@flighthq/host-electron`
  notification coverage — still deferred" — `packages/host-electron/src/electronNotification.ts`
  implements the full backend (actions mapped back from Electron's index at `:37-41`, click, dismiss,
  show, close/close-all, capabilities), with `subscribeReply` deliberately inert because Electron's
  desktop `Notification` has no inline text reply (`:123-126`). Also dropped "inline reply from the
  SW backend never fires" — `_dispatchReply` is wired (`notification.ts:282-284`) and routed from
  `notifyServiceWorkerBackendAction` (`:600-601`) — and the Rust-parity item, since there is no
  `crates/` directory in this repo.
- **2026-06-25** — SW inline-reply wiring landed: a `notificationclick` message carrying both
  `actionId` and `reply` routes to reply listeners ahead of the action/click branches.
- **2026-06-24** — `createServiceWorkerNotificationBackend` plus the page-side
  `notifyServiceWorkerBackendAction` helper; action buttons finally deliver on web.
- **2026-06-24** — `requestNotificationPermission` returns the tri-state `NotificationPermission`
  instead of a boolean; `updateNotification` added (close + re-open with a merged request).
- **2026-06-24** — Rich content, channels, priority, scheduling, capabilities descriptor, and the
  cold-start `getLaunchNotification` getter.
