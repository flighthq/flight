# Breadth Review Synthesis

_2026-07-13. Cross-report convergences from the four breadth analyses: [adjacent content](breadth-adjacent-content.md), [platform variance](breadth-platform-variance.md), [cloud/distributed](breadth-cloud-distributed.md), and [domain deepening](breadth-domain-deepening.md)._

## Convergences

### 1. Determinism as a cross-cutting contract

Both cloud/distributed (netcode, capture-farms, CRDT) and domain-deepening (replay, rollback, physics) independently demand seeded-RNG + reproducible-float charter notes in `math`, `snapshot`, `application`, and `clock`. This is not a package — it is a documented invariant.

### 2. One versioned-serialization design call

A single design decision unblocks: scene-save naming (register), app save files, replay streams, CRDT timing, `serialize` shape, and `ipc`'s `IpcSerializer`. Three "missing features" from different breadth angles are all blocked on the same call.

### 3. Fork I generalizes from visuals to content

The visual-authoring-artifact arc (svg/lottie/rive → `-formats`) extends naturally to content artifacts: `dialogue-formats` (Yarn/Ink/Twine) and `localization-formats` (PO/XLIFF/FTL/ARB). The constraint/anchor layer remains the open half of fork I.

### 4. Two genuinely missing platform primitives

Every breadth angle agrees: `focus` (spatial dpad/LRUD navigation) and `worker` (typed transferable channel) are the only two genuinely missing platform primitives. Everything else environmental is host adapters or deepening.

### 5. Small pure-math cells buy new authority cheaply

`color`, `scale`, `serialize`, `pathfinding`, `steering` — all value leaves, C-portable, wasm-mixable. Each is a small cell that opens a new domain without coupling.

### 6. Depth gates outrank new packages

Several deepening items should be prioritized ahead of new package creation:

- gl/wgpu blend modes (gate motion graphics)
- Per-instance tint everywhere (gate data-viz scatter)
- `surface`'s 2 DOM-leak files (gate headless)
- `snapshot` delta (gate cloud + undo + replay)
- `storage` async backend (gate cloud)
- `socket` reconnect layer (gate multiplayer)
- `collision` phases 2-3 (gate physics2d)
- `math` noise tier (highest-leverage single deepening item)

### 7. Recorded rejections wanted

Four proposals should be formally rejected to prevent re-proposal:

- **ECS** → anti-goals.md entry (entity/runtime model is the deliberate alternative)
- **inventory/economy** → register rejection (app-domain, not SDK bedrock)
- **cloud-save-as-package** → register rejection (= composition)
- **matchmaking/leaderboards** → register rejection (vendor services)

## Prioritized Candidate Queue (cross-report consensus)

### Now (unlocks most value)

| Candidate | Source Reports | Notes |
|-----------|---------------|-------|
| `color` | adjacent, deepening | Spaces, ramps, schemes. Pure value-leaf |
| `scale` | adjacent | d3-scale tier. Naming discussion needed |
| `focus` | platform, deepening | Spatial nav. TV/console/gamepad/a11y converge |
| `physics2d` | deepening | Largest single gap. Prereq: collision phases 2-3 |

### Soon

| Candidate | Source Reports | Notes |
|-----------|---------------|-------|
| `serialize` | cloud | Bytes/schema codec. Unblocks ipc, socket, snapshot wire |
| `host-node` | platform | Timer/fs/log for headless. Unlocks server chain |
| `telemetry` | cloud | Event envelope + offline batch. Resolves log's fork |
| `flags` | cloud | Remote config seam. OpenFeature-shaped |
| `video-codec` | adjacent | WebCodecs mux/demux. Encode = differentiator |
| `history` | adjacent | Command-stack undo. Discuss vs snapshot |
| `pathfinding` | deepening | A*/JPS/flow fields. path ≠ pathfinding line |
| `steering` | deepening | Reynolds forces. Distinct from motionpath/spring |
| `behaviortree` | deepening | Plain-data BTs, open registry, explicit tick |
| `statechart` | deepening | Hierarchical FSM. Also Rive SM substrate |
| `localization` + `-formats` | deepening | String catalogs + PO/XLIFF/FTL/ARB |
| `tool-assetpipeline` | cloud | Build-time asset producer |
| `worker` | platform | Typed transferable channel |

### Later

| Candidate | Source Reports | Notes |
|-----------|---------------|-------|
| `replication` | cloud | Server-auth sync. Blocked on serialize + snapshot-delta |
| `rollback` | cloud | GGPO-style. Reserve until determinism is proven |
| `bindiff` | cloud | Binary diff. Serves updater + asset patching |
| `peer` | cloud | WebRTC data channels |
| `dialogue` + `-formats` | deepening | Yarn/Ink/Twine. Fork I for content |
| `navmesh` | deepening | Bake rust-intended, query TS |
| `snapping` | adjacent | Align/distribute/magnetism |
| `xr` | platform | Gated on 3D maturity |
| `geo` / `geo-formats` / `maptile` | adjacent | After scope ruling |
| `audio-formats` | adjacent | Triad-predicted. Rust-intended decode |

### Reserve

`physics` (3D), `replay`, WFC, `midi`, `chart`, `schedule`, `presence`, `identity`, CRDT, `host-tizen`/`host-webos`, `serviceworker`/`host-pwa`.

## Open Design Calls

1. **Versioned serialization** — one design that serves scene-save naming, app saves, replay, CRDT, serialize shape, and ipc's IpcSerializer.
2. **`scale` naming** — collides with transform-scale vocabulary.
3. **Geo scope** — fork-G-style ruling before any geo work.
4. **`history` vs `snapshot` boundary** — command-stack undo vs memento undo.
5. **Determinism contract** — document as a cross-cutting invariant in math/snapshot/application/clock charters.
