---
package: '@flighthq/connectivity'
updated: 2026-08-29
by: builder4
---

# connectivity — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **Reachability is one-shot only.** There is no continuous monitor, backoff, multi-URL quorum, or
  captive-portal classification. Ownership of that additional Entity remains undecided.
- **Web metering remains heuristic.** The Web provider reports metered when save-data is set or the
  Network Information type is cellular. A native OS flag is the only authoritative answer.
- **Electron and Tauri intentionally expose `connectivity: {}`.** Neither host package has a ruled real
  provider; there is no implicit Web reachability or status fallback.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-29** — Replaced the ambient `ConnectivityBackend` with explicit Entity-backed
  status/change/reachability Host slots (vectors Web+Capacitor, Web+Capacitor, Web). Core attachment now
  reports subscription failure, origin-pins exact releases, clears all five signals on dispose, and has
  explicit terminal provider destruction. Web returns `null` when event APIs are unavailable. Capacitor
  owns one native listener, begins unknown rather than offline, fans out locally, notifies initial
  readiness, ignores a stale initial result after a newer event, and removes the exact handle even when
  destroyed before registration resolves. `createConnectivityStatus` was deleted because status is a
  backend-produced query/out snapshot, not a user-constructed identity.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract and corrected the then-existing Capacitor path.
- **2026-06-24** — Added detailed status fields, diff signals, and one-shot reachability with cancellation.
