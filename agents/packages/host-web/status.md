---
package: "@flighthq/host-web"
updated: 2026-08-30
by: builder3
---

# host-web — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

_What is unfinished, half-done, or known-wrong in `@flighthq/host-web` right now — the dangling threads
and gotchas a reader would otherwise rediscover. Present tense. Rewrite this section rather than
appending to it: a closed thread is deleted, not struck._

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Added injected Window query/request and Worker query-only storage-persistence
  factories. `webHost.storage` composes the Window slots without changing the standalone
  `webWindowBackend` import graph.
- **2026-08-30** — Notification moved from the notification package into two injected factories. Page and Service Worker profiles are exact and separate; there are no fake page/SW timers, update, SW reply/show, or injected data key. `webHost.notification` stays empty until a caller composes the correct context.

- **2026-08-30** — Removed the ambient web Shortcut backend path. `webHost` now publishes the
  required top-level `shortcut` group as exact `{}`, so absence of both optional providers is
  structural and survives composition/probing without a sentinel.
