//! scene3d-wgpu's private per-state record (TS `wgpuScene3DRuntime.ts`), held in render-wgpu's
//! opaque `scene3d_runtime` slot (D5: state-owned, never module-global).

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_materials::Material3DRef;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_materials::material3d::create_material3d;
use flight_render_wgpu::{
    WgpuRenderState, WgpuSkinningAdapter, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut,
};
use flight_scene3d::Scene3DAppearanceState;

use crate::types::*;

/// Resolves scene3d-wgpu's private runtime for a state, allocating it and wiring the device tier's
/// mesh upload cache on first use (TS `getWgpuScene3DRuntime`). Mutable by design: the draw path
/// writes the caches and shared bindings every frame.
pub fn get_wgpu_scene3d_runtime(state: &mut WgpuRenderState) -> &mut WgpuScene3DRuntime {
    let installed = get_wgpu_render_state_runtime(state)
        .scene3d_runtime
        .as_ref()
        .is_some_and(|value| value.is::<WgpuScene3DRuntime>());
    if !installed {
        let skinning_entry = get_wgpu_render_state_runtime(state).registries.gpu_skinning;
        // The device tier owns the upload cache; a derived state keeps the map its primary already
        // installed rather than replacing it with a state-local one.
        {
            let context = get_wgpu_render_state_runtime(state).context.clone();
            let mut context = context.write().unwrap();
            if context.scene_mesh_upload_cache.is_none() {
                context.scene_mesh_upload_cache = Some(HashMap::new());
            }
        }
        let scene = create_wgpu_scene3d_runtime_record(skinning_entry);
        get_wgpu_render_state_runtime_mut(state).scene3d_runtime = Some(Box::new(scene));
    }
    return get_wgpu_render_state_runtime_mut(state)
        .scene3d_runtime
        .as_mut()
        .and_then(|value| value.downcast_mut::<WgpuScene3DRuntime>())
        .expect("the scene3d-wgpu runtime slot holds a WgpuScene3DRuntime");
}

/// The state-scoped opt-in GPU skinning adapter, or `None` (TS `getWgpuSkinningAdapter`).
pub fn get_wgpu_skinning_adapter(
    state: &mut WgpuRenderState,
) -> Option<&'static WgpuSkinningAdapter> {
    return get_wgpu_scene3d_runtime(state).skinning_adapter;
}

// The placeholder default material handed to a renderer for a subset whose material slot is empty
// (TS `DEFAULT_MATERIAL`): a standard-kind material with createMaterial3D's own defaults.
pub(crate) fn get_wgpu_scene3d_default_material(state: &mut WgpuRenderState) -> Material3DRef {
    let scene = get_wgpu_scene3d_runtime(state);
    if let Some(material) = &scene.default_material {
        return material.clone();
    }
    let material: Material3DRef = Arc::new(RwLock::new(create_material3d(
        STANDARD_MATERIAL_KIND.to_string(),
    )));
    scene.default_material = Some(material.clone());
    return material;
}

fn create_wgpu_scene3d_runtime_record(
    skinning_adapter: Option<&'static WgpuSkinningAdapter>,
) -> WgpuScene3DRuntime {
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
        draw_bind_group: None,
        draw_bind_group_layout: None,
        frame_bind_group: None,
        frame_bind_group_layout: None,
        frame_buffer: None,
        frame_bindings: HashMap::new(),
        custom_shader_guard: None,
        forward_light_selection_guard: None,
        environment_source_cube: None,
        environment_source_cube_view: None,
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
        material_bind_groups: HashMap::new(),
        pbr_sample_bind_group: None,
        pbr_sample_ibl_cube_view: None,
        pbr_sample_layout: None,
        pbr_sample_shadow_view: None,
        opaque_draw_list: Vec::new(),
        opaque_pool: Vec::new(),
        pending_draw_offset: 0,
        // Column-major identity mat3 (the untiled default until a family stashes a real transform).
        pending_uv_transform: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        pipeline_cache: HashMap::new(),
        placeholder_view: None,
        shadow: None,
        shadow_comparison_sampler: None,
        shadow_depth_pipeline: None,
        shadow_depth_skinned_pipeline: None,
        shadow_depth_instanced_pipeline: None,
        shadow_dummy_texture: None,
        shadow_dummy_view: None,
        shadow_sample_bind_group: None,
        shadow_sample_layout: None,
        shadow_sample_view: None,
        shadow_uniform_buffer: None,
        shaded_material_binding_cache: HashMap::new(),
        shaded_material_plan_cache: HashMap::new(),
        skin_draw_bind_group: None,
        skin_draw_bind_group_layout: None,
        skin_mesh_draw_bind_group: None,
        skin_mesh_draw_bind_group_layout: None,
        skin_arena_frame: None,
        skin_normal_palette_arena_bases: None,
        skin_normal_palette_arena_cursor: 0,
        skin_normal_palette_arena_replays: Vec::new(),
        skin_normal_palette_arena_rows: 0,
        skin_normal_palette_texture: None,
        skin_normal_palette_view: None,
        skin_palette_arena_bases: None,
        skin_palette_arena_cursor: 0,
        skin_palette_arena_replays: Vec::new(),
        skin_palette_arena_rows: 0,
        skin_palette_texture: None,
        skin_palette_view: None,
        pending_skin_normal_palette_base: 0,
        pending_skin_palette_base: 0,
        skinning_adapter,
        appearance: Scene3DAppearanceState::default(),
        default_material: None,
        forward_lights: None,
        instance_scratch: Vec::new(),
        sort_key_counter: 0,
        sort_keys: HashMap::new(),
        time: 0.0,
    };
}
