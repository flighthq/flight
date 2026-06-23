# Depth Review: @flighthq/notification

**Domain**: System / OS notifications (toast/desktop notifications, permission, and click/action callbacks) over a swappable web (`Notification` API) / native host backend.

**Verdict**: partial — 52/100

The package is a clean, correct, well-guarded seam over the host notification surface. It covers the core "ask permission, show a notification, react to a tap" loop and explicitly accounts for the web-vs-native capability gap. But measured against a mature notification library it exposes only the most basic notification shape and omits a large swath of canonical, industry-recognized capabilities (rich content, scheduling, channels, progress, replies, dismiss/update/lifecycle, permission introspection). The `NotificationRequest` type advertises `actions`, yet the package's only backend cannot fire action callbacks, so a headline feature is type-present but behavior-absent on the default backend.

## Present capabilities

Exported free functions (in `src/notification.ts`), each delegating to the active `NotificationBackend`:

- `createWebNotificationBackend()` — default web backend over the global `Notification` API, fully guarded for jsdom / non-secure / unsupported hosts; never throws, returns `false`/no-op sentinels instead.
- `getNotificationBackend()` / `setNotificationBackend(backend | null)` — backend seam with lazy web default and `null`-to-reset, matching the platform-suite command-capability pattern.
- `isNotificationSupported()` — capability probe.
- `requestNotificationPermission(): Promise<boolean>` — permission request, collapsed to a boolean granted/not-granted.
- `showNotification(request): Promise<boolean>` — show a notification; `false` when not granted / unsupported.
- `onNotificationClick(listener: (tag) => void)` — body-click subscription (no-op on web by design).
- `onNotificationAction(listener: (tag, actionId) => void)` — action-button subscription (no-op on web by design).

Notification shape (`NotificationRequest` in `@flighthq/types`): `title`, `body?`, `icon?`, `tag?`, `silent?`, `actions?: NotificationAction[]` (id + title).

Strengths: the API shape is idiomatic for the suite (flat functions, `get*/set*/createWeb*Backend`, `on*` over a backend `subscribe*`), sentinel-returning and throw-free, side-effect-free at import, and honestly documents the web limitations (per-instance click, no global action feed, service-worker-only action buttons). This is a solid, faithful seam — its limits are scope, not quality.

## Gaps vs an authoritative notifications library

Compared to canonical platform notification APIs (Web Notifications + Service Worker Notifications, Electron `Notification`, Tauri/Capacitor/Cordova `LocalNotifications`, Android `NotificationCompat`, Apple `UNUserNotificationCenter`), the following expected capabilities are absent. Most are missing-by-omission, not missing-by-design.

- **Permission introspection.** No `getNotificationPermission()` returning `'default' | 'granted' | 'denied'`. Permission is collapsed to a boolean at request time, so a caller cannot distinguish "not yet asked" from "denied" — the canonical tri-state every notification API exposes (`Notification.permission`, `checkPermissions()`).
- **Dismiss / close / update.** No `closeNotification(tag)`, no way to programmatically dismiss or replace a shown notification. `tag` is accepted (which de-dupes/replaces on web) but there is no explicit update or clear-all (`getActiveNotifications` / `removeAllDeliveredNotifications`).
- **Scheduling.** No local-notification scheduling (`schedule({ at, repeat })`, cancel-scheduled, list-pending). This is a first-class feature of every mobile/native notification library and a primary reason apps reach for one.
- **Notification identity / return handle.** `showNotification` returns only `boolean`. There is no returned id/handle to later close, update, or correlate clicks — clicks are keyed only by the optional `tag`, so untagged notifications are uncorrelatable.
- **Rich content / styling.** No image/big-picture, badge, sound (only a `silent` toggle), vibration pattern, color/accent, large vs small icon, timestamp, or inline-reply text field. `body` + `icon` is the floor, not the canonical set.
- **Channels / categories / importance.** No notification channel or category model (Android channels, Apple categories, importance/priority levels, do-not-disturb interruption level) — required for correct behavior on modern mobile OSes.
- **Progress / ongoing / sticky.** No progress-bar, indeterminate, ongoing/persistent, or auto-dismiss-timeout fields.
- **Grouping / stacking.** No group/thread identifier for collapsing related notifications, and no summary notification.
- **Lifecycle events beyond click/action.** No `onNotificationShow`, `onNotificationClose`/dismiss, `onNotificationReply`, or app-launched-from-notification ("cold start" / `getLaunchNotification`) event — a critical mobile entry path.
- **Action feed on web.** `NotificationRequest.actions` exists in the type, but `createWebNotificationBackend` cannot deliver action callbacks (requires the Service Worker Notifications API). The package ships no service-worker backend variant, so on the only included backend `actions` is inert and `onNotificationAction` never fires. This is the largest type-vs-behavior gap.
- **Badge count.** Correctly out of scope here (the map assigns `setAppBadgeCount` to `@flighthq/app`) — noted only to confirm it is missing-by-design, not an omission.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `showNotification`, `requestNotificationPermission`, `isNotificationSupported`, `onNotificationClick/Action`, `get/set/createWebNotificationBackend` — all carry the full `Notification` type word and match the suite's command-capability grammar.
- `showNotification` vs the backend method `notify` is a minor seam asymmetry (public `show*`, backend `notify`); intentional and fine, but worth noting the verbs differ.
- Boolean-collapsed permission is the principal shape weakness: it loses the tri-state that callers legitimately need. A `getNotificationPermission()` returning the canonical three-state string would be the highest-value addition.
- `NotificationRequest` lives correctly in `@flighthq/types` as the header surface; expanding the domain mostly means widening that interface (sound, image, schedule, channel, progress, priority, group) plus matching backend methods, not restructuring the seam.

## Recommendation

Treat this as a faithful but minimal seam that needs depth to reach AAA for the notifications domain. Priority additions, roughly in order of canonical value:

1. `getNotificationPermission(): 'default' | 'granted' | 'denied'` — restore the tri-state.
2. A notification handle/id from `showNotification` plus `closeNotification(idOrTag)` and `closeAllNotifications()`.
3. Local scheduling: `scheduleNotification`, `cancelScheduledNotification`, `getPendingNotifications`.
4. Widen `NotificationRequest`: `image`, `sound`, `vibrate`, `badge`, `timestamp`, `priority`/`importance`, `channelId`/`category`, `group`/`threadId`, `requireInteraction`/`ongoing`, `progress`, inline-reply.
5. Lifecycle events: `onNotificationShow`, `onNotificationClose`, `onNotificationReply`, and a cold-start `getLaunchNotification`.
6. Ship a service-worker web backend (or document the per-instance click wiring) so `actions` and `onNotificationClick` are not inert on the only included backend — close the type-vs-behavior gap.

Until then the package is a correct foundation but does not, on its own, read as an authoritative notifications library.
