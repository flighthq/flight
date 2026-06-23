# Filename Alignment: @flighthq/notification

**Verdict:** Clean. Not a backend-variant package (a single-implementation platform-capability cell with a swappable `NotificationBackend`), so the no-backend-prefix rule applies: the one source file takes the plain domain name `notification.ts`, which holds the entire notification command surface and passes the remove-the-folder test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — thin barrel; sole content is `export * from './notification'`. Correct per the single-root-entry rule.
- `notification.ts` — domain-named file covering the whole capability: backend seam (`createWebNotificationBackend`, `getNotificationBackend`, `setNotificationBackend`), commands (`showNotification`, `requestNotificationPermission`, `isNotificationSupported`), and inbound event subscriptions (`onNotificationClick`, `onNotificationAction`). Names the domain, not a single function. Self-describing with the folder removed.
- `notification.test.ts` — colocated, mirrors the source filename exactly.
