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
//! TODO(align): blocked on the upstream Rust 3D scene header — `prepare_scene_render`
//! and the scene render list (`flighthq-render`), the `Mesh`/`createScene`/`createMesh`
//! scene graph (`flighthq-scene` still exposes only `world_node`), the
//! `WgpuMeshMaterialRenderer` bind/draw trait, `Camera`, `SceneLights`, and
//! `SceneRenderProxy` (`flighthq-types`). Compiling stub preserving the seam.

use flighthq_render_wgpu::WgpuRenderState;

/// Draws a prepared 3D scene on the wgpu backend.
///
/// TODO(align): port `drawWgpuScene` once the scene render-list pipeline and the
/// 3D mesh-material seam land. The TS body: retrieve the prepared list, walk each
/// visible mesh, compute its world + normal matrix, resolve each subset's material
/// to its 3D renderer, re-bind only on renderer/material change, and issue the
/// per-subset draw through a reused `SceneRenderProxy`.
pub fn draw_wgpu_scene(_state: &mut WgpuRenderState, _scene_root_id: u64, _camera_id: u64) {
    todo!(
        "TODO(align): port drawWgpuScene — blocked on prepare_scene_render + scene \
         graph (Mesh/createScene) + WgpuMeshMaterialRenderer seam"
    )
}
