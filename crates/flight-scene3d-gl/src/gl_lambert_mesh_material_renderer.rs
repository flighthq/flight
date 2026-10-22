// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{LAMBERT_MATERIAL_KIND, LambertMaterial, Material3D, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use flight_texture::TextureVariant;
use glow::HasContext;

use crate::gl_classic_prelude::ensure_gl_classic_program;
use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, bind_gl_uv_transform, draw_gl_mesh_subset, has_gl_uv_transform,
    set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlClassicDefineKey, GlClassicLightingModel, GlClassicProgram, GlMeshProgramRef};

// The built-in classic Lambert forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// LambertMaterialKind). Diffuse-only Lambertian shading: bind selects the classic uber-shader's
// `lambert` variant for the material's diffuse map / alpha mode, uploads the camera view-projection
// and the packed light block, and the material's linear diffuse color. draw issues the indexed draw.
// Lambert has no view-dependent term, so it skips the camera position; the shared classic prelude
// compiles out the specular branch for the `lambert` model. See register_gl_lambert_material to install.
pub static GL_LAMBERT_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_lambert_mesh_material,
    draw: draw_gl_lambert_mesh_material,
};

// Registers the built-in Lambert renderer for LambertMaterialKind on this state. Opt-in (no top-level
// side effect); call once per GlRenderState before drawScene3D so meshes with LambertMaterials draw.
pub fn register_gl_lambert_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        LAMBERT_MATERIAL_KIND.to_string(),
        &GL_LAMBERT_MESH_MATERIAL_RENDERER,
    );
}

fn bind_gl_lambert_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    let lambert = material.and_then(|material| material.as_any().downcast_ref::<LambertMaterial>());
    let key = define_key_for_material(state, lambert);
    let program = ensure_gl_classic_program(state, &key);
    let active: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &active, lambert.is_some_and(|lambert| lambert.double_sided));

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    bind_gl_mesh_light_block(state, &program, lights);
    bind_gl_lambert_material_uniforms(state, &program, lambert);
}

fn bind_gl_lambert_material_uniforms(
    state: &mut GlRenderState,
    program: &GlClassicProgram,
    material: Option<&LambertMaterial>,
) {
    let Some(material) = material else {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            state.gl.uniform_4_f32(program.loc_diffuse.as_ref(), 1.0, 1.0, 1.0, 1.0);
            state.gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
        }
        return;
    };

    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, material.diffuse);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state.gl.uniform_4_f32(
            program.loc_diffuse.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
            scratch_rgba.a,
        );
        state.gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), material.alpha_cutoff);
    }

    let diffuse_map = material.diffuse_map.as_ref().map(|texture| texture.read().unwrap());
    if let Some(diffuse_map) = diffuse_map.as_deref() {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { state.gl.active_texture(glow::TEXTURE0) };
        if resolve_gl_texture(state, diffuse_map, None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { state.gl.uniform_1_i32(program.loc_diffuse_map.as_ref(), 0) };
        }
    }
    bind_gl_uv_transform(
        &state.gl,
        program,
        diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant),
    );
}

// The feature define key for a Lambert material: the fixed `lambert` lighting model plus which optional
// maps are present and whether alpha-mask cutoff is active. Lambert never has specular or normal maps.
fn define_key_for_material(state: &mut GlRenderState, material: Option<&LambertMaterial>) -> GlClassicDefineKey {
    let diffuse_map = material
        .and_then(|material| material.diffuse_map.as_ref())
        .map(|texture| texture.read().unwrap());
    let has_diffuse_map = diffuse_map
        .as_deref()
        .is_some_and(|texture| resolve_gl_texture(state, texture, None, None).is_some());
    return GlClassicDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_alpha_map: false,
        has_color_adjustment: None,
        has_color_matrix: None,
        has_diffuse_map,
        has_instances: None,
        has_normal_map: false,
        has_skin: None,
        has_specular_map: false,
        has_uv_transform: has_gl_uv_transform(diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant)),
        lighting_model: GlClassicLightingModel::Lambert,
    };
}

fn draw_gl_lambert_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}
