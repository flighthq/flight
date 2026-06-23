# TS↔Rust Alignment: @flighthq/scene

**Verdict:** Severely out of sync — only the Cargo crate name was renamed `world → scene`; the entire Rust API surface is still the old `World*` package and matches **0 of 11** TS exports, while the divergence map falsely claims the rename is fully applied.

The TS `@flighthq/scene` package has been built into a 3D scene-graph family with three concepts — `Scene` (root), `SceneNode` (transform group), and `Mesh` (drawable leaf) — exporting 11 functions across `scene.ts`, `sceneNode.ts`, and `mesh.ts`. The Rust crate `flighthq-scene` is a verbatim carryover of the pre-rename `world` crate: `WorldNode`, `world_node.rs`, `world_runtime.rs`, `create_world_node`, etc. The rename was applied only to `Cargo.toml`'s `name` field. Even the upstream `flighthq-types` kind is still `world_node_kind()` rather than `scene_node_kind()` / `mesh_kind()` (`SceneNodeKind = 'SceneNode'`, `MeshKind = 'Mesh'` in TS). `npm run rust:conformance` reports `scene | 11 | 0 | 14 | 11 ⚠️` (11 TS exports, 0 matched, 14 Rust fns, 11 missing).

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createScene` (`scene.ts`) | — | Missing port. No Rust `create_scene`; the `Scene` root concept is absent. |
| `createSceneNode` (`sceneNode.ts`) | `create_world_node` (`world_node.rs`) | Renamed without reason — Rust still uses the dropped `World` type word. Should be `create_scene_node`. |
| `createSceneNodeRuntime` (`sceneNode.ts`) | `create_world_node_runtime` (`world_runtime.rs`) | Renamed without reason — should be `create_scene_node_runtime`. |
| `enableSceneNodeSignals` (`sceneNode.ts`) | `enable_world_node_signals` (`world_node.rs`) | Renamed without reason — should be `enable_scene_node_signals`. |
| `getSceneNodeRuntime` (`sceneNode.ts`) | `get_world_node_runtime` (`world_runtime.rs`) | Renamed without reason — should be `get_scene_node_runtime`. |
| `getSceneNodeSignals` (`sceneNode.ts`) | `get_world_node_signals` (`world_node.rs`) | Renamed without reason — should be `get_scene_node_signals`. |
| `createMesh` (`mesh.ts`) | — | Missing port. No Mesh concept in Rust (the 3D drawable leaf, `MeshKind`). |
| `enableMeshSignals` (`mesh.ts`) | — | Missing port. |
| `getMeshRuntime` (`mesh.ts`) | — | Missing port. |
| `getMeshSignals` (`mesh.ts`) | — | Missing port. |
| `isMesh` (`mesh.ts`) | — | Missing port. The `geometry != null` leaf discriminator the render pass relies on. |
| `SceneNodeKind` (re-export of `@flighthq/types`) | `world_node_kind()` (`flighthq-types::misc.rs`) | Kind identity diverges. TS `'SceneNode'`; Rust upstream still `world_node_kind`. No `scene_node_kind`. |
| `MeshKind` (`@flighthq/types`, `'Mesh'`) | — | Missing kind in `flighthq-types`. |
| `scene.ts` | — | No `scene.rs`. |
| `sceneNode.ts` | `world_node.rs` | File basename does not track its TS counterpart; should be `scene_node.rs`. |
| `mesh.ts` | — | No `mesh.rs`. |
| (no TS equivalent) | `get_world_node_world_matrix` (`world_node.rs`) | Extra Rust function with no TS export. TS holds the world matrix as a runtime cache slot (`SceneNodeRuntime.worldMatrix`); the explicit accessor is a Rust-only addition not recorded anywhere. |
| (no TS equivalent) | `get_world_node_kind` (`world_node.rs`) | Extra — counterpart of the absent `scene_node_kind` accessor; TS re-exports the constant rather than a getter. |

## In sync

Nothing is in sync at the API-name level. The only correct piece of the rename is the Cargo package `name = "flighthq-scene"` and `description` matching TS (`"3D scene graph and spatial node hierarchy"`). Conventions that _would_ carry correctly if renamed are present in spirit: `Option` for the nullable `world_matrix`/`signals` slots (matching TS `null`), `&mut Arena` out-style mutation, idempotent `enable_*_signals`, and the entity/runtime split (`WorldNodeRuntime`/`WorldNodeEntity` mirroring `SceneNodeRuntime`) — these are structurally faithful to the old `world` package, just under the wrong names.

## Divergence-map notes

- **Stale claim to fix.** `tools/agents/docs/rust/conformance.md` line 33 states all renames "have been **applied in Rust** — every mapped package is now identity; the table is the audit trail, not pending work." This is false for the `world → scene` row (line 37): only the crate name moved; the internal API, types, files, and the `flighthq-types` kind are all still `World*`. Either downgrade this row to pending work or carve out an explicit exception.
- **3D pipeline drag is unported.** The `world → scene` row notes the rename "drags in the 3D pipeline (`mesh`, `lighting`, ...)". The `mesh` concept that now lives _inside_ `@flighthq/scene` (`createMesh`/`isMesh`/`MeshKind`) has no Rust presence here.
- **Undocumented Rust-only function.** `get_world_node_world_matrix` has no TS counterpart and is not in the divergence map. When porting, either drop it (TS exposes the world matrix as a runtime slot, not a function) or record it as an intentional Rust-only accessor with rationale.
