// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::rc::Rc;
use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, TOON_MATERIAL_KIND, TextureSlot, ToonMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture};
use flight_texture::TextureVariant;
use glow::HasContext;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, bind_gl_uv_transform, draw_gl_mesh_subset, has_gl_uv_transform,
    set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_toon_prelude::ensure_gl_toon_program;
use crate::types::{GlMeshProgramRef, GlToonDefineKey, GlToonProgram};

// The built-in Toon (cel-shading) forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// ToonMaterialKind). bind selects the uber-shader variant for the material's base-color map / ramp /
// alpha mode, uploads the shared per-run uniforms (camera view-projection + position, the packed
// light block), and the material's base color, step count, cutoff, and textures. The diffuse N·L is
// quantized into stepped cel bands in the fragment stage (ramp lookup when a ramp is bound, else a
// stepped floor over `steps`); output is LINEAR color for the rgba16f scene target. draw uploads the
// geometry's GPU buffers lazily (cached by geometry.version), sets the per-draw model + normal
// matrices from the proxy, and issues the indexed draw over the proxy's subset with depth-test LESS +
// depth-write on and back-face culling unless the material is double-sided. See
// register_gl_toon_material to install it.
pub static GL_TOON_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_toon_mesh_material,
    draw: draw_gl_toon_mesh_material,
};

fn bind_gl_toon_material_uniforms(
    state: &mut GlRenderState,
    program: &GlToonProgram,
    material: Option<&ToonMaterial>,
) {
    let Some(material) = material else {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            let gl = &state.gl;
            gl.uniform_4_f32(program.loc_base_color.as_ref(), 1.0, 1.0, 1.0, 1.0);
            gl.uniform_1_f32(program.loc_steps.as_ref(), 3.0);
            gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), 0.5);
        }
        return;
    };

    let mut scratch_rgba: LinearColor = allocate_linear_color();
    unpack_color_to_linear(&mut scratch_rgba, material.base_color);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        let gl = &state.gl;
        gl.uniform_4_f32(
            program.loc_base_color.as_ref(),
            scratch_rgba.r,
            scratch_rgba.g,
            scratch_rgba.b,
            scratch_rgba.a,
        );
        gl.uniform_1_f32(program.loc_steps.as_ref(), material.steps as f32);
        gl.uniform_1_f32(program.loc_alpha_cutoff.as_ref(), material.alpha_cutoff);
    }

    let base_color_map = material.base_color_map.as_ref().map(|texture| texture.read().unwrap());
    if let Some(base_color_map) = base_color_map.as_deref() {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { state.gl.active_texture(glow::TEXTURE0) };
        if resolve_gl_texture(state, base_color_map, None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { state.gl.uniform_1_i32(program.loc_base_color_map.as_ref(), 0) };
        }
    }

    if let Some(ramp) = material.ramp.as_ref() {
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { state.gl.active_texture(glow::TEXTURE1) };
        if resolve_gl_texture(state, &*ramp.read().unwrap(), None, None).is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe { state.gl.uniform_1_i32(program.loc_ramp.as_ref(), 1) };
        }
    }

    bind_gl_uv_transform(
        &state.gl,
        program,
        base_color_map.as_deref().map(|texture| texture as &dyn TextureVariant),
    );
}

fn bind_gl_toon_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let toon = material.and_then(|material| material.as_any().downcast_ref::<ToonMaterial>());
    let key = define_key_for_material(state, toon);
    let program = ensure_gl_toon_program(state, &key);
    let active: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &active, toon.is_some_and(|toon| toon.double_sided));

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program, lights);
    bind_gl_toon_material_uniforms(state, &program, toon);
}

// The feature define key for a Toon material: which optional textures are present and whether alpha-
// mask cutoff is active. Drives both the program-cache variant and the bound textures. The ramp
// switches the fragment quantizer from a stepped floor to a 1D ramp lookup.
fn define_key_for_material(state: &mut GlRenderState, material: Option<&ToonMaterial>) -> GlToonDefineKey {
    let mut resolves = |slot: Option<&TextureSlot>| -> bool {
        return slot
            .and_then(|slot| slot.as_ref())
            .is_some_and(|texture| resolve_gl_texture(state, &*texture.read().unwrap(), None, None).is_some());
    };
    let has_base_color_map = resolves(material.map(|material| &material.base_color_map));
    let has_ramp = resolves(material.map(|material| &material.ramp));
    let base_color_map = material
        .and_then(|material| material.base_color_map.as_ref())
        .map(|texture| texture.read().unwrap());
    return GlToonDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_base_color_map,
        has_instances: None,
        has_ramp,
        has_skin: None,
        has_uv_transform: has_gl_uv_transform(base_color_map.as_deref().map(|texture| texture as &dyn TextureVariant)),
    };
}

fn draw_gl_toon_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Registers the built-in Toon renderer for ToonMaterialKind on this state. Opt-in (no top-level side
// effect); call once per GlRenderState before drawScene3D so meshes with ToonMaterials draw.
pub fn register_gl_toon_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(state, TOON_MATERIAL_KIND.to_string(), &GL_TOON_MESH_MATERIAL_RENDERER);
}
