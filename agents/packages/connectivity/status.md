---
package: '@flighthq/connectivity'
updated: 2026-08-08
by: principal
---

# connectivity — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/connectivity/src/`, `packages/types/src/Connectivity.ts`, and both
registering hosts on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Reachability is one-shot only.** `detectConnectivityReachability` (`connectivity.ts:138`) performs
  a single `HEAD` with a timeout; no `*ReachabilityMonitor` symbol exists anywhere in `packages/`, so
  there is no continuous probe, no backoff, and no multi-URL quorum. Ownership of that sub-entity —
  here, or a sibling package — is still the undecided part, not the effort.
- **No captive-portal signal.** `ConnectivityReachability` reports `reachable` / `latency` only; a
  portal that answers 200 to any request is indistinguishable from real connectivity.
- **`estimateConnectivityQuality` does not exist** anywhere in `packages/`, so a host without the
  Network Information API (Firefox, Safari, most native shells) has no derived quality class — it just
  reads the `-1` / `''` sentinels from `createConnectivityStatus` (`connectivity.ts:52-63`).
- **`metered` is a web heuristic**: `saveData || type === 'cellular'` (`connectivity.ts:79`). Wi-Fi
  tethered from a phone reads unmetered; an unlimited cellular plan reads metered. A native backend
  reporting the OS flag is the only real fix.
- **Electron has no connectivity backend.** `host-electron/src` carries no connectivity adapter and
  `electronRegister.ts` never calls `setConnectivityBackend`, so an Electron app falls back to the web
  backend's `navigator.onLine` — the interface-not-internet reading — with no `powerMonitor` or
  `net.online` input.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline false claim: "the
  `host-capacitor` path does not yet exist" — it does, and it is wired:
  `host-capacitor/src/capacitorConnectivity.ts`, installed at `capacitorRegister.ts:44`. Every
  `packages/network/…` path in the old log was also stale; the package is `packages/connectivity`,
  and the file's own `# network — Status Log` heading went with them.
- **2026-06-25** — Deliberate no-op sweep: the assessment's Recommended list was "None", so nothing
  within the package boundary was left to change.
- **2026-06-24** — Connectivity matured: `saveData` / `rtt` / `metered` / `downlinkMax` on the status
  snapshot, nine connection types, edge-triggered `onConnectionTypeChange` and `onMeteredChange`, and
  the one-shot `detectConnectivityReachability` probe with external-cancellation support.
