# flight-loader

Portable loading wrappers and resource scheduler for the delivered Flight TypeScript snapshot `a62784923f3be814463286c9fb28edfe6ab15789`.

`load_bytes` and `load_text` delegate GET requests to the canonical host network capability. They preserve abort and progress signal identities and return `None` for caught failures, unsuccessful responses, or incompatible body domains. The byte result maps the source `Uint8Array` to a canonical `ArrayBufferView` with Uint8Array kind, zero offset, full buffer length, and the original shared buffer allocation. It never copies the bytes into a vector. Progress forwards the original URL through the caller's current progress signal.

`ResourceLoader` owns its queue, ordered in-flight set, reports, deduplication table, and reusable entries. Its retained `ResourceLoaderContext` contains the canonical `HostSpawnCapability` and `HostTimerCapability`. The host supplies the executor, clock, and queued timers; this crate starts no executor, operating-system timer, or transport. Entry reuse is local to each loader under D5 rather than a hidden module-global pool.

The scheduler preserves stable priorities, shared handles and promises, concurrency, streaming, pause/resume, cancellation, reset generations, byte accounting, weighted progress, fail-fast skipping, retries, timeouts, and token-bucket dispatch. Callbacks run without loader locks. Abort and timeout race the original factory without cancelling its future: the host continues driving the losing factory. Rejections, successful opaque values, abort reasons, report arrays, individual reports, and provider references retain their actual identities without JSON conversion.

Queue factories return generic `ResourceLoadResult<T>` values. `T` must be cloneable, sendable, and shareable; object results should use canonical `Ref` or `Arc` identities. Reusing one deduplication key with an incompatible native `T` raises the approved programmer TypeError. Source cancellation branches that leave handles pending, reset orphaning, callback reentry, live abort-set iteration, and hints larger than token capacity remain literal source behavior. Reported totals do not rewrite the item's byte hint.

The curated root exposes the source public functions and types plus native method delegates. Initialization and eight exact closed-union string-table helpers are available through `contract` only. Sixteen inline tests compare every native constructor, initializer, and method with its free function. Deterministic host-driven tests cover all 91 source cases and additional identity, ordering, race, panic, and reentry boundaries. No source assertion is omitted.

## Constructor decision (D23)

`ResourceLoader` keeps its source optional options reference on `create_resource_loader` and
`initialize_resource_loader`: initialization derives a token bucket from a positive byte rate, with
initial tokens equal to its capacity and the initial refill instant read from the injected clock.
It also snapshots concurrency, error policy and streaming state, while retaining the same options
reference for live per-item defaults such as deduplication, retries and timeouts. This is derived
construction; assigning fields after creating a default loader cannot reproduce that state or its
clock read. The optional seed, source defaults, and required D5 executor/timer context remain unchanged.
The initializer preserves the preallocated Entity's identity and private runtime; it is a construction
seam, and the existing reset verb keeps its source semantics.

## Precision and lint inventory

Source scalar bytes, weights, priorities, retry counts, and concurrency use `f32`, preserving negative, fractional, NaN, and infinite behavior. Actual item counts use `usize`. Host clock instants and scheduling durations retain the approved `f64` milliseconds. Ten item-scoped precision markers cover four public records, two private state records, and four scheduling helpers.

Eight D9 string-table helpers declare conformance extras. Four functions declare explicit D5 network or scheduler context parameters. Three vocabulary markers cover the asynchronous unknown rejection result and the two generic queue signatures with their approved native bounds. These 25 markers introduce no conformance skips, numeric-array waivers, hidden-state exceptions, or baseline additions.
