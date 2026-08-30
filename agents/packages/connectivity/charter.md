---
package: '@flighthq/connectivity'
role: package
crate: flighthq-connectivity
draft: false
lastDirection: 2026-08-29
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# connectivity — Charter

See [platform integration shared principles](../platform-integration.md) and the
[explicit dependency model](../../explicit-dependency-model.md) for the suite-wide decisions.

## What it is

`@flighthq/connectivity` owns a core event Entity that turns raw host connectivity notifications into
status snapshots and five diff signals. Host capabilities are explicit and split by shape:
`connectivity.status` is a snapshot command, `connectivity.change` is a raw event subscription, and
`connectivity.reachability` is an active one-shot probe. Web supplies all three slots; Capacitor supplies
status and change through one shared provider Entity; Electron and Tauri supply none. Core owns
`onChange`, online/offline edges, connection-type changes, and metered changes because core emits them
after reading and diffing status. The package is not an HTTP/fetch/socket transport library.

## Decisions

- **[2026-08-29] Explicit Host split.** The ambient custom/host/sentinel precedence family, diagnostics,
  Web fallback, and host enabler are deleted. Commands take the exact Host witness they require.
- **[2026-08-29] Unknown is distinct from offline.** `ConnectivityStatus.online` is `boolean | null`;
  `null` means no provider measurement exists yet. Capacitor begins unknown, then notifies subscribers
  when its initial async status resolves so core can observe the first measured transition.
- **[2026-08-29] Change providers own terminal teardown.** `ConnectivityChangeBackend.destroy()` releases
  provider-level event resources. `destroyConnectivity(host)` is the explicit shutdown path;
  per-entity detach consumes only that entity's origin-pinned unsubscribe.
- **[2026-08-29] Status snapshots are query values, not created identities.**
  `createConnectivityStatus` is deleted: no user constructs a status object as an SDK identity. Backends
  fill query/out snapshots, while package-private sentinel allocation supports internal reads.

## Open directions

- Whether a continuous reachability monitor (backoff, quorum probing, captive-portal detection) belongs
  in this package or a sibling.
- Whether `ConnectivityReachability` should report captive-portal state.
- The Web `metered` heuristic (`saveData || type === 'cellular'`) cannot replace a native OS metering flag.
