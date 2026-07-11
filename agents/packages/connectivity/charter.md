---
package: '@flighthq/connectivity'
crate: flighthq-connectivity
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# connectivity — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/connectivity` is the connectivity-status event cell of the platform-integration suite: it reports whether the application is online, what kind of link it is on, and how good that link is — plus an opt-in one-shot reachability probe. It is an event-style platform capability modeled on the connectivity-reporting surface of mature cross-platform shells (Electron `net.online`, Capacitor `@capacitor/network`, the browser Network Information API). It is not an HTTP/fetch/socket transport library. The shipped shape is the suite's standard event quartet (`createConnectivity`/`attachConnectivity`/`detachConnectivity`/`disposeConnectivity`) over a swappable `ConnectivityBackend` with a lazy web default, plus a snapshot reader, edge/level signals, a status diff, and the reachability probe.

## Decisions

- **[2026-07-02] Fix: `detectConnectivityReachability` fallback allocates a fresh web backend per call.** When a native backend lacking `detectReachability` is installed, the fallback builds `createWebConnectivityBackend()` on every probe. This is a bug — cache the fallback backend or require the native backend to implement the method.
- **[2026-07-02] Fix: `anyAbortSignal` leaks listeners.** The abort-signal combiner does not clean up listeners. Fix as a bug.

## Open directions

- Whether the continuous reachability monitor (`createConnectivityReachabilityMonitor` — backoff, quorum probing, captive-portal detection) belongs in this package or a sibling.
- Fallback routing policy when a native backend lacks `detectReachability` — web-fetch fallback always, or sentinel.
- `metered` web heuristic (`saveData || type === 'cellular'`) mis-classifies some scenarios; by-design for web, native flag needed for correctness.
