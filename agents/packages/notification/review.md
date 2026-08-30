---
package: '@flighthq/notification'
status: solid
score: 90
updated: 2026-08-30
ingested:
  - packages/notification/src
  - packages/types/src/Notification.ts
  - packages/types/src/Host.ts
  - packages/host-web/src/webNotification.ts
  - packages/host-web/src/webServiceWorkerNotification.ts
  - packages/host-electron/src/electronNotification.ts
  - packages/host-tauri/src/tauriNotification.ts
  - packages/host-capacitor/src/capacitorNotification.ts
---

# notification — Review

## Verdict

`solid — 90/100`. The live tree at implementation commit `e98ebed82` is a types-first, explicit-dependency
notification domain. Eleven top-level traits represent actual coverage rather than one monolithic backend.
All public operations return named outcomes, all delivered/scheduled identities are stable Entity resources,
and all per-item operations are pinned to their origin provider. The previous id-rerouting, fake scheduling,
silent field loss, false permission, and swallowed-error failure classes are structurally absent.

## Verified surface

- The root exports 31 user operations: five subscription create/attach/detach/dispose families, delivery,
  close-all, stable-resource close/cancel, active/pending enumeration, permission query/request, scheduling,
  and lifecycle destroy. Contract-only resource/binding helpers let providers create and pin Entities without
  exporting native keys.
- Profiles are exact: Web page 7 traits; Web Service Worker 8; Electron common 6 and macOS 8; Tauri 3;
  Capacitor 6. Tests assert key equality, not mere presence. Unsupported fields return `invalid-request` or
  `invalid-schedule` with the rejected field names.
- Delivery is an acquisition. Web page publishes only after native construction; SW after awaited
  `showNotification`; Electron after `show`; Capacitor after validated native ids; Tauri after the plugin call.
- Lifecycle is composite, terminal, idempotent, attempt-all, and retry-only. Event attach/release outcomes retain
  both failure dimensions. Subscription disposal clears its Signal and cannot be revived.
- Web providers require injected facades and are split by page versus Service Worker context. Request `data`
  is passed unchanged. SW events are explicit caller-fed native events, not synthetic reply/show behavior.
- `Host.notification.permission` is the only notification-native permission owner. Electron correctly lacks it;
  Tauri/Capacitor/Web expose it. Tray is untouched.

## Remaining limits

- Real OS prompt and delivery behavior needs the interactive/device host-probe lanes; unit tests use dependency-
  injected facades deliberately.
- The request vocabulary does not yet express provisional authorization, progress, grouping, or ongoing
  delivery. Those remain absent until a derived provider slice justifies them.
- No Rust crate exists in this repository.

## Contract fit

- Types live in `@flighthq/types`; implementation packages own behavior. ✔
- No ambient backend getter/setter, default Host fallback, or parallel legacy surface. ✔
- Missing capability is a type-level absent trait; denial/failure is a named runtime outcome. ✔
- Event eligibility includes async acquisition and release; provider teardown owns every acquired resource. ✔
- Export-named tests and structural absence checks protect the deleted surface. ✔
