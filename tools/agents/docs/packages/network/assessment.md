# network — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Fix `detectNetworkReachability` fallback** — when the native backend lacks `detectReachability`, the fallback allocates a fresh web backend per call via `createWebNetworkBackend()`. Should reuse a cached instance or the already-set backend to avoid unnecessary allocation on every reachability probe.
2. **Fix `anyAbortSignal` listener leak** — the `anyAbortSignal` helper adds `abort` listeners to each input signal but never removes them when the combined signal fires, leaking listeners on long-lived `AbortSignal` instances.

## Approved

1. **Fix `detectNetworkReachability` fallback** [2026-07-02 · blanket "platform integration suite sweep"]
2. **Fix `anyAbortSignal` listener leak** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
