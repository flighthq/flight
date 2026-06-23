//! WebGPU 3D scene draw walk — the WGSL mirror of scene-gl's `draw_gl_scene`.
//!
//! The app runs `prepare_scene_render(state, scene, camera, lights)` first
//! (resolving world matrices, the camera view-projection, frustum culling, and the
//! packed light block into the per-state scene render list); `draw_wgpu_scene`
//! retrieves that same cached list and, for each visible mesh, draws each of its
//! geometry subsets with the subset's resolved material's registered mesh-material
//! renderer.
//!
//! Subsets sharing the same resolved renderer + material are drawn under a single
//! bind (the seam's "contiguous run" contract). A subset whose material resolves to
//! no renderer (and no `DefaultMaterialKind` fallback) is skipped. Depth/cull state
//! is owned by the material renderer's pipeline. Must run inside an open render
//! pass.
//!
//! TODO(align): blocked on the upstream Rust 3D scene PIPELINE — not on the header
//! contract, which the Header phase now provides
//! (`flighthq_types::scene_render::{SceneLights, SceneLightBlock, SceneRenderProxy}`
//! and `flighthq_types::camera::Camera` are all available and wired into the
//! `WgpuMeshMaterialRenderer` seam). What is still missing is `prepare_scene_render`
//! and the scene render list (`flighthq-render`), plus the `Mesh` / `create_scene` /
//! `create_mesh` scene graph — `flighthq-scene` still exposes only `world_node`, so
//! there is no walkable scene and no prepared render list to retrieve. The per-mesh
//! bind/draw machinery this walk would call (`ensure_wgpu_mesh_upload`,
//! `resolve_wgpu_mesh_material_renderer`, and the renderer's `bind`/`draw`) is now
//! fully ported; only the list it iterates is absent. Compiling stub until the
//! scene graph + `prepare_scene_render` land (those belong in `flighthq-scene` /
//! `flighthq-render`, not addable here under the parallel-safety rule).

use flighthq_render_wgpu::WgpuRenderState;

use crate::wgpu_scene_runtime::WgpuSceneRuntime;

/// Draws a prepared 3D scene on the wgpu backend.
///
/// TODO(align): port the walk once `prepare_scene_render` + the scene graph land.
/// The TS body: retrieve the prepared list, walk each visible mesh, resolve each
/// subset's material to its 3D renderer, re-bind only on renderer/material change,
/// and issue the per-subset draw through a reused `SceneRenderProxy` — all of which
/// the now-ported registry/upload/renderer functions in this crate support.
pub fn draw_wgpu_scene(
    _state: &mut WgpuRenderState,
    _scene: &mut WgpuSceneRuntime,
    _scene_root_id: u64,
    _camera_id: u64,
) {
    todo!(
        "TODO(align): port draw_wgpu_scene — blocked on prepare_scene_render + the \
         scene graph (Mesh / create_scene) in flighthq-render / flighthq-scene; the \
         per-mesh bind/draw machinery in this crate is ported"
    )
}
