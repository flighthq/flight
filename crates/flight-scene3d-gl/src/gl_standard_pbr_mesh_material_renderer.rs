// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, StandardPbrMaterial, StandardPbrMaterialProperties};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;
use std::rc::Rc;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_camera_position,
    set_gl_mesh_view_projection,
};
use crate::gl_pbr_program_cache::ensure_gl_pbr_program;
use crate::gl_pbr_standard_block::{bind_gl_pbr_standard_block, build_gl_pbr_standard_define_key};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlMeshProgramRef;

// The built-in StandardPbr forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// STANDARD_PBR_MATERIAL_KIND). bind selects the uber-shader variant for the material's maps/alpha
// mode, uploads the shared per-run uniforms (camera view-projection + position, the packed light
// block), and the full standard PBR block (scalars/colors + base-color/normal/metallic-roughness/
// occlusion/emissive maps) via the shared bind_gl_pbr_standard_block helper — StandardPbr passes its
// own properties as the block. draw uploads the geometry's GPU buffers lazily (cached by
// geometry.version), sets the per-draw model + normal matrices from the proxy, and issues the indexed
// draw over the proxy's subset with depth-test LESS + depth-write on and back-face culling unless the
// material is double-sided. See register_gl_standard_pbr_material to install it.
pub static GL_STANDARD_PBR_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer =
    GlMeshMaterialRenderer {
        bind: bind_gl_standard_pbr_mesh_material,
        draw: draw_gl_standard_pbr_mesh_material,
    };

fn bind_gl_standard_pbr_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let pbr = material.and_then(|material| material.as_any().downcast_ref::<StandardPbrMaterial>());
    // TS passes the material itself (StandardPbrMaterial IS a StandardPbrMaterialProperties); Rust
    // has no structural typing, so the block is a view of the material's properties.
    let standard = pbr.map(get_standard_pbr_material_properties);
    let surface = pbr.map(|pbr| pbr as &dyn Material3D);
    let key = build_gl_pbr_standard_define_key(state, standard.as_ref(), surface);
    let program = ensure_gl_pbr_program(state, &key, None);
    let mesh_program: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &mesh_program,
        pbr.is_some_and(|pbr| pbr.material3d_fields().double_sided),
    );

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program.lit, lights);
    bind_gl_pbr_standard_block(state, &program, standard.as_ref());
    let alpha_cutoff = pbr.map_or(0.5, |pbr| pbr.material3d_fields().alpha_cutoff);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state
            .gl
            .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff)
    };
}

fn draw_gl_standard_pbr_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// The StandardPbrMaterialProperties view of a StandardPbrMaterial (its standard-block fields).
fn get_standard_pbr_material_properties(
    material: &StandardPbrMaterial,
) -> StandardPbrMaterialProperties {
    return StandardPbrMaterialProperties {
        alpha_map: material.alpha_map.clone(),
        base_color: material.base_color,
        base_color_map: material.base_color_map.clone(),
        emissive: material.emissive,
        emissive_map: material.emissive_map.clone(),
        emissive_strength: material.emissive_strength,
        metallic: material.metallic,
        metallic_roughness_map: material.metallic_roughness_map.clone(),
        normal_map: material.normal_map.clone(),
        normal_scale: material.normal_scale,
        occlusion_map: material.occlusion_map.clone(),
        occlusion_strength: material.occlusion_strength,
        roughness: material.roughness,
    };
}
