# Breadth Review: Cloud & Distributed Systems

_2026-07-13. Raw breadth analysis — the user's stated personal direction. What Flight needs to support cloud-based development and distributed/multiplayer applications authoritatively._

## Current Standing

The transport + state floor is built and deliberately minimal: `net`, `socket`, `snapshot`, `storage`, `assets`, `log`. The `session` name is RESERVED for a live-state container (auth must take `identity`). Snapshot's charter invites a separate wire format.

**The actual gap: no binary serialization, no time-sync, no delta/patch primitive exists anywhere.** The missing tier is **bytes/deltas/time**, not "multiplayer."

## Candidate Primitives

### Now (deepen existing)

- **Deepen `snapshot`** — the chartered `diffSnapshots` / `applySnapshotDelta` + determinism contract. This is the highest-leverage single change: delta compression makes snapshot viable for netcode, undo, and replay.
- **Deepen `assets`** — `contentHash`/version on descriptors, remote-manifest refresh. Required for cloud asset delivery.

### Soon (new cells)

- **`serialize`** — plain-data ↔ compact bytes with schema. Varint/float32 policy. Oracle: msgpack/FlatBuffers. Wasm-mixable value leaf. The one codec that `ipc`'s unbuilt `IpcSerializer`, socket binary framing, snapshot wire format, and replay streams all want.
- **`tool-assetpipeline`** — build-time producer: binpack + image-codec + texture-formats → hashed manifest. Same package runs local or cloud-CI.
- **`telemetry`** — event envelope, offline batch queue in `storage`, backoff flush over `net`, flush-on-lifecycle-hide. A `log` sink feeds it. Resolves log's flagged neighbor-fork.
- **`flags`** — typed remote-config seam, OpenFeature-shaped. Exposure events → telemetry. Soon/later boundary.

### Later (compose over the now/soon tier)

- **`replication`** — server-authoritative entity sync over snapshot-diff + serialize + socket. Blocked on the now/soon primitives.
- **`rollback`** — GGPO-style rollback netcode. Reserve. Demands a determinism audit.
- **`bindiff`** — bsdiff-class binary diff. Serves `updater` differential patching + asset patching.
- **`peer`** — WebRTC data channels. The only unreliable/unordered browser transport. TCP-semantics `socket` caps netcode without it.
- **`presence`** — reserve name only.
- **CRDT** — passes the subject test but fails timing. Heavy kernel is rust-intended. Blocked on scene-serialization design call. Reserve.
- **`identity`** — fails bedrock today (vendor territory). Reserve name.

### Fail Bedrock (reject as packages)

- Cloud-save-as-package (= composition over existing primitives)
- Matchmaking / lobby / leaderboards (vendor services, not SDK bedrock)
- Remote-preview / capture-farm packages (Vite upstream / `tool-capture` deepening)

## Stressed Packages

- **`snapshot`** — delta is load-bearing. Determinism of clone ordering + float lerp on the wire. Partial-slice capture.
- **`socket`** — deferred reconnect/heartbeat/backpressure now critical. Binary framing.
- **`net`** — range requests, retry/backoff, ETag.
- **`storage`** — async IndexedDB/OPFS backend becomes prerequisite.
- **`assets`** — versioned manifests, streaming priority.
- **`log`** — telemetry fork resolves via the `telemetry` candidate. Correlation-ID non-goal may need routed exception.
- **`clock`** — network time offset/RTT. Fold into `replication` or deepen clock.
- **`updater`** — bindiff, staged-rollout vocabulary overlaps with `flags`.
- **`ipc`** — its unbuilt `IpcSerializer` seam should BE `serialize`, not a second codec.
- **`lifecycle` / `connectivity` / `permissions` / `webcam` / `media`** — all gain cloud pressure.
- **`tool-capture`** — remote endpoints, sharded sweeps.

## Strategic Notes

- The missing tier is **bytes/deltas/time**, not "multiplayer": `serialize` + snapshot-delta + `bindiff` first; everything composes over exactly those three.
- The `*Backend` seam is Flight's native answer to vendor services: own the vocabulary + seam, vendor owns the server. OpenFeature is external proof of this pattern.
- Two open design calls block collaboration work: scene-serialization naming, and session/identity naming.
- Cloud dev mostly = run existing deterministic tools elsewhere. `tool-assetpipeline` is the one missing tool.
- **Determinism becomes a cross-cutting contract** — seeded RNG + reproducible floats. Worth explicit charter notes in `math`/`snapshot` before any netcode cell.
