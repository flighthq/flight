# TS↔Rust Alignment: @flighthq/notification

**Verdict:** In sync — 7 of 8 TS exports port 1:1 with correct names; the one omission (`createWebNotificationBackend`) is the documented web-relocation, not drift.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `@flighthq/notification` | `flighthq-notification` | OK — identity package→crate name. |
| `createWebNotificationBackend` / `notification.ts` | _(absent)_ | Not ported. **Documented divergence, not a gap.** conformance.md line 119 places browser-API-only implementations in `host-web`, not the native core crate; `createWebNotificationBackend` is implemented entirely over the global `Notification` API, so it is web-relocated. The script also classifies it `web-relocated` (in `WEB_PACKAGES`). No per-function map entry exists, but the blanket rule covers it. Nice-to-have: the seam asymmetry below is worth one explicit line in the divergence map. |
| `getNotificationBackend` / `notification.ts` | `get_notification_backend` / `notification.rs` | Name maps 1:1. **Semantic divergence:** TS lazily creates a web default (`there is always a backend`); Rust **panics** when no backend is installed. Driven by the same web-relocation rule (Rust has no in-crate web default to lazy-create), so it is a correct consequence — but the behavior contract differs (always-returns vs panic-on-missing). Not recorded in the map; should be noted as the seam-shape consequence of omitting `createWebNotificationBackend`. |
| `isNotificationSupported` / `notification.ts` | `is_notification_supported` / `notification.rs` | OK — `is_` boolean prefix preserved. |
| `onNotificationAction` / `notification.ts` | `on_notification_action` / `notification.rs` | OK — full type word preserved; returns unsubscribe closure (TS `() => void` → Rust `Box<dyn Fn() + Send + Sync>`). |
| `onNotificationClick` / `notification.ts` | `on_notification_click` / `notification.rs` | OK. |
| `requestNotificationPermission` / `notification.ts` | `request_notification_permission` / `notification.rs` | OK — `Promise<boolean>` → `async fn -> bool`; sentinel `false` on denial preserved. |
| `setNotificationBackend` / `notification.ts` | `set_notification_backend` / `notification.rs` | OK — `NotificationBackend \| null` → `Option<Arc<dyn NotificationBackend>>` (null→Option preserved). |
| `showNotification` / `notification.ts` | `show_notification` / `notification.rs` | OK — `Readonly<NotificationRequest>` → `&NotificationRequest`; `Promise<boolean>` → `async -> bool`; sentinel `false` preserved. |

## In sync

- Package→crate name is identity, no rename map entry needed.
- All seven ported functions: exact camelCase→snake_case, full unabbreviated type word (`Notification`) preserved in every name, no abbreviations, no extra Rust-only public functions.
- File name tracks: TS `notification.ts` ↔ Rust `notification.rs` (same basename); `lib.rs` re-exports all seven.
- Convention carry-over is clean: `Readonly<T>`→`&T`, `null`→`Option`, `Promise<bool>`→`async -> bool`, unsubscribe closures preserved, expected-failure sentinel `false` preserved (denial/unsupported is not a panic).
- The single omission is the expected web-relocation per conformance.md line 119; the core crate correctly retains only the `get_*`/`set_*` seam plus the delegating verbs.

### Suggested divergence-map addition

The blanket line-119 rule covers the omission, but two notification-specific nuances are invisible to the script and worth one map line:

1. `createWebNotificationBackend` is web-relocated to `host-web` (no native default backend in-crate).
2. As a consequence, `get_notification_backend` **panics on missing backend** rather than lazily returning a web default — the TS "there is always a backend" guarantee does not hold in Rust core until a host installs one. This is the only behavioral contract change in the crate and should be auditable rather than inferred.
