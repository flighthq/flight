//! Registers the built-in StandardPbr forward-lit renderer for
//! `StandardPbrMaterialKind` on this state. Convenience over
//! `register_wgpu_mesh_material_renderer(state, StandardPbrMaterialKind, …)`; call
//! it once per `WgpuRenderState` before `draw_wgpu_scene` so meshes carrying
//! StandardPbr materials draw. Opt-in by design (no top-level side effect): the
//! render path knows no built-in material until registered.
//!
//! TODO(align): blocked on `StandardPbrMaterialKind` (the 3D material header) and
//! the scene-wgpu registry slot. Compiling stub preserving the registration seam.

use flighthq_render_wgpu::WgpuRenderState;

/// Registers the built-in StandardPbr forward-lit renderer for
/// `StandardPbrMaterialKind` on this state.
///
/// TODO(align): port `registerStandardPbrWgpuMaterial` — call
/// `register_wgpu_mesh_material_renderer(state, StandardPbrMaterialKind,
/// Box::new(standard_pbr_wgpu_mesh_material_renderer()))` once the
/// `StandardPbrMaterialKind` header and registry slot land.
pub fn register_standard_pbr_wgpu_material(_state: &mut WgpuRenderState) {
    todo!(
        "TODO(align): port registerStandardPbrWgpuMaterial — blocked on \
         StandardPbrMaterialKind header + scene-wgpu registry slot"
    )
}
