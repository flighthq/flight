# flight-updater

Updater capability seam: one explicit app-update check, install of a provider-pinned downloaded
handle, and destruction of the supplied updater command, all routed through a caller-supplied host
provider. No real check, download, install, network or native updater lives here.

## Ownership

The source pins each `DownloadedUpdate` to the provider that checked it in a module-level
`WeakMap`. Rust keeps the same semantics on the entity itself: the originating provider's shared
handle is attached to the downloaded entity's private runtime slot, so replacing the selected host
provider never redirects a handle and a consumed handle becomes unrecognized.

## Precision

No `f64` is used. `UpdateInfo.download_size_bytes` is an `i64` byte count (declared below 2^53 so
it is exact in TS numbers), never a lossy `f32`. A `None` metadata field means unknown; the SDK
never fabricates a sentinel or default.
