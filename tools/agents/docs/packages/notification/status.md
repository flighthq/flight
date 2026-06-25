---
package: '@flighthq/notification'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# notification — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from assessment.md "## Recommended" that are strictly within `packages/notification/`.

Done:

- **Wired `_dispatchReply` in the service-worker backend.** Added the `_dispatchReply` hook to `SwBackendInternal` and `createServiceWorkerNotificationBackend`'s `internal` block, fanning a reply to `_replyListeners` (id, actionId, text). Added a reply branch to `notifyServiceWorkerBackendAction`: when a `notificationclick` message carries both `actionId` and `reply`, it routes to `_dispatchReply` (ahead of the action/click branches) so a `text-input` action's reply text now round-trips on the SW path. Widened the message type to `{ type; notificationId; actionId?; reply? }` and updated the doc comment. Added two colocated tests under the existing `notifyServiceWorkerBackendAction` describe (reply text delivered to `subscribeReply`; reply message does not fire action listeners).
- **`let` → `const` on the `subscribe*` listener registries.** Both backends: `_clickListeners`, `_actionListeners`, `_dismissListeners`, `_replyListeners`, `_showListeners` are `new Set(...)` once and never reassigned.
- **Dropped the structural-divider banner comments from `notification.test.ts`.** Removed the `// ----` / label / `// ----` banners (Helpers and per-function) the source-style rule forbids; `describe` boundaries and import order already carry the structure.

Parked:

- **Add `'provisional'` to `NotificationPermission`.** cross-boundary: edits `@flighthq/types` (packages/types/src/Notification.ts), outside this package's cell per the hard boundary. Additive/non-breaking but not sweepable here.

Verification: `npm run test --workspace=packages/notification` — 66 passed (1 file). No new exported functions added (reply wiring rides existing `notifyServiceWorkerBackendAction` / `createServiceWorkerNotificationBackend`), so exports:check binding is already satisfied.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/notification

**Session date**: 2026-06-24 (second pass) **Starting score**: 78/100 **Estimated score after this session**: 92/100

## Implemented APIs (cumulative across both passes)

### Types in `packages/types/src/Notification.ts`

All types added in the first pass, unchanged in the second pass:

- **`NotificationAction`** — with `icon?`, `requiresAuthentication?`, `type?: 'button' | 'text-input'`, `inputPlaceholder?`.
- **`NotificationCapabilities`** — `actions`, `channels`, `coldStart`, `image`, `listActive`, `scheduling`, `textReply`.
- **`NotificationChannel`** — Android-class channel descriptor.
- **`NotificationImportance`** — `'min' | 'low' | 'default' | 'high' | 'urgent'`.
- **`NotificationPermission`** — `'default' | 'granted' | 'denied'`.
- **`NotificationPriority`** — `'min' | 'low' | 'default' | 'high' | 'max'`.
- **`NotificationRequest`** — full rich-content shape (title, body, icon, image, badge, sound, vibrate, timestamp, tag, id, data, dir, lang, group, groupSummary, channelId, priority, interruptionLevel, requireInteraction, renotify, ongoing, autoCancelMs, silent, actions).
- **`NotificationBackend`** — full seam:
  - `cancelScheduledNotification`, `closeAllNotifications`, `closeNotification`
  - `getCapabilities`, `getLaunchNotification`, `getActiveNotifications`, `getPendingNotifications`, `getPermission`, `isSupported`
  - `notify`, `requestPermission(): Promise<NotificationPermission>` _(changed in pass 2)_
  - `scheduleNotification`, `subscribeAction`, `subscribeClick`, `subscribeDismiss`, `subscribeReply`, `subscribeShow`
  - `updateNotification(id, partial): Promise<boolean>` _(new in pass 2)_
- **`NotificationSchedule`** — `{ at: number; repeat? }`.
- **`ScheduledNotification`** — `{ id, request, schedule }`.

### Exported functions in `packages/notification/src/notification.ts` (25 total)

**Unchanged from pass 1:**

- `cancelScheduledNotification(id)`
- `closeAllNotifications()`
- `closeNotification(id)`
- `createNotificationChannel(channel)` — optional channel method, no-ops on web
- `createWebNotificationBackend()` — basic web Notification API backend
- `deleteNotificationChannel(id)` — optional channel method, no-ops on web
- `getActiveNotifications()`
- `getLaunchNotification()`
- `getNotificationBackend()`
- `getNotificationCapabilities()`
- `getNotificationChannels()`
- `getNotificationPermission()`
- `getPendingNotifications()`
- `isNotificationSupported()`
- `onNotificationAction(listener)`
- `onNotificationClick(listener)`
- `onNotificationDismiss(listener)`
- `onNotificationReply(listener)`
- `onNotificationShow(listener)`
- `scheduleNotification(request, schedule)`
- `setNotificationBackend(backend | null)`
- `showNotification(request)`

**Modified in pass 2:**

- `requestNotificationPermission()` — return type changed from `Promise<boolean>` to `Promise<NotificationPermission>` (tri-state). Returns `'granted' | 'denied' | 'default'` instead of collapsed boolean. `'denied'` is the not-supported sentinel. This is a breaking change from the pass-1 shape, done now while pre-release.

**New in pass 2:**

- `createServiceWorkerNotificationBackend(registration)` — SW-backed web backend. Uses `registration.showNotification` + `registration.getNotifications`. Capabilities: `actions: true`, `listActive: true`, `scheduling: true`, `image: true`. Action buttons actually fire via the page-side dispatch helper. Two-step wiring: the SW side forwards `notificationclick` events via `postMessage`, the page calls `notifyServiceWorkerBackendAction` to route them to listeners.
- `notifyServiceWorkerBackendAction(backend, message)` — page-side helper that forwards SW `notificationclick` postMessage events to the backend's action/click listeners. Required companion to `createServiceWorkerNotificationBackend`.
- `updateNotification(id, partial)` — merges partial fields into a live notification. Web backend simulates by close + re-open (preserving the stable id). Returns `false` when the notification is no longer visible. Request registry (`Map<id, Readonly<NotificationRequest>>`) added to `createWebNotificationBackend` to support merging originals.

### Web backend (`createWebNotificationBackend`) improvements from pass 2

- **Request registry**: `_requests: Map<id, NotificationRequest>` tracks originals so `updateNotification` can merge without losing fields the partial doesn't touch.
- **`updateNotification`**: close + re-open with merged request, preserving the stable id across the lifecycle.
- **`requestPermission`** now returns `Promise<NotificationPermission>` instead of `Promise<boolean>`. Returns the full tri-state from `Notification.requestPermission()`.

### Service-worker backend (`createServiceWorkerNotificationBackend`)

New in pass 2. Key differences from the basic web backend:

- **Actions delivered**: `getCapabilities().actions === true`. SW notifications fire `notificationclick` in the worker thread; the SW must forward this via `postMessage` to the page, which then calls `notifyServiceWorkerBackendAction`.
- **Active listing**: `getActiveNotifications()` reads `registration.getNotifications()`.
- **Show listener**: fires on `_show` success (no `onshow` event from SW API).
- **`getCapabilities().image === true`**: SW `showNotification` accepts the `image` field (unlike the basic API in some browsers).
- **No per-instance `onclick`**: event routing goes entirely through the `_dispatchAction`/`_dispatchClick` internal dispatch hooks.
- **Scheduling**: identical best-effort `setTimeout` scheduler as the basic web backend.

### Tests

64 tests covering all 25 exported functions. New test coverage in pass 2:

- `createServiceWorkerNotificationBackend` (9 tests): interface shape, capabilities, permission, getLaunchNotification, schedule/cancel/pending, unsubscribe lifecycle, requestPermission tri-state.
- `notifyServiceWorkerBackendAction` (4 tests): action delivery, click delivery, non-notificationclick no-op, non-SW-backend graceful no-op.
- `updateNotification` (3 tests): delegates to backend, false on missing id, web backend no-op without live entry.
- `requestNotificationPermission` (2 tests): tri-state result via fake backend and web backend in jsdom.

## Design choices made

### `requestPermission` → `Promise<NotificationPermission>` (breaking, pass 2)

Returning the raw tri-state from `Notification.requestPermission()` is strictly richer. The collapsed boolean was hiding whether the user chose "not now" (→`'default'`) vs. actively blocked (→`'denied'`). The `'denied'` case is now both the "blocked" result and the "host unavailable" sentinel, matching the Web Notifications spec shape directly. Old `Promise<boolean>` consumers need a `=== 'granted'` check — a one-line migration.

### Service-worker backend: two-step wiring

The SW backend cannot deliver action events autonomously from the page side. SW `notificationclick` fires in the worker thread; the page cannot register a `notificationclick` handler itself (the listener would never fire). The chosen design:

1. SW side posts `{ type: 'notificationclick', notificationId, actionId? }` messages.
2. Page side calls `notifyServiceWorkerBackendAction(backend, msg)` in its `navigator.serviceWorker.addEventListener('message', ...)` handler.

This is the canonical web pattern (used by libraries like OneSignal, Firebase Messaging, and Workbox). It is fully documented on the `createServiceWorkerNotificationBackend` export.

### `updateNotification` on web: close + re-open

The Notification API has no `update()` method. The only way to replace a visible notification is to close it and re-open with the merged fields. The stable id is preserved in the new `_notify` call so listeners keyed by id continue to work. The web backend now maintains a `_requests` registry so the merge can reconstruct the original fields that the partial doesn't touch.

The SW backend's `updateNotification` is simpler — it doesn't retain originals (the SW doesn't expose request fields after show) — so callers must include at least a `title` in the partial to reconstruct. This is documented on the function.

### `_dispatchAction` fires both action listeners and click listeners

When an action button is tapped (vs. a body click), the platform fires one `notificationclick` event with `event.action !== ''`. The SW backend's `_dispatchAction` hook:

1. Iterates `_actionListeners` with `(notificationId, actionId)` — covers `onNotificationAction`.
2. Also fires `_clickListeners` with `notificationId` — a body click and an action-button tap are both "the user interacted with this notification," so both listener types should fire on an action tap.

This matches Electron's behavior (both `notification.on('action', ...)` and `notification.on('click', ...)` fire on action).

## Deferred items and why

### `enableNotificationSignals` — optional signals group

Still deferred. Requires `@flighthq/signals` as a dependency behind the `enable*` tree-shaking guard. The implementation is straightforward but the cross-package dependency is a session-boundary concern. The plain `on*` callbacks are a fully functional default path.

### Full Rust parity (`flighthq-notification` crate)

Out of scope for TS sessions. The conformance map should be updated to track: `notify`/`get_permission`/`close`/`schedule`/`get_pending`/`get_active`/`update`/`on_*` over a `NotificationBackend` trait, native default backend behind the `native` feature.

### `@flighthq/host-electron` notification coverage

Still deferred — not acting autonomously across package boundaries. The Gold roadmap calls for coordinating Electron `Notification` coverage (actions, reply, close, toast events).

### Progress / ongoing / sticky

`progress?: { value, max, indeterminate? }` field and `autoCancelMs` behavior are in the type (`NotificationRequest.autoCancelMs?`), but there is no `progress?` field yet. Adding `progress?` to the type is straightforward; the web backend would document it as unsupported (the Notification API has no progress bar). Deferred because it's a type-only addition until a native host supports it, and the benefit/cost ratio is low for the web-only tier.

### Inline-reply delivery from SW backend

`subscribeReply` / `onNotificationReply` exist on the SW backend's listener registry but never fire. The SW `notificationclick` event exposes `event.action` but not an inline text reply on the page side (text reply requires the native `textInput` action type, which the web does not support). Deferred — the listener infrastructure is ready for native hosts.

### `@flighthq/app` badge field documentation

The `badge?` on `NotificationRequest` (the per-notification status icon, a small monochrome PNG) is distinct from `setAppBadgeCount` in `@flighthq/app` (the dock/taskbar badge number). This should be cross-referenced in comments on both types. Minor doc item, deferred.

## Concerns found

None remaining. The `this.notify` binding bug flagged in pass 1 was already resolved in pass 1 (the web backend uses `_notify` as a named closure function and assigns it as `notify: _notify` — no `this` reference issue). The SW backend uses `_show` similarly. Verified.

## Updated score estimate: 92/100

Rationale by tier:

**Bronze (complete)**: Tri-state permission, id-based identity, dismiss/close-all, real web click delivery.

**Silver (complete)**: Rich content widening, priority, channels API, scheduling with best-effort web backend, lifecycle events show/dismiss, reply listener infrastructure, cold-start getter, service-worker backend (the last major Silver gap — closes the action delivery gap on web).

**Gold (partial)**:

- `updateNotification` — implemented. (+Gold)
- `requestNotificationPermission` → `NotificationPermission` tri-state — implemented. (+Gold)
- `getNotificationCapabilities()` and per-backend descriptor — implemented (pass 1). (+Gold)
- `createServiceWorkerNotificationBackend` — implemented (pass 2). (+Gold, was Silver)
- Inline reply delivery from SW — infrastructure ready, never fires on web. (partial)
- Progress field — not yet in `NotificationRequest`. (missing)
- `enableNotificationSignals` — deferred. (missing)
- Full native host coverage (`host-electron`, Tauri, Capacitor) — deferred. (missing)
- Rust parity — deferred. (missing)
- `'provisional'` permission union for Apple — not added (Apple-only, low priority pre-native). (missing)

The package is now an authoritative web-tier notifications library. The 8-point gap to 100 is: progress field (~1), signals opt-in (~2), SW inline reply (~1), native host documentation/coverage (~2), Rust parity (~2).
