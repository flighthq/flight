// flight-lint: allow-file(contract-vocabulary) D17 the scene runtime lives in render-gl's opaque per-state slot and lends RefMut views of thread-bound GL resources

//! scene3d-gl's per-state and per-context records (the source's module WeakMap keyed by
//! `GlRenderState` and the context's `sceneMeshUploadCache`), held in render-gl's opaque
//! `scene3d_runtime` / `scene3d_context_runtime` slots (D5: explicit state, no hidden globals).

use std::cell::RefMut;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_materials::STANDARD_MATERIAL_KIND;
use flight_materials::material3d::create_material3d;

use flight_entity::throw_error;
use flight_render_gl::{
    GlRenderState, GlSkinPaletteTexture, create_gl_skin_palette_texture,
    destroy_gl_skin_palette_texture, destroy_gl_texture_render_target,
};
use flight_scene3d::Scene3DAppearanceState;
use flight_texture::TextureColorSpace;
use glow::HasContext;

use crate::types::{GlScene3DContextRuntime, GlScene3DResourceCleanup, GlScene3DRuntime};

fn create_gl_scene3d_runtime_record() -> GlScene3DRuntime {
    return GlScene3DRuntime {
        active_blended_run: false,
        active_color_adjustment_run: false,
        active_color_matrix_run: false,
        active_instanced_run: false,
        active_mesh_program: None,
        active_skinned_run: false,
        appearance: Scene3DAppearanceState {
            world_appearance_revision: 0,
        },
        blended_draw_list: Vec::new(),
        blended_pool: Vec::new(),
        color_space_guard: None,
        custom_shader_guard: None,
        default_material: Arc::new(RwLock::new(create_material3d(STANDARD_MATERIAL_KIND.to_string()))),
        deform_guard: None,
        environment_capture_camera: None,
        environment_skybox: None,
        environment_source_cube: None,
        environment_source_cube_color_space: TextureColorSpace::Linear,
        environment_source_cube_face_versions: Vec::new(),
        environment_source_cube_face_sources: Vec::new(),
        environment_source_revision: 0,
        environment_source_texture: None,
        environment_source_texture_version: -1,
        forward_light_selection_guard: None,
        ibl: None,
        ibl_bake_framebuffer: None,
        ibl_bake_programs: None,
        ibl_placeholders: None,
        instance_color_palette: None,
        instance_palette: None,
        list_light_block: None,
        mesh_skin_feature: None,
        opaque_draw_list: Vec::new(),
        particle_emitter3d_shader: None,
        opaque_pool: Vec::new(),
        pbr_extension_guard: None,
        pbr_transmission_scene_color: None,
        prepared_forward_lights: None,
        program_cache: HashMap::new(),
        resource_cleanups: None,
        shadow: None,
        shadow_target: None,
        skin_normal_palette: None,
        skin_palette: None,
        time: 0.0,
        uploaded_light_blocks: HashMap::new(),
    };
}

fn create_skin_palette(state: &GlRenderState) -> GlSkinPaletteTexture {
    return create_gl_skin_palette_texture(state).unwrap_or_else(|error| throw_error(&error));
}

// Registers a teardown callback for a lazily-created optional resource, so destroy_gl_scene3d_runtime
// can free it without importing the module that owns it. Idempotent by function identity: pass a
// stable module-level function, and creating the resource again re-registers nothing.
pub fn add_gl_scene3d_resource_cleanup(state: &GlRenderState, cleanup: GlScene3DResourceCleanup) {
    let mut scene = get_gl_scene3d_runtime(state);
    let cleanups = scene.resource_cleanups.get_or_insert_with(Vec::new);
    if !cleanups
        .iter()
        .any(|existing| std::ptr::fn_addr_eq(*existing, cleanup))
    {
        cleanups.push(cleanup);
    }
}

// Frees every state-scoped GPU resource scene3d-gl created for `state`: all cached mesh-material and
// PBR programs, the IBL set, the source environment cubemap, the optional resources that registered a
// cleanup (IBL bake programs, skybox), the directional shadow map, and the skin / instance palettes.
// The runtime record itself stays allocated and cleared, safe to repopulate lazily. Per-geometry mesh
// and wireframe uploads are not reached here (free them with destroy_gl_mesh_upload /
// destroy_gl_wireframe_upload). A no-op when no scene runtime exists; safe to call more than once.
// flight-lint: allow(hashmap-iteration) GL program deletion order is unobservable
pub fn destroy_gl_scene3d_runtime(state: &mut GlRenderState) {
    if !has_gl_scene3d_runtime(state) {
        return;
    }
    let gl = state.gl.clone();
    let cleanups = {
        let mut scene = get_gl_scene3d_runtime(state);
        // SAFETY: teardown runs on the state's owning GL thread.
        unsafe {
            for program in scene.program_cache.values() {
                gl.delete_program(program.mesh_program().program);
            }
        }
        scene.program_cache.clear();
        scene.active_mesh_program = None;

        if let Some(ibl) = scene.ibl.take() {
            // SAFETY: the IBL textures belong to this state's context.
            unsafe {
                gl.delete_texture(ibl.brdf_lut);
                gl.delete_texture(ibl.irradiance_cube);
                gl.delete_texture(ibl.prefiltered_cube);
            }
        }
        if let Some(framebuffer) = scene.ibl_bake_framebuffer.take() {
            // SAFETY: the bake framebuffer belongs to this state's context.
            unsafe { gl.delete_framebuffer(framebuffer) };
        }
        if let Some(cube) = scene.environment_source_cube.take() {
            // SAFETY: the source cubemap belongs to this state's context.
            unsafe { gl.delete_texture(cube) };
        }
        scene.environment_source_cube_color_space = TextureColorSpace::Linear;
        scene.environment_source_cube_face_versions = Vec::new();
        scene.environment_source_texture = None;
        scene.environment_source_texture_version = -1;
        scene.resource_cleanups.as_ref().cloned()
    };
    // Optional resources free themselves through callbacks they registered on first creation.
    if let Some(cleanups) = cleanups {
        for cleanup in &cleanups {
            cleanup(state);
        }
        if let Some(registered) = get_gl_scene3d_runtime(state).resource_cleanups.as_mut() {
            registered.clear();
        }
    }

    let mut scene = get_gl_scene3d_runtime(state);
    if let Some(mut target) = scene.shadow_target.take() {
        destroy_gl_texture_render_target(&mut target);
    }
    scene.shadow = None;

    if let Some(mut palette) = scene.instance_palette.take() {
        destroy_gl_skin_palette_texture(state, &mut palette);
    }
    if let Some(mut palette) = scene.instance_color_palette.take() {
        destroy_gl_skin_palette_texture(state, &mut palette);
    }
    if let Some(mut palette) = scene.skin_normal_palette.take() {
        destroy_gl_skin_palette_texture(state, &mut palette);
    }
    if let Some(mut palette) = scene.skin_palette.take() {
        destroy_gl_skin_palette_texture(state, &mut palette);
    }

    scene.blended_draw_list.clear();
    scene.opaque_draw_list.clear();
    scene.blended_pool.clear();
    scene.opaque_pool.clear();
}

// Resolves the per-instance colour palette data texture, creating it lazily on first use.
pub fn ensure_gl_instance_color_palette(state: &GlRenderState) -> RefMut<'_, GlSkinPaletteTexture> {
    let scene = get_gl_scene3d_runtime(state);
    return RefMut::map(scene, |scene| {
        return scene
            .instance_color_palette
            .get_or_insert_with(|| create_skin_palette(state));
    });
}

// Resolves the per-instance matrix palette data texture, creating it lazily on first use.
pub fn ensure_gl_instance_palette(state: &GlRenderState) -> RefMut<'_, GlSkinPaletteTexture> {
    let scene = get_gl_scene3d_runtime(state);
    return RefMut::map(scene, |scene| {
        return scene
            .instance_palette
            .get_or_insert_with(|| create_skin_palette(state));
    });
}

// Resolves the skin NORMAL palette data texture, created on the first skinned draw and grown by the
// shared upload. Separate from the pose palette so each uploads its own array directly.
pub fn ensure_gl_skin_normal_palette(state: &GlRenderState) -> RefMut<'_, GlSkinPaletteTexture> {
    let scene = get_gl_scene3d_runtime(state);
    return RefMut::map(scene, |scene| {
        return scene
            .skin_normal_palette
            .get_or_insert_with(|| create_skin_palette(state));
    });
}

// Resolves the per-state GPU skin bone-palette data texture, creating it lazily on the first skinned
// draw. Every skinned mesh shares this one RGBA32F texture: the palette is re-uploaded per draw.
pub fn ensure_gl_skin_palette(state: &GlRenderState) -> RefMut<'_, GlSkinPaletteTexture> {
    let scene = get_gl_scene3d_runtime(state);
    return RefMut::map(scene, |scene| {
        return scene
            .skin_palette
            .get_or_insert_with(|| create_skin_palette(state));
    });
}

// The context's scene3d-gl record (the shared geometry upload caches), created on first use. A
// derived state on the same context reuses the record its primary installed.
pub(crate) fn get_gl_scene3d_context_runtime(
    state: &GlRenderState,
) -> RefMut<'_, GlScene3DContextRuntime> {
    let context = state.context_state.runtime_state.borrow_mut();
    return RefMut::map(context, |context| {
        let slot = &mut context.scene3d_context_runtime;
        if slot
            .as_ref()
            .is_none_or(|value| !value.is::<GlScene3DContextRuntime>())
        {
            *slot = Some(Box::new(GlScene3DContextRuntime::default()));
        }
        return slot
            .as_mut()
            .and_then(|value| value.downcast_mut::<GlScene3DContextRuntime>())
            .expect("the scene3d-gl context slot holds a GlScene3DContextRuntime");
    });
}

// Resolves scene3d-gl's private runtime for a GlRenderState, allocating it on first use. Mutable by
// design: the draw path writes the caches every frame. Hold the returned borrow only briefly — any
// call that re-enters the runtime while it is held panics (RefCell discipline).
pub fn get_gl_scene3d_runtime(state: &GlRenderState) -> RefMut<'_, GlScene3DRuntime> {
    if !has_gl_scene3d_runtime(state) {
        // Wire the context-tier upload cache on first use; a derived state reuses its primary's.
        drop(get_gl_scene3d_context_runtime(state));
    }
    let runtime = state.gl_runtime.borrow_mut();
    return RefMut::map(runtime, |runtime| {
        let slot = &mut runtime.scene3d_runtime;
        if slot
            .as_ref()
            .is_none_or(|value| !value.is::<GlScene3DRuntime>())
        {
            *slot = Some(Box::new(create_gl_scene3d_runtime_record()));
        }
        return slot
            .as_mut()
            .and_then(|value| value.downcast_mut::<GlScene3DRuntime>())
            .expect("the scene3d-gl state slot holds a GlScene3DRuntime");
    });
}

// Whether the state's scene runtime has been allocated (TS `sceneRuntimes.has(state)`).
pub(crate) fn has_gl_scene3d_runtime(state: &GlRenderState) -> bool {
    return state
        .gl_runtime
        .borrow()
        .scene3d_runtime
        .as_ref()
        .is_some_and(|value| value.is::<GlScene3DRuntime>());
}
