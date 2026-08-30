---
package: "@flighthq/permissions"
updated: null
by: null
---

# permissions — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-30 — Persistent storage owner projected; ledger row drained

- Query and request now capture only `Host.storage.persistenceQuery` and
  `Host.storage.persistenceRequest`, respectively; absence is structural and neither method crosses
  into the other slot.
- Projection preserves Storage's independent facts: persistent maps to common granted, operational
  failure stays reason-only, and best-effort carries the exact permission state or `null`.
- Deleted the direct `navigator.storage` request path and persistence holding/type id. The append-only
  history retains the seven-row checkpoint and adds the exact six-row successor.

## 2026-08-30 — Explicit-Host facade and seven-row ownership ledger

- Replaced the ambient `PermissionBackend` era with explicit `Host` query/request projection and
  deleted `system.permissions`, `HasSystemPermissions`, resolver/mutator/sentinel/observer/explain,
  guard, and host-web enabler paths.
- Ratified Notification's sole seam as `Host.notification.permission`; method-tight projection keeps
  owner decisions and operational failure distinct, and the permanent cross-domain test rejects any
  second native Notification owner.
- Added owner-captured ordered/repeated batches, bounded media/wake-lock cleanup, and exact query vs
  prompt plus cleanup-failure vs denial type/test boundaries.
- Added the exact media/geolocation/persistence/MIDI/wake-lock/clipboard/push native-holdings ledger,
  future-domain labels, monotonic drain history, and direct-native-site audit.
- Updated this package's charter/assessment/review, package map/catalog, shared lifecycle ownership,
  and host-web architecture. Notification records remain with that owner; this package cites its sole
  seam without duplicating the owner's record.
- Deferred only the row-by-row holding drain. Clipboard and push remain query-only; no generic
  subscription, guessed request aggregate, owner map, or slot map was introduced.
