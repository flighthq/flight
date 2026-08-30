---
package: "@flighthq/permissions"
updated: 2026-08-30
by: builder2
---

# permissions — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-08-30 — Geolocation delegated; another ledger row drains

`requestPermission(host, 'geolocation')` no longer holds a native trigger. It reads
`Host.system.geolocation` and projects the capability's own `GeolocationAccessOutcome`;
`requestWebGeolocationPermission` and the private `getWebGeolocation` helper are DELETED, not
relocated. Routed above the interim guard, as `notifications` already is, because that guard is
derived from the holdings ledger and geolocation's row is gone.

No package dependency was added: this file imports only `@flighthq/types` and reads a Host slot.

`timeout` is carried through as a REASON WITH NO STATE (`PermissionRequestFailureReason` gained
`'timeout'`). A position deadline is an acquisition observable, not a decision — projecting a state
from it would invent one. A caller that needs the state queries for it.

After the persistence drain, `PERMISSION_NATIVE_HOLDINGS` drops from six rows to five; the history
ratchet in `scripts/permission-native-holdings.test.ts` retains the seven-row initial checkpoint, the
six-row persistence successor, and this five-row successor. That gate also had a defect this drain
exposed: its first test asserted the LIVE ledger equalled the seven INITIAL ids, so it could not have
survived a drain. It now describes the initial checkpoint, and the live set is checked against the
latest checkpoint by the ratchet test.

WATCH NEXT: the gate's `nativeSites` patterns match WORDS, not native reach. Geolocation's was
narrowed to `navigator.geolocation` / `getCurrentPosition` because the bare token also appears as a
permission name, a `PermissionNativeHoldingId` member, and now the delegation itself — testing the
word would pin the row forever by the very code that removed the holding. Persistence's native-reach
pattern is narrowed for the same reason; the five live rows will each need this treatment when they
drain.

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
