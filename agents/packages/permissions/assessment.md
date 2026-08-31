---
package: '@flighthq/permissions'
updated: 2026-08-30
basedOn: ./review.md
---

# permissions — Assessment

## Recommended

_None open._ The ratified explicit-Host facade slice is complete.

## Landed

1. **Explicit Host facade/projector.** All three exports require a `Host`; the ambient backend era,
   `system.permissions`, sentinels, observers, explainers, guards, and host-web enabler are deleted.
2. **Owner-tight Notification projection.** Notification uses only
   `Host.notification.permission`; owner decisions and operational failure stay distinct.
3. **Read-only query boundary.** Query never invokes a request that may prompt, and unsupported or
   failed reads cannot masquerade as a plausible state.
4. **Method-tight request boundary.** Missing request routes do not fall through to reads. Denial,
   dismissal, operational failure, runtime absence, and unsupported names remain distinct.
5. **Owner-captured batches.** Ordered and repeated names are preserved while every resolved owner is
   captured once before any work begins.
6. **Bounded temporary acquisition.** Media tracks are stopped attempt-all and wake locks are released
   in `finally`; cleanup failure is separately reported after successful acquisition.
7. **Four-row native-holdings ledger.** Media, wake lock, clipboard, and push each name their future
   claiming domain; structural tests retain the seven-row history checkpoint and the Persistence,
   Geolocation, and MIDI drains, allowing rows to shrink but never grow.
8. **Permanent ownership falsifiers.** Colocated export-named tests and the cross-domain structural
   gate forbid a second native Notification owner and the deleted ambient mechanisms.
9. **Persistent storage projection.** Query and request use only their corresponding `Host.storage`
   slots, preserve best-effort state or `null`, and leave no direct Storage API owner in Permissions.
10. **MIDI projection without acquisition.** Query uses only `Host.midi.permission`; request has no
    route here and cannot touch `Host.midi.access` or a Web global.

## Backlog

- **Drain the four native holdings** as their named domains land. Clipboard and push remain
  query-only; adding a request trigger or a new holding requires a ruling.
- **No owner/slot map yet.** Derive one only after repeated owner shapes exist; do not guess an
  aggregate or generic subscription.

## Approved

_Empty — no additional implementation is authorized by this record._
_Empty — awaiting the user's verbal gate._
