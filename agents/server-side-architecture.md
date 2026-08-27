# Server-Side Architecture

_2026-08-27. Proposal — the layered package plan that completes Flight's server story. Builds on [cloud & distributed breadth](breadth-cloud-distributed.md) and the [breadth synthesis](breadth-synthesis.md) candidate queue; this document adds the dependency-chain framing, the server-side rendering tier, and the authority primitive._

## Why the server path is short

Flight's core is accidentally server-ready. Side-effect-free functions over plain data, no DOM coupling, swappable `*Backend` seams, deterministic simulation — `stepPhysics3D` does not know it is in a browser. The `host-*` pattern (`host-web`, `host-electron`, `host-tauri`, `host-capacitor`) already abstracts platform capabilities; a Node host is the same shape, not a new architecture.

The packages that are already server-capable with no changes: `snapshot` (capture/restore/interpolate/equals — explicitly designed for netcode), `net` and `socket` (transport over swappable backends), `loader` and `assets` (resource management, transport-agnostic), `bitmap` (pixel manipulation on raw `Uint8ClampedArray`), `collision` / `physics2d` / `physics3d` / `spatial` (pure computation), all `*-formats` importers (parsing, no DOM), `binpack` (atlas packing). `tool-capture` and `tool-registry` are already outside the SDK barrel.

## Layered package plan

Each layer enables the ones below it. A layer is usable as soon as its own packages exist; nothing requires the full stack.

### Layer 1 — Make what exists work on the server

**`host-node`** — Node.js host backend, same `enableHostNode()` / per-capability `enableHostNode*()` umbrella as `host-web`. Installs Node-native implementations for the platform capabilities: `net` gets `node:fetch` (or built-in `fetch` on Node 18+), `socket` gets `ws` or `node:net`, `filesystem` gets `node:fs`, `storage` gets fs-backed or SQLite. Follows the existing precedence model: custom (`set*Backend`) > host (`enableHostNode*`) > sentinel.

Already reserved in the [breadth synthesis](breadth-synthesis.md) "Soon" table. The charter condition — "not created until first genuine backend" — is met by the asset pipeline and authority use cases below.

After `host-node`, `loader`, `assets`, `net`, `socket`, `snapshot`, and `bitmap` run server-side with zero source changes.

### Layer 2 — Asset pipeline (build tooling)

**`tool-pipeline`** — Build-time asset pipeline orchestrator. Chains existing importers (`scene2d-formats`, `scene3d-formats`, `spritesheet-formats`, `textureatlas-formats`) with `binpack`, texture compression (`texture-formats`), and `image-codec` to emit optimized runtime bundles with content-hashed manifests. Outside the SDK barrel alongside `tool-capture` / `tool-registry`. Named `tool-assetpipeline` in the [cloud breadth](breadth-cloud-distributed.md); `tool-pipeline` is shorter and follows the `tool-*` prefix.

Input: authored assets (SWF, glTF, SVG, images, spritesheets). Output: hashed runtime bundles consumable by `assets` with `contentHash`/version descriptors. Same package runs local CLI or cloud CI.

This is the first package that is _only_ a server/CI concern — it never runs in a browser.

### Layer 3 — Scene persistence

**`serialize`** — Plain-data to compact bytes with schema. Varint/float32 policy. The one codec that `ipc`'s unbuilt `IpcSerializer`, socket binary framing, `snapshot` wire format, and replay streams all want. Already identified in [cloud breadth](breadth-cloud-distributed.md) as the highest-leverage "Soon" candidate and the keystone of the bytes/deltas/time tier.

Scene graph round-trip is a composition of `serialize` + the scene graph's plain-data entity model. A scene has hierarchy, node kinds, and resource references — `serialize` provides the codec, and the scene packages know their own schema. No separate `scene-serialize` package is needed if `serialize` is schema-aware enough; the scene-save design call ([breadth synthesis §Open Design Calls](breadth-synthesis.md)) resolves this.

### Layer 4 — Multiplayer

**`sync`** — Network state synchronization. Built on `snapshot` (delta via the chartered `diffSnapshots` / `applySnapshotDelta`) + `serialize` (wire encoding) + `socket` (transport). Delta compression, reliable/unreliable channel selection, client prediction, server reconciliation. Named `replication` in the [cloud breadth](breadth-cloud-distributed.md); `sync` is shorter, and `replication` carries database connotations. Blocked on `serialize` + snapshot-delta (the "bytes/deltas/time" tier).

**`authority`** — Headless simulation loop for server-authoritative game state. Takes client inputs, runs `stepPhysics2D` / `stepPhysics3D` + `collision` + game logic as canonical truth, broadcasts authoritative state via `sync`. A fixed-rate tick loop with no `requestAnimationFrame` dependency. Small package — most of the work is already in `physics*` / `collision` / `spatial`; this is the orchestration and input-ingestion layer.

Not previously identified as a separate candidate. The [cloud breadth](breadth-cloud-distributed.md) folds it into `replication`, but the headless tick loop is a distinct primitive from the state-sync protocol: one runs the simulation, the other distributes it. A game server that runs physics locally but syncs state via a third-party service (or raw websockets without Flight's sync) uses `authority` without `sync`.

### Layer 5 — Server-side rendering

**`render-cpu`** — Software rasterizer, no GPU. Produces bitmaps from scene graphs for thumbnails, social sharing cards, open-graph previews, email images, PDF export. The only architecturally novel package in this plan — all others compose existing primitives.

Not previously identified in the breadth reviews. The pragmatic early path may be a thin `tool-render` wrapper over `tool-capture`'s headless Playwright approach (which already works). A genuine CPU rasterizer is a larger effort and would follow the `render-gl` / `render-wgpu` registration pattern.

Two sub-options:
- **`tool-render`** (near-term) — headless browser orchestration for server-side image generation. Outside SDK barrel. Depends on `tool-capture` infrastructure.
- **`render-cpu`** (long-term) — pure software renderer, no browser dependency. Inside SDK barrel. C/C++ portable. Substantial effort.

## Dependency chain

```
Layer 1: host-node
    ↓ enables
Layer 2: tool-pipeline (build tooling, uses host-node for fs/net)
    ↓ produces assets for
Layer 3: serialize (wire format, consumed by everything above)
    ↓ enables
Layer 4: sync + authority (multiplayer, uses serialize + snapshot + socket)
    ↓ produces scenes for
Layer 5: render-cpu / tool-render (server-side image generation)
```

Layers are independently useful. A project that only needs build tooling stops at layer 2. A multiplayer game that generates no server-side images stops at layer 4.

## What already exists vs what is new

| Package | Status | Breadth reference |
|---------|--------|-------------------|
| `host-node` | Charter reserved, not created | [synthesis](breadth-synthesis.md) "Soon" |
| `tool-pipeline` | New | [cloud](breadth-cloud-distributed.md) as `tool-assetpipeline` |
| `serialize` | New | [cloud](breadth-cloud-distributed.md) "Soon" |
| `sync` | New | [cloud](breadth-cloud-distributed.md) as `replication` "Later" |
| `authority` | New — not previously identified | — |
| `render-cpu` | New — not previously identified | — |
| `tool-render` | New — not previously identified | — |

## Enabling conditions

The [breadth synthesis](breadth-synthesis.md) identifies depth gates that outrank new packages. Several apply directly here:

- **`snapshot` delta** — gates `sync`. The chartered `diffSnapshots` / `applySnapshotDelta` must land before sync is viable.
- **`socket` reconnect layer** — gates multiplayer. Deferred reconnect/heartbeat/backpressure.
- **`bitmap` DOM-leak files** — gates headless `bitmap` usage (2 files with DOM dependency).
- **Determinism contract** — gates `authority`. Seeded RNG + reproducible floats must be documented as a cross-cutting invariant.

## Design calls carried forward

1. **Versioned serialization** — the one design that serves scene-save, app saves, replay, CRDT, serialize shape, and ipc's IpcSerializer. ([breadth synthesis §Open Design Calls](breadth-synthesis.md))
2. **`sync` vs `replication` naming** — this document uses `sync`; the cloud breadth uses `replication`. Resolve before charter.
3. **`authority` scope** — is the headless tick loop a package or a pattern documented in `application`? A package earns its existence if the orchestration (input queuing, fixed-rate stepping, state broadcast) is non-trivial enough to reuse.
4. **`render-cpu` vs `tool-render`** — pragmatic headless-browser wrapper first, or invest in a pure software rasterizer? The answer depends on whether server-side rendering is a build/CI concern (tool-tier) or a runtime concern (SDK-tier).
