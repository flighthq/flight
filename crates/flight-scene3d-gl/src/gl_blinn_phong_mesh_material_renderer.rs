// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::rc::Rc;
use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial, TextureSlot};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use flight_texture::TextureVariant;
use glow::{HasContext, NativeUniformLocation};

use crate::gl_classic_prelude::ensure_gl_classic_program;
use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_pbr_standard_block::is_gl_texture_ready;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, bind_gl_uv_transform, draw_gl_mesh_subset, has_gl_uv_transform,
    set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlClassicDefineKey, GlClassicLightingModel, GlClassicProgram, GlMeshProgramRef};

// The built-in classic BlinnPhong forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// BlinnPhongMaterialKind). Lambert diffuse plus a half-vector specular lobe (cheaper, smoother
// highlights than reflection-vector Phong): bind selects the classic uber-shader's `blinnphong`
// variant for the material's diffuse / specular / normal maps and alpha mode, uploads the camera
// view-projection AND position (the specular term is view-dependent), the packed light block, and the
// material's linear diffuse + specular colors, shininess, and maps. draw issues the indexed draw. See
// register_gl_blinn_blinn_phong_material to install it.
pub static GL_BLINN_PHONG_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_blinn_phong_mesh_material,
    draw: draw_gl_blinn_phong_mesh_material,
};

// Selects a texture unit and, when the slot's texture resolves, points the sampler uniform at it.
fn bind_gl_blinn_phong_material_map(
    state: &mut GlRenderState,
    texture: &TextureSlot,
    unit: u32,
    location: Option<NativeUniformLocation>,
) {
    let Some(texture) = texture else {
        return;
    };
    // SAFETY: texture-unit selection runs on the owning GL thread.
    unsafe { state.gl.active_texture(glow::TEXTURE0 + unit) };
    if resolve_gl_texture(state, &*texture.read().unwrap(), None, None).is_some() {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { state.gl.uniform_1_i32(location.as_ref(), unit as i32) };
    }
}

fn bind_gl_blinn_phong_material_uniforms(
    state: &mut GlRenderState,
    program: &GlClassicProgram,
    material: Option<&BlinnPhongMaterial>,
) {
    let Some(material) = material else {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            let gl = &state.gl;
            gl.uniform_4_f32(program.loc_diffuse.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_4_f32(program.loc_specular.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_1_f32(program.loc_shininess.as_ref(), 32.0);
            gl.uniform_1_f32(program.loc_normal_scale.as_ref(), 1.0);
            gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
        }
        return;
    };

    let mut scratch_rgba: LinearColor = allocate_linear_color();
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &state.gl;
        unpack_color_to_linear(&mut scratch_rgba, material.diffuse);
        gl.uniform_4_f32(
            program.loc_diffuse.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
            scratch_rgba.a,
        );
        unpack_color_to_linear(&mut scratch_rgba, material.specular);
        gl.uniform_4_f32(
            program.loc_specular.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
            scratch_rgba.a,
        );
        gl.uniform_1_f32(program.loc_shininess.as_ref(), material.shininess);
        gl.uniform_1_f32(program.loc_normal_scale.as_ref(), material.normal_scale);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), material.alpha_cutoff);
    }

    bind_gl_blinn_phong_material_map(state, &material.diffuse_map, 0, program.loc_diffuse_map);
    bind_gl_blinn_phong_material_map(state, &material.specular_map, 1, program.loc_specular_map);
    bind_gl_blinn_phong_material_map(state, &material.normal_map, 2, program.loc_normal_map);
    bind_gl_blinn_phong_material_map(state, &material.alpha_map, 3, program.loc_alpha_map);

    let diffuse_map = material.diffuse_map.as_ref().map(|texture| texture.read().unwrap());
    bind_gl_uv_transform(
        &state.gl,
        program,
        diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant),
    );
}

fn bind_gl_blinn_phong_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let blinn_phong = material.and_then(|material| material.as_any().downcast_ref::<BlinnPhongMaterial>());
    let key = define_key_for_material(state, blinn_phong);
    let program = ensure_gl_classic_program(state, &key);
    let active: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &active, blinn_phong.is_some_and(|blinn_phong| blinn_phong.double_sided));

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program, lights);
    bind_gl_blinn_phong_material_uniforms(state, &program, blinn_phong);
}

// The feature define key for a BlinnPhong material: the fixed `blinnphong` lighting model plus which
// optional maps are present and whether alpha-mask cutoff is active.
fn define_key_for_material(
    state: &mut GlRenderState,
    material: Option<&BlinnPhongMaterial>,
) -> GlClassicDefineKey {
    let diffuse_map = material
        .and_then(|material| material.diffuse_map.as_ref())
        .map(|texture| texture.read().unwrap());
    let has_uv_transform =
        has_gl_uv_transform(diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant));
    drop(diffuse_map);
    return GlClassicDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        // Match the bind's resolver readiness so the compiled HAS_ALPHA_MAP variant and bound texture
        // never disagree. Gated off 'opaque' — an opaque material ignores coverage (Material3D
        // contract), so it must not sample the alpha map.
        has_alpha_map: material.is_some_and(|material| {
            material.alpha_mode != MaterialAlphaMode::Opaque
                && is_gl_texture_ready(state, material.alpha_map.as_ref())
        }),
        has_color_adjustment: None,
        has_color_matrix: None,
        has_diffuse_map: material
            .is_some_and(|material| is_gl_texture_ready(state, material.diffuse_map.as_ref())),
        has_instances: None,
        has_normal_map: material
            .is_some_and(|material| is_gl_texture_ready(state, material.normal_map.as_ref())),
        has_skin: None,
        has_specular_map: material
            .is_some_and(|material| is_gl_texture_ready(state, material.specular_map.as_ref())),
        has_uv_transform,
        lighting_model: GlClassicLightingModel::BlinnPhong,
    };
}

fn draw_gl_blinn_phong_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Registers the built-in BlinnPhong renderer for BlinnPhongMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with BlinnPhong
// materials draw.
pub fn register_gl_blinn_phong_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        BLINN_PHONG_MATERIAL_KIND.to_string(),
        &GL_BLINN_PHONG_MESH_MATERIAL_RENDERER,
    );
}
