---
package: "@flighthq/permissions"
updated: 2026-08-30
by: builder5
---

# permissions — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

- **2026-08-30** — Notification R5/R6 assigns native notification permission exclusively to
  `Host.notification.permission`. The generic `'notifications'` path must delegate there; direct
  `Notification.permission`/`Notification.requestPermission` fallback code in the legacy Permissions backend
  is deletion/migration debt for the Permissions slice, not a second blessed native seam. Notification
  permission success is distinct from delivery acceptance and display success.
