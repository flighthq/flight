// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{EXTENDED_PBR_MATERIAL_KIND, ExtendedPbrMaterial, Material3D, PbrExtension};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_camera_position,
    set_gl_mesh_view_projection,
};
use crate::gl_pbr_extension_registry::{
    bind_gl_pbr_extensions, resolve_gl_pbr_extension_contributions,
};
use crate::gl_pbr_program_cache::ensure_gl_pbr_program;
use crate::gl_pbr_standard_block::{bind_gl_pbr_standard_block, build_gl_pbr_standard_define_key};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlMeshProgramRef;

// The one generic Extended PBR forward-lit renderer (EXTENDED_PBR_MATERIAL_KIND): composes every
// registered extension's GLSL contribution into the base PBR uber-shader in descriptor order, binds
// the standard block from `material.standard`, then binds each extension's uniforms and maps. A
// material whose extensions cannot all be realized skips its draw (the optional guard explains why).
pub static GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer =
    GlMeshMaterialRenderer {
        bind: bind_gl_extended_pbr_mesh_material,
        draw: draw_gl_extended_pbr_mesh_material,
    };

fn bind_gl_extended_pbr_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    let extended =
        material.and_then(|material| material.as_any().downcast_ref::<ExtendedPbrMaterial>());
    let extensions: &[Ref<PbrExtension>] = extended.map_or(&[], |extended| &extended.extensions);
    let Some(contributions) = resolve_gl_pbr_extension_contributions(state, extensions) else {
        let guard = get_gl_scene3d_runtime(state).pbr_extension_guard;
        if let Some(guard) = guard {
            guard(state, extensions);
        }
        get_gl_scene3d_runtime(state).active_mesh_program = None;
        return;
    };
    let standard = extended.map(|extended| &extended.standard);
    let surface = extended.map(|extended| extended as &dyn Material3D);
    let key = build_gl_pbr_standard_define_key(state, standard, surface);
    let program = ensure_gl_pbr_program(state, &key, Some(&contributions));
    let mesh_program: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &mesh_program,
        extended.is_some_and(|extended| extended.material3d_fields().double_sided),
    );
    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program.lit, lights);
    bind_gl_pbr_standard_block(state, &program, standard);
    let alpha_cutoff = extended.map_or(0.5, |extended| extended.material3d_fields().alpha_cutoff);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state
            .gl
            .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff)
    };
    bind_gl_pbr_extensions(state, program.program, extensions);
}

fn draw_gl_extended_pbr_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Installs the Extended PBR renderer for EXTENDED_PBR_MATERIAL_KIND on this state.
pub fn register_gl_extended_pbr_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        EXTENDED_PBR_MATERIAL_KIND.to_string(),
        &GL_EXTENDED_PBR_MESH_MATERIAL_RENDERER,
    );
}
