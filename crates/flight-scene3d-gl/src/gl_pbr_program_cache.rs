use std::cell::Cell;
use std::rc::Rc;

use flight_render_gl::{
    GlColorAdjustmentMaterialFeature, GlPbrExtensionShaderContribution, GlRenderState,
    get_gl_color_adjustment_material_feature,
};
use glow::HasContext;

use crate::gl_lit_program::resolve_gl_lit_locations;
use crate::gl_mesh_program::{compile_gl_program, ensure_gl_scene3d_program};
use crate::gl_pbr_prelude::{
    build_gl_pbr_define_key, get_gl_pbr_fragment_source_for_key, get_gl_pbr_vertex_source_for_key,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlPbrDefineKey, GlPbrProgram};

// Compiles the StandardPbr uber-shader for a define key, links it, and resolves its uniform
// locations. Pure GL work — no caching — used by ensure_gl_pbr_program. Panics (TS throws) on a
// compile/link failure, which is a programmer error (a malformed prelude), not an expected runtime
// condition. `skin_declarations_glsl` is the HAS_SKIN vertex declarations supplied by the registered
// skinning capability; None/empty when skinning is not registered, which is also when has_skin is off.
pub fn compile_gl_pbr_program(
    gl: &glow::Context,
    key: &GlPbrDefineKey,
    contributions: Option<&[GlPbrExtensionShaderContribution]>,
    color_adjustment_feature: Option<&GlColorAdjustmentMaterialFeature>,
    skin_declarations_glsl: Option<&str>,
) -> GlPbrProgram {
    let vertex_source = get_gl_pbr_vertex_source_for_key(key, skin_declarations_glsl);
    let fragment_source =
        get_gl_pbr_fragment_source_for_key(key, contributions, color_adjustment_feature);
    let program = compile_gl_program(gl, &vertex_source, &fragment_source);
    let mut lit = resolve_gl_lit_locations(gl, program);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        lit.mesh.loc_joint_normal_texture = Cell::new(Some(
            gl.get_uniform_location(program, "u_jointNormalTexture"),
        ));
        lit.mesh.loc_joint_texture =
            Cell::new(Some(gl.get_uniform_location(program, "u_jointTexture")));
        lit.mesh.loc_model = gl.get_uniform_location(program, "u_model");
        lit.mesh.loc_normal_matrix = gl.get_uniform_location(program, "u_normalMatrix");
        lit.mesh.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
        return GlPbrProgram {
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_alpha_map: gl.get_uniform_location(program, "u_alphaMap"),
            loc_base_color: gl.get_uniform_location(program, "u_baseColor"),
            loc_base_color_map: gl.get_uniform_location(program, "u_baseColorMap"),
            loc_emissive: gl.get_uniform_location(program, "u_emissive"),
            loc_emissive_map: gl.get_uniform_location(program, "u_emissiveMap"),
            loc_emissive_strength: gl.get_uniform_location(program, "u_emissiveStrength"),
            loc_metallic: gl.get_uniform_location(program, "u_metallic"),
            loc_metallic_roughness_map: gl.get_uniform_location(program, "u_metallicRoughnessMap"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            loc_occlusion_map: gl.get_uniform_location(program, "u_occlusionMap"),
            loc_occlusion_strength: gl.get_uniform_location(program, "u_occlusionStrength"),
            loc_roughness: gl.get_uniform_location(program, "u_roughness"),
            lit,
        };
    }
}

// Resolves the StandardPbr program for a define key, compiling and caching it on first use through
// the shared scene program cache under the `pbr:` family namespace, so each variant is compiled at
// most once per state and reused every frame.
pub fn ensure_gl_pbr_program(
    state: &GlRenderState,
    key: &GlPbrDefineKey,
    contributions: Option<&[GlPbrExtensionShaderContribution]>,
) -> Rc<GlPbrProgram> {
    // Fold the render-state skinned-run flag into the variant so a skinned draw of an otherwise-identical
    // material compiles + caches its own HAS_SKIN program, without the material renderer knowing.
    let (full_key, skin_declarations_glsl) = {
        let runtime = get_gl_scene3d_runtime(state);
        let full_key = GlPbrDefineKey {
            has_color_adjustment: Some(runtime.active_color_adjustment_run),
            has_color_matrix: Some(runtime.active_color_matrix_run),
            has_instances: Some(runtime.active_instanced_run),
            has_skin: Some(runtime.active_skinned_run),
            ..key.clone()
        };
        // TS passes no skin declarations here (every sibling family passes the registered feature's),
        // which leaves skinMatrix() undeclared in the HAS_SKIN variant; supply them like the siblings.
        let skin = runtime
            .mesh_skin_feature
            .map(|feature| feature.vertex_declarations_glsl)
            .unwrap_or("");
        (full_key, skin)
    };
    let contributions = contributions.unwrap_or(&[]);
    let extension_key = contributions
        .iter()
        .map(|contribution| contribution.key.as_str())
        .collect::<Vec<&str>>()
        .join(",");
    let registry_revision = state.gl_runtime.borrow().pbr_extension_revision;
    return ensure_gl_scene3d_program(
        state,
        &format!(
            "pbr:{}:{registry_revision}:{extension_key}",
            build_gl_pbr_define_key(&full_key)
        ),
        |gl| {
            return compile_gl_pbr_program(
                gl,
                &full_key,
                Some(contributions),
                get_gl_color_adjustment_material_feature(state),
                Some(skin_declarations_glsl),
            );
        },
    );
}
