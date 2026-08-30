---
package: '@flighthq/permissions'
role: package
crate: flighthq-permissions
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# permission — Charter

## What it is

`@flighthq/permissions` is an explicit-Host **permission facade/projector**. It gives callers one
query/request vocabulary without claiming the native permissions that capability domains own. Each
result is projected from the owner named by the supplied `Host`; the facade has no ambient provider,
resolver, sentinel backend, subscription, or replacement lifecycle.

## North star

Capability domains own native permission seams; this package only projects them into method-tight
shared outcomes. A query is read-only and never escalates to a request that may prompt. A request
preserves the owner's decision reason, and a cleanup failure after a successful temporary acquisition
is an operational failure, never user denial. Ordered batches capture every owner once before work.

## Boundaries

- **Explicit Host facade.** All public operations take a `Host`; `PermissionBackend`,
  `system.permissions`, `HasSystemPermissions`, ambient mutators/resolvers, explainers, observers,
  sentinels, guards, and host-web enablers are absent.
- **Sole Notification seam.** Notification query/request delegates exclusively to
  `Host.notification.permission`. Direct `Notification` or native-plugin permission access in this
  package would create a forbidden second owner.
- **Seven interim native holdings.** Media (camera + microphone), geolocation, persistence, MIDI,
  wake lock, clipboard, and push are recorded structurally with their future claiming domains. They
  are bounded migration holdings, not ownership claims, and drain row-by-row as those domains land.
- **No guessed aggregate.** There is no generic subscription and no owner/slot map until repeated
  owner shapes derive one. Unsupported operations remain absent or return a method-tight reason.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Async command capability, three-state result.** `getPermissionState(name): Promise<PermissionState>` (query, non-prompting) and `requestPermission(name): Promise<PermissionState>` (may trigger the OS prompt). `PermissionState = 'granted' | 'denied' | 'prompt'` (the Permissions-API vocabulary; `'prompt'` = not yet decided). `PermissionName` = open string union (`'camera'|'microphone'|'geolocation'|'notifications'|'clipboard-read'|'clipboard-write'|'persistent-storage'|'push'|'midi'|'screen-wake-lock' | (string & {})`). Async because the web Permissions API and every request path are promise-based.
- **[2026-07-10] Web backend maps query + request per permission.** Query goes through `navigator.permissions.query({ name })` where supported; `request*` routes each name to its real web trigger (notifications → `Notification.requestPermission`, camera/mic → `getUserMedia`, geolocation → a one-shot position request, persistent-storage → `navigator.storage.persist`, …). A name with no mapping, or a missing API, resolves to `'prompt'`/`'denied'` sentinel — never throws.
- **[2026-07-10] `PermissionName`/`PermissionState`/`PermissionBackend` in `@flighthq/types`.** Header owns the shapes; functions carry the `Permission` name.
- **[2026-08-30] Explicit-Host facade/projector supersedes the ambient backend.** The facade has no
  native permission backend of its own. `PermissionBackend`, `system.permissions`,
  `HasSystemPermissions`, every ambient resolver/mutator/sentinel/observer/explainer/guard, and the
  host-web enabler are deleted. Shared query/request outcomes remain in `@flighthq/types`.
- **[2026-08-30] Notification has exactly one permission seam.** The owner is
  `Host.notification.permission`; this facade delegates to it exclusively and projects
  `default` to `prompt` without erasing `denied`, `dismissed`, `granted`, or `operation-failed`.
- **[2026-08-30] Method-tight calls and owner-captured batches.** Query never requests, request never
  degrades to query, and an ordered/repeated batch captures each resolved owner exactly once before
  starting work.
- **[2026-08-30] Temporary native acquisition is bounded.** Media tracks and wake-lock sentinels are
  released attempt-all in `finally`. Failure to clean up after acquisition is `cleanup-failed` with
  granted state: Flight's operational failure, never user denial.
- **[2026-08-30] Exactly seven native holdings remain.** The structural ledger contains media,
  geolocation, persistence, MIDI, wake lock, clipboard, and push, each naming its future claiming
  domain. Rows may only drain; adding a row or widening a query-only row requires a new ruling.

## Open directions

1. **Drain the native-holdings ledger.** Move each row to its named capability domain when that owner
   lands, deleting the facade's native trigger in the same slice.
2. **Derive before abstracting.** Keep owner/slot maps and any cross-domain aggregate structurally
   absent until repeated landed owner shapes justify them.
