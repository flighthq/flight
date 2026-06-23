# API Alignment: @flighthq/network

**Verdict:** Strong — naming, verbs, sentinels, and the event-capability shape are textbook; the only gap is missing `Readonly<>` on entity/reference parameters, a pattern shared with the whole `*` event-capability family (e.g. `power`).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `attachNetwork(net: Network)`, `detachNetwork(net: Network)`, `disposeNetwork(net: Network)` | The `net` param is not `Readonly<Network>`. None of these mutate the `Network` entity's fields (they emit to its signals / mutate the module-level `_subscriptions` WeakMap), so the entity should be marked immutable per the "Readonly everywhere mutation is not intended" rule. | Change the parameter type to `Readonly<Network>`. Note: the sibling `power` package has the identical gap (`attachPower(power: Power)` etc.), so this is best fixed family-wide for consistency rather than network-only. |
| Low | `setNetworkBackend(backend: NetworkBackend \| null)` | Stores `backend` into module state by reference; the rule extends `Readonly<>` to stored references, and the backend is consumed read-only (only its `getStatus`/`subscribe` methods are called). | `backend: Readonly<NetworkBackend> \| null`. Again mirrors `setPowerBackend` — align the family. |
| Info | `getNetworkBackend()` | A `get*` accessor that lazily allocates the web default on first call (`if (_backend === null) _backend = createWebNetworkBackend()`). This is the intended "there is always a backend" lazy-default pattern and matches `getPowerBackend`/`getLifecycleBackend`, so not a defect — flagged only because `get*` normally implies no allocation. No change needed. |

## Clean

- **Full, unabbreviated type word** in every export: `attachNetwork`, `createNetwork`, `createNetworkStatus`, `createWebNetworkBackend`, `detachNetwork`, `disposeNetwork`, `getNetworkBackend`, `getNetworkStatus`, `isNetworkOnline`, `setNetworkBackend`. No `Net`/`Conn` abbreviations anywhere; the internal `mapWebConnectionType` spells `Connection` out too.
- **Globally unique names** — every root export is `Network`-prefixed (or `is`/`Web` + `Network`); no collision risk from the barrel.
- **Allocation by verb is correct.** `createNetwork`, `createNetworkStatus`, `createWebNetworkBackend` allocate; `getNetworkStatus(out)` writes into the caller's `out` and allocates nothing (delegates to `backend.getStatus(out)`), suitable for hot polling.
- **`out`-param is alias-safe.** The web `getStatus(out)` reads all sources (`navigator`, `connection`) into locals before writing any `out` field and never reads from `out`, so `out === any input` is safe.
- **Teardown verbs used with their exact meanings.** `detachNetwork` is the event-subscription un-bracket of `attachNetwork`; `disposeNetwork` detaches and releases to GC (no GPU/native handle to free, so correctly `dispose*` not `destroy*`).
- **Sentinels, never throws.** Expected-absence is reported via `online: true`, `type: 'unknown'`, `downlink: -1`, `effectiveType: ''`, and a no-op unsubscribe when `window` is undefined. No exceptions for expected-missing cases.
- **`get*`/`is*` discipline.** `isNetworkOnline` returns `boolean` with the `is` prefix; `getNetworkBackend`/`getNetworkStatus` return objects with `get`.
- **Verb & parameter-order consistency with siblings.** The export set is a near-exact match of `@flighthq/power` and the `attach/detach/dispose/create/createWeb*Backend/get*Backend/set*Backend/get*Status` event-capability template described in the codebase map; `createWebNetworkBackend` follows the `createWeb<X>Backend` convention.
- **Type hygiene.** `import type { Network, NetworkBackend, NetworkConnectionType, NetworkStatus }` is on its own dedicated `import type` line, separate from the `@flighthq/signals` value import; all cross-package types come from `@flighthq/types` (the only inline interface, `WebNetworkConnection`, is a private non-exported DOM shim — acceptable).
- **Exported functions alphabetized**; `package.json` is `"sideEffects": false` and module state (`_backend`, `_scratch`, `_subscriptions`) is initialized lazily, not at import time.
