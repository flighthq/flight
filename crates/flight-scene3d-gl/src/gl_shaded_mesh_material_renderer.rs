// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state; D16 heterogeneous Ref<dyn Modifier> stacks

use std::rc::Rc;
use std::sync::PoisonError;

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material3D, MaterialAlphaMode, TextureSlot};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{
    GlMeshMaterialRenderer, GlModifierBindContext, GlRenderState, resolve_gl_texture,
};
use flight_shading::{Modifier, SHADED_MATERIAL_KIND, ShadedMaterial, order_modifier_stack};
use flight_texture::TextureVariant;
use glow::{HasContext, NativeUniformLocation};

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, bind_gl_uv_transform, draw_gl_mesh_subset, has_gl_uv_transform,
    set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_scene3d_time::get_gl_scene3d_time;
use crate::gl_shaded_prelude::ensure_gl_shaded_program;
use crate::types::{GlMeshProgramRef, GlShadedDefineKey, GlShadedProgram};

// Modifier textures bind above the base material units (diffuse/specular/normal on 0/1/2) and below
// the shadow map (unit 8) and IBL units (9/10/11), so a modifier's map never clobbers a base or
// shadow binding. LIMIT mirrors gl_lit_program's SHADOW_MAP_TEXTURE_UNIT (8): units [3, 8) are the
// five modifier-sampler slots; a stack asking for more gets -1 (dropped) rather than unit 8+.
const MODIFIER_TEXTURE_UNIT_BASE: i32 = 3;
const MODIFIER_TEXTURE_UNIT_LIMIT: i32 = 8;

// The built-in ShadedMaterial forward-lit mesh-material renderer — flight_shading's composable base
// material on GL. bind assembles ONE program from the base blinn-phong lit shader plus the material's
// ordered modifier stack (a third assembly over the shared light block, keyed by the stack's
// feature-set define-key), uploads the camera view-projection + position, the packed light block, the
// base diffuse/specular/normal uniforms and maps, the per-frame `time`, then each modifier's uniforms.
// A plain ShadedMaterial (empty modifier stack) compiles the lean base variant and skips the modifier
// bind entirely. See register_gl_shaded_material to install it, and
// register_built_in_gl_modifier_snippets to enable the built-in modifiers.
pub static GL_SHADED_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_shaded_mesh_material,
    draw: draw_gl_shaded_mesh_material,
};

// Selects a texture unit and, when the slot's texture resolves, points the sampler uniform at it.
fn bind_gl_shaded_material_map(
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

fn bind_gl_shaded_material_uniforms(
    state: &mut GlRenderState,
    program: &GlShadedProgram,
    material: Option<&ShadedMaterial>,
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

    bind_gl_shaded_material_map(state, &material.diffuse_map, 0, program.loc_diffuse_map);
    bind_gl_shaded_material_map(state, &material.specular_map, 1, program.loc_specular_map);
    bind_gl_shaded_material_map(state, &material.normal_map, 2, program.loc_normal_map);

    let diffuse_map = material.diffuse_map.as_ref().map(|texture| texture.read().unwrap());
    bind_gl_uv_transform(
        &state.gl,
        program,
        diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant),
    );
}

fn bind_gl_shaded_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let shaded = material.and_then(|material| material.as_any().downcast_ref::<ShadedMaterial>());
    let modifiers: &[Ref<dyn Modifier>] = shaded.map_or(&[], |shaded| shaded.modifiers.as_slice());
    let key = define_key_for_material(state, shaded);
    let program = ensure_gl_shaded_program(state, &key, modifiers);
    let active: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &active, shaded.is_some_and(|shaded| shaded.double_sided));

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program, lights);
    bind_gl_shaded_material_uniforms(state, &program, shaded);
    let time = get_gl_scene3d_time(state);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe { state.gl.uniform_1_f32(program.loc_time.as_ref(), time) };
    if !modifiers.is_empty() {
        bind_gl_shaded_modifiers(state, &program, modifiers);
    }
}

// Iterates the ordered modifier stack and uploads each modifier's uniforms through its registered GL
// snippet, in the SAME order the compile path emitted them, so a snippet's suffixed uniform names
// (u_..._<index>) line up with the compiled program. A shared texture-unit cursor hands successive
// units (from MODIFIER_TEXTURE_UNIT_BASE) to snippets that sample maps. A modifier whose kind has no
// registered snippet, or a snippet with no `bind`, is skipped (it contributed no GLSL either).
fn bind_gl_shaded_modifiers(
    state: &mut GlRenderState,
    program: &GlShadedProgram,
    modifiers: &[Ref<dyn Modifier>],
) {
    let entries = state.gl_registries.modifier_snippets.clone();
    let mut ordered = Vec::new();
    order_modifier_stack(&mut ordered, modifiers);
    let mut next_texture_unit = MODIFIER_TEXTURE_UNIT_BASE;
    // Hand out modifier units in [BASE, LIMIT); return -1 once exhausted so an over-textured stack
    // drops its excess samplers (bind_gl_modifier_texture leaves them unbound) instead of walking into
    // the shadow/IBL units and corrupting shadow sampling.
    let mut acquire_modifier_texture_unit = || -> i32 {
        if next_texture_unit < MODIFIER_TEXTURE_UNIT_LIMIT {
            let unit = next_texture_unit;
            next_texture_unit += 1;
            return unit;
        }
        return -1;
    };
    let mut context = GlModifierBindContext {
        acquire_modifier_texture_unit: &mut acquire_modifier_texture_unit,
        index: 0,
        program: program.program,
        state,
    };
    for (index, modifier) in ordered.iter().enumerate() {
        let modifier = modifier.read().unwrap_or_else(PoisonError::into_inner);
        let Some(bind) = entries
            .entries
            .get(&modifier.modifier_fields().kind)
            .and_then(|entry| entry.bind)
        else {
            continue;
        };
        context.index = index;
        bind(&*modifier, &mut context);
    }
}

// The base-material feature flags for a ShadedMaterial: which optional maps are present and whether
// alpha-mask cutoff is active. The modifier feature-set is keyed separately (in
// ensure_gl_shaded_program) from the material's modifier stack.
fn define_key_for_material(state: &mut GlRenderState, material: Option<&ShadedMaterial>) -> GlShadedDefineKey {
    let mut resolves = |slot: Option<&TextureSlot>| -> bool {
        return slot
            .and_then(|slot| slot.as_ref())
            .is_some_and(|texture| resolve_gl_texture(state, &*texture.read().unwrap(), None, None).is_some());
    };
    let has_diffuse_map = resolves(material.map(|material| &material.diffuse_map));
    let has_normal_map = resolves(material.map(|material| &material.normal_map));
    let has_specular_map = resolves(material.map(|material| &material.specular_map));
    let diffuse_map = material
        .and_then(|material| material.diffuse_map.as_ref())
        .map(|texture| texture.read().unwrap());
    return GlShadedDefineKey {
        alpha_mask_enabled: material.is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        has_color_adjustment: None,
        has_color_matrix: None,
        has_diffuse_map,
        has_instances: None,
        has_normal_map,
        has_skin: None,
        has_specular_map,
        has_uv_transform: has_gl_uv_transform(diffuse_map.as_deref().map(|texture| texture as &dyn TextureVariant)),
    };
}

fn draw_gl_shaded_mesh_material(state: &mut GlRenderState, proxy: &Scene3DRenderProxy, geometry: &MeshGeometry) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

// Registers the built-in ShadedMaterial renderer for ShadedMaterialKind on this state. Opt-in (no
// top-level side effect); call once per GlRenderState before drawScene3D so meshes with ShadedMaterials
// draw. Enable the built-in modifiers separately with register_built_in_gl_modifier_snippets — a plain
// ShadedMaterial needs only this registration.
pub fn register_gl_shaded_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        SHADED_MATERIAL_KIND.to_string(),
        &GL_SHADED_MESH_MATERIAL_RENDERER,
    );
}
