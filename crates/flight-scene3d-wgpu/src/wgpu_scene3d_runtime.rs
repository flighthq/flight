use std::cell::RefCell;
use std::collections::HashMap;

use flight_entity::get_entity_id;
use flight_render_wgpu::WgpuRenderState;

use crate::types::WgpuScene3DRuntime;

thread_local! {
    static SCENE_RUNTIMES: RefCell<HashMap<u64, WgpuScene3DRuntime>> = RefCell::new(HashMap::new());
}

pub fn get_wgpu_scene3d_runtime<R>(state: &WgpuRenderState, f: impl FnOnce(&WgpuScene3DRuntime) -> R) -> R {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        let scene = map.entry(id).or_insert_with(create_default_runtime);
        f(scene)
    })
}

pub fn get_wgpu_scene3d_runtime_mut<R>(state: &WgpuRenderState, f: impl FnOnce(&mut WgpuScene3DRuntime) -> R) -> R {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        let scene = map.entry(id).or_insert_with(create_default_runtime);
        f(scene)
    })
}

pub fn destroy_wgpu_scene3d_runtime(state: &WgpuRenderState) {
    let id = get_entity_id(state);
    SCENE_RUNTIMES.with(|runtimes| {
        let mut map = runtimes.borrow_mut();
        map.remove(&id);
    });
}

fn create_default_runtime() -> WgpuScene3DRuntime {
    return WgpuScene3DRuntime {
        active_blend_mode: None,
        active_blended_run: false,
        active_color_adjustment_run: false,
        active_color_matrix_run: false,
        active_mirrored_run: false,
        active_skinned_run: false,
        active_mesh_pipeline: None,
        blended_draw_list: Vec::new(),
        blended_pool: Vec::new(),
        custom_shader_guard: None,
        draw_bind_group: None,
        draw_bind_group_layout: None,
        environment_source_cube: None,
        environment_source_cube_view: None,
        forward_light_selection_guard: None,
        frame_bind_group: None,
        frame_bind_group_layout: None,
        frame_buffer: None,
        ibl: None,
        ibl_dummy_cube_texture: None,
        ibl_dummy_cube_view: None,
        ibl_dummy_lut_texture: None,
        ibl_dummy_lut_view: None,
        ibl_sample_bind_group: None,
        ibl_sample_cube_view: None,
        ibl_sample_layout: None,
        ibl_sampler: None,
        ibl_uniform_buffer: None,
        material_renderers: HashMap::new(),
        modifier_snippets: HashMap::new(),
        opaque_draw_list: Vec::new(),
        opaque_pool: Vec::new(),
        pbr_sample_bind_group: None,
        pbr_sample_ibl_cube_view: None,
        pbr_sample_layout: None,
        pbr_sample_shadow_view: None,
        pending_draw_offset: 0,
        pending_skin_normal_palette_base: 0,
        pending_skin_palette_base: 0,
        pending_uv_transform: Vec::new(),
        pipeline_cache: HashMap::new(),
        placeholder_view: None,
        shadow: None,
        shadow_comparison_sampler: None,
        shadow_depth_pipeline: None,
        shadow_depth_instanced_pipeline: None,
        shadow_depth_skinned_pipeline: None,
        shadow_dummy_texture: None,
        shadow_dummy_view: None,
        shadow_sample_bind_group: None,
        shadow_sample_layout: None,
        shadow_sample_view: None,
        shadow_uniform_buffer: None,
        shaded_material_binding_cache: HashMap::new(),
        skin_draw_bind_group: None,
        skin_draw_bind_group_layout: None,
        skin_mesh_draw_bind_group: None,
        skin_mesh_draw_bind_group_layout: None,
        skin_normal_palette_texture: None,
        skin_normal_palette_view: None,
        skin_arena_frame: None,
        skin_normal_palette_arena_bases: None,
        skin_normal_palette_arena_cursor: 0,
        skin_normal_palette_arena_rows: 0,
        skin_palette_arena_bases: None,
        skin_palette_arena_cursor: 0,
        skin_palette_arena_rows: 0,
        skin_palette_texture: None,
        skin_palette_view: None,
        skinning_adapter: None,
        time: 0.0,
        upload_cache: HashMap::new(),
    };
}
