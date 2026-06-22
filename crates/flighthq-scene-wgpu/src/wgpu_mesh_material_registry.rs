//! scene-wgpu's per-state 3D mesh-material renderer registry — the WGSL mirror of
//! scene-gl's mesh-material registry, distinct from the 2D
//! `material_renderer_map` in `flighthq-render-wgpu`.
//!
//! A material kind is either 2D or 3D, never both: `drawWgpuScene` only draws
//! subsets whose material kind (or `DefaultMaterialKind`) has a renderer here.
//!
//! TODO(align): blocked on the `WgpuMeshMaterialRenderer` trait (the 3D
//! mesh-material seam) and the scene-wgpu per-state runtime registry slot, neither
//! of which the upstream Rust `flighthq-types` / `flighthq-render-wgpu` header
//! exposes yet. These are compiling stubs preserving the
//! get/register/resolve seam.

use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::kind::KindId;

/// A 3D mesh-material renderer: `bind` uploads the shared camera + light +
/// material state for a contiguous run of subsets, `draw` issues each subset's
/// indexed draw. The WGSL mirror of scene-gl's `GlMeshMaterialRenderer`.
///
/// TODO(align): this trait belongs in `flighthq-types` (cross-package header),
/// alongside `StandardPbrMaterial`, `SceneLightBlock`, `Camera`, and
/// `SceneRenderProxy`. It is defined locally here only so the registry seam
/// compiles; promote it when the 3D header lands.
pub trait WgpuMeshMaterialRenderer: Send + Sync {}

/// Returns the 3D mesh-material renderer registered for a kind on this state, or
/// `None`. The 3D scene analog of `get_wgpu_material_renderer`.
///
/// TODO(align): blocked on the scene-wgpu per-state registry slot.
pub fn get_wgpu_mesh_material_renderer(
    _state: &WgpuRenderState,
    _kind: KindId,
) -> Option<&dyn WgpuMeshMaterialRenderer> {
    todo!(
        "TODO(align): port getWgpuMeshMaterialRenderer — blocked on scene-wgpu \
         registry slot + WgpuMeshMaterialRenderer header in flighthq-types"
    )
}

/// Registers a 3D mesh-material renderer against a material kind on this state.
/// Opt-in: `drawWgpuScene` only draws subsets whose material kind (or
/// `DefaultMaterialKind`) has a renderer here.
///
/// TODO(align): blocked on the scene-wgpu per-state registry slot.
pub fn register_wgpu_mesh_material_renderer(
    _state: &mut WgpuRenderState,
    _kind: KindId,
    _renderer: Box<dyn WgpuMeshMaterialRenderer>,
) {
    todo!(
        "TODO(align): port registerWgpuMeshMaterialRenderer — blocked on scene-wgpu \
         registry slot in flighthq-types"
    )
}

/// Resolves a mesh subset's material to its registered 3D renderer: by the
/// material's kind, else the renderer registered for `DefaultMaterialKind`, else
/// `None`. `drawWgpuScene` skips a subset whose material resolves to `None` — no
/// built-in fallback.
///
/// TODO(align): blocked on the scene-wgpu per-state registry slot and the
/// `Material` header used to read a material's kind.
pub fn resolve_wgpu_mesh_material_renderer(
    _state: &WgpuRenderState,
    _material_kind: Option<KindId>,
) -> Option<&dyn WgpuMeshMaterialRenderer> {
    todo!(
        "TODO(align): port resolveWgpuMeshMaterialRenderer — blocked on scene-wgpu \
         registry slot in flighthq-types"
    )
}
