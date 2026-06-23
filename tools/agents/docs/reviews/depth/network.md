# Depth Review: @flighthq/network

**Domain**: Network connectivity status — the online/offline reachability and link-quality reporting cell of the platform-integration suite. This is an _event-style platform capability_ (the Package Map lists it under "Platform Integration Suite … `@flighthq/network` (event): connectivity status and online/offline signals"), **not** an HTTP/fetch/socket transport library. The domain bar is therefore the connectivity-reporting surface of a mature cross-platform shell (Electron `net.online`/`powerMonitor`, Capacitor `@capacitor/network`, Cordova `network-information`, the browser Network Information API), not axios/undici.

**Verdict**: solid — 78/100

## Present capabilities

The package implements the full event-capability shape the suite prescribes, and the connectivity sub-domain it claims:

- Entity lifecycle: `createNetwork`, `attachNetwork`, `detachNetwork`, `disposeNetwork` — the canonical `create*`/`attach*`/`detach*`/`dispose*` quartet for an event capability, mirroring the window-wiring pattern. `attachNetwork` is idempotent (tears down a prior subscription first) and `detachNetwork`/`disposeNetwork` are safe when not attached.
- Snapshot read with explicit out-param: `getNetworkStatus(out)`, plus the zero-allocation allocator `createNetworkStatus()`. Convenience boolean `isNetworkOnline()`.
- Signals: `onChange(status)`, `onOnline()`, `onOffline()` — edge-triggered online/offline (it tracks `wasOnline` and only fires the transition signals on an actual change) layered over a level `onChange`. This is the correct event model.
- Backend seam: `getNetworkBackend`/`setNetworkBackend`/`createWebNetworkBackend`, lazy web default, `null` resets to web. Matches the suite's command-capability backend trio.
- Web backend depth: reads `navigator.onLine`, the Network Information API (`connection.type`/`downlink`/`effectiveType`), and wires `online`/`offline`/`connection 'change'` events. Degrades to `online=true`, `type='unknown'` where APIs are absent (SSR/jsdom-safe via `typeof` guards).
- Status payload (`NetworkStatus` in `@flighthq/types`): `online`, `type` (`NetworkConnectionType`: wifi/cellular/ethernet/bluetooth/none/unknown), `downlink` (Mbps, `-1` sentinel), `effectiveType` ('4g'/'3g'/…/''). Sentinel discipline is consistent.

## Gaps vs an authoritative connectivity library

Against a mature connectivity-reporting library, a few canonical fields/affordances are absent — these are by-omission, not by-design, and most are cheap:

- **Metered / save-data flag.** The Network Information API exposes `connection.saveData` (and metered hints); Capacitor/Cordova surface "is this connection metered." This is a first-class field developers branch on (defer large downloads on cellular/metered) and is missing from `NetworkStatus`.
- **RTT / latency estimate.** The Network Information API also exposes `connection.rtt`. `downlink` is mapped but `rtt` is dropped, so link-quality reporting is half-complete.
- **`downlinkMax`** (max plausible downlink for the underlying tech) — minor, but part of the canonical NetInfo surface.
- **Reachability / "internet vs. interface".** `navigator.onLine` only reports a network interface, not actual internet reachability — a well-known false-positive. An authoritative library typically offers a reachability probe (ping/HEAD against a host) distinct from interface state. Not present and arguably out of scope for a pure event cell, but worth a note as the single biggest correctness caveat of relying on `online`.
- **No native default backend in the package.** Consistent with the suite's web-default rule, but the Rust-port note ("Rust's ambient default is native/std") implies the TS side is web-only by design; fine, but means there is no in-box test of a non-web backend beyond the seam.

Genuinely out of domain (correctly absent — would belong to other cells or a transport package, not this one): HTTP/fetch wrappers, retries/backoff, WebSocket/SSE, request cancellation, DNS, proxy config, bandwidth metering history. None of these are gaps for _this_ package.

## Naming / API-shape notes

- Naming is clean and self-identifying: every exported function carries the full `Network` type word (`getNetworkStatus`, not `getStatus`), per the design rules. The backend method `getStatus`/`subscribe` are interface-internal and correctly unprefixed.
- Out-param convention is honored (`getNetworkStatus(out)`, `createNetworkStatus` as its allocator). `_scratch` reuse inside `isNetworkOnline`/`attachNetwork` is a sound zero-alloc internal.
- Module-private state (`_backend`, `_scratch`, `_subscriptions` WeakMap) is at the file bottom, side-effect-free, tree-shakable — matches the package conventions. `WeakMap`-keyed subscriptions avoid leaking detached entities.
- `Signal` payload types come from `@flighthq/types`; no cross-package types defined inline. Correct.

## Recommendation

Keep the verdict at **solid**. The package is a complete, correctly-shaped implementation of the connectivity-event cell with no architectural gaps — the entity quartet, backend seam, edge/level signals, sentinels, and SSR guards are all canonical. To reach **authoritative** for the connectivity domain, extend `NetworkStatus` (in `@flighthq/types`) with the remaining NetInfo-canonical fields and wire them in `createWebNetworkBackend`: `saveData`/metered (boolean), `rtt` (ms, `-1` sentinel), and optionally `downlinkMax`. Optionally document the `navigator.onLine` "interface, not internet" caveat and consider whether an explicit reachability probe belongs here or in a sibling. These are small, additive changes; the foundation is sound.
