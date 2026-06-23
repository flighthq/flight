# TS↔Rust Alignment: @flighthq/network

**Verdict:** Well aligned — all ported functions map 1:1 with correct names and conventions; the only structural gap (`createWebNetworkBackend`) is a documented host-web divergence, but one type-field rename and an `attach_network` stub-body gap should be addressed/recorded.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `@flighthq/network` | `flighthq-network` | OK — identity, no rename. |
| `src/network.ts` | `src/network.rs` | OK — basename tracks. |
| `attachNetwork` | `attach_network` | Present and named correctly. The conformance script flags it "missing", but it is implemented (network.rs:79) and re-exported (lib.rs). Script under-counts; not a real gap. **However** the subscribe closure body (network.rs:91–117) never re-reads the backend status on change — it hardcodes a default `online=false` status instead of calling `get_status`, so `on_change`/`on_online`/`on_offline` carry stale/wrong data. TS captures `backend` and calls `backend.getStatus(_scratch)` per change. This is a functional conformance gap acknowledged by the in-source NOTE; should be fixed (capture `Arc<dyn NetworkBackend>` into the closure) or recorded as an intentional stub. |
| `detachNetwork` | `detach_network` | Present (network.rs:128); script's "missing" flag is wrong. |
| `disposeNetwork` | `dispose_network` | Present (network.rs:141); `dispose_` verb preserved. Script's "missing" flag is wrong. |
| `createNetwork` | `create_network` | OK. |
| `createNetworkStatus` | `create_network_status` | OK. |
| `createWebNetworkBackend` | _(absent)_ | Documented divergence — browser-API-only function lives in `host-web`, not native-core (conformance.md:119, network is in the listed suite). Not silent drift. |
| `getNetworkBackend` | `get_network_backend` | OK — seam preserved. |
| `getNetworkStatus` | `get_network_status` | OK — `out` → `&mut NetworkStatus`, returns the borrow. |
| `isNetworkOnline` | `is_network_online` | OK — `is_` boolean prefix preserved. |
| `setNetworkBackend(backend \| null)` | `set_network_backend(Option<…>)` | OK — `null` → `Option`. |
| `NetworkStatus.type` (types/Network.ts) | `NetworkStatus.connection_type` (types/platform.rs:619) | Field renamed. Justified — `type` is a Rust keyword — but **not in the divergence map**. The TS docs require any TS↔Rust difference to be a recorded entry; add a one-line note (`NetworkStatus.type` → `connection_type`, reason: Rust reserved word). |

## In sync

- Package→crate name identity, file basenames (`network.rs`, `lib.rs`/`index.ts` barrel), and the public function set (minus the documented host-web `createWebNetworkBackend`) all match.
- `NetworkStatus` shape, sentinels, and defaults match: `downlink: -1`, `effectiveType`/`effective_type: ''`/`String::new()`, `online: false`, `type`/`connection_type: 'unknown'`/`Unknown`.
- `NetworkBackend` trait mirrors the TS interface (`get_status` out-param + return, `subscribe` → unsubscribe closure).
- Convention carry-over is clean: out-param (`getStatus` → `&mut`), sentinel (`null` → `Option`), teardown verbs (`detach`/`dispose`), and `is_`/`get_`/`create_`/`set_` prefixes all preserved.
- `Network` entity holds the same three signals (`on_change`, `on_online`, `on_offline`).

## Divergence-map suggestions

1. Add `NetworkStatus.type` → `connection_type` (reason: `type` is a Rust keyword). Currently silent drift.
2. If the `attach_network` stub closure is intended to remain inert until `host-web`/native backends wire real status reads, record that as an explicit entry; otherwise treat it as a bug to fix, since the TS function delivers live status on change.
3. (Map hygiene, not network-specific) The conformance script lists `attachNetwork`/`detachNetwork`/`disposeNetwork` as missing although they exist in the crate — the per-crate counter looks stale or mis-scanning; worth verifying the script's export detection.
