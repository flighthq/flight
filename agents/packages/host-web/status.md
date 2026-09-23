---
package: '@flighthq/host-web'
updated: 2026-09-23
by: auditor
---

# host-web — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

No source defect was found in this review. These intentional integration obligations remain easy to
misread as supplied capabilities:

- **Portable algorithms are not browser-host capabilities.** `webHost.compress`,
  `webHost.decompress`, and `webHost.textSegment` are empty. Applications that want turnkey behavior
  must compose portable SDK providers separately.
- **Context-specific APIs are not guessed.** The default notification and MIDI groups stay empty;
  callers select the explicit Page, Service Worker, or injected MIDI factory appropriate to their
  runtime and permission policy.
- **Browser availability is operation- and context-dependent.** New providers must preserve the
  package's injected/guarded pattern instead of treating the `web` environment marker as proof of API,
  permission, secure-context, or DOM availability.
- **The charter points to a missing assessment.** There is no approved recommendation history for this
  package; the review records the fact without inventing one.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-23** — Added the first source-grounded review and re-audited `webHost` composition; Canvas
  now supplies `HostCanvasCapability` directly, while creator-callback compatibility exports are gone
  and portable/context-specific groups remain structurally absent.
- **2026-08-30** — MIDI gained exact injected access and permission+access factories over lib.dom. The
  default `webHost.midi` remains empty so ordinary construction and CI never request hardware.

- **2026-08-30** — Added injected Window query/request and Worker query-only storage-persistence
  factories. `webHost.storage` composes the Window slots without changing the standalone
  `webWindowBackend` import graph.
- **2026-08-30** — Notification moved from the notification package into two injected factories. Page and Service Worker profiles are exact and separate; there are no fake page/SW timers, update, SW reply/show, or injected data key. `webHost.notification` stays empty until a caller composes the correct context.

- **2026-08-30** — Removed the ambient web Shortcut backend path. `webHost` now publishes the
  required top-level `shortcut` group as exact `{}`, so absence of both optional providers is
  structural and survives composition/probing without a sentinel.
