use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_render_gl::GlRenderState;

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_standard_pbr_mesh_material_renderer::GL_STANDARD_PBR_MESH_MATERIAL_RENDERER;

// Registers the built-in StandardPbr forward-lit renderer for STANDARD_PBR_MATERIAL_KIND on this
// state. Convenience over register_gl_mesh_material_renderer(state, STANDARD_PBR_MATERIAL_KIND, …);
// call it once per GlRenderState before drawing so meshes carrying StandardPbrMaterials draw. Opt-in
// by design (no implicit side effect): the render path knows no built-in material until registered.
pub fn register_gl_standard_pbr_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        STANDARD_PBR_MATERIAL_KIND.to_string(),
        &GL_STANDARD_PBR_MESH_MATERIAL_RENDERER,
    );
}
