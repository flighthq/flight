use std::cell::RefCell;
use std::collections::HashMap;

use flight_entity::get_entity_id;
use flight_render_gl::GlRenderState;

use crate::types::GlScene3DRuntime;

thread_local! {
    static SCENE_RUNTIMES: RefCell<HashMap<u64, GlScene3DRuntime>> = RefCell::new(HashMap::new());
}

pub fn get_gl_scene3d_runtime<R>(state: &GlRenderState, f: impl FnOnce(&GlScene3DRuntime) -> R) -> R {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        let scene = map.entry(id).or_insert_with(create_default_runtime);
        f(scene)
    })
}

pub fn get_gl_scene3d_runtime_mut<R>(state: &GlRenderState, f: impl FnOnce(&mut GlScene3DRuntime) -> R) -> R {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        let scene = map.entry(id).or_insert_with(create_default_runtime);
        f(scene)
    })
}

pub fn destroy_gl_scene3d_runtime(state: &GlRenderState) {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        map.remove(&id);
    });
}

fn create_default_runtime() -> GlScene3DRuntime {
    return GlScene3DRuntime {
        active_blended_run: false,
        active_color_adjustment_run: false,
        active_color_matrix_run: false,
        active_instanced_run: false,
        active_mesh_program: None,
        active_skinned_run: false,
        blended_draw_list: Vec::new(),
        blended_pool: Vec::new(),
        color_space_guard: None,
        custom_shader_guard: None,
        deform_guard: None,
        environment_source_cube: None,
        environment_source_cube_color_space: "linear".to_string(),
        environment_source_cube_face_versions: Vec::new(),
        environment_source_revision: 0,
        environment_source_texture: None,
        environment_source_texture_version: -1,
        forward_light_selection_guard: None,
        ibl: None,
        ibl_bake_framebuffer: None,
        mesh_skin_feature: None,
        opaque_draw_list: Vec::new(),
        opaque_pool: Vec::new(),
        pbr_extension_guard: None,
        pbr_transmission_scene_color: None,
        program_cache: HashMap::new(),
        resource_cleanups: None,
        shadow: None,
        shadow_target: None,
        instance_color_palette: None,
        instance_palette: None,
        skin_normal_palette: None,
        skin_palette: None,
        time: 0.0,
        upload_cache: HashMap::new(),
        material_renderers: HashMap::new(),
        modifier_snippets: HashMap::new(),
        pbr_extension_registrations: HashMap::new(),
    };
}
