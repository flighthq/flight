use flight_camera::Camera3D;
use flight_geometry::{create_matrix3, set_matrix3_normal_from_matrix4};
use flight_lighting::MAX_FORWARD_LIGHTS;
use flight_meshgeometry::has_mesh_geometry_skin;
use flight_render_gl::{
    GlRenderState, get_gl_color_adjustment_material_feature, invalidate_gl_render_state_cache,
};
use flight_scene3d::Mesh;
use glow::HasContext;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::{
    GlScene3DDrawEntry, GlScene3DForwardLightList, Scene3DLightsLike,
};

fn draw_blended_pass(state: &GlRenderState, camera: &Camera3D) {
    let is_empty = get_gl_scene3d_runtime(state, |rt| rt.blended_draw_list.is_empty());
    if is_empty {
        return;
    }

    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.blended_draw_list
            .sort_by(|a, b| b.depth.partial_cmp(&a.depth).unwrap_or(std::cmp::Ordering::Equal));
        rt.active_blended_run = true;
    });

    unsafe {
        state.gl.enable(glow::BLEND);
    }

    let entry_count = get_gl_scene3d_runtime(state, |rt| rt.blended_draw_list.len());
    let mut bound_sort_key: Option<i32> = None;
    let mut scratch_normal_matrix = create_matrix3();

    for i in 0..entry_count {
        let (sort_key, world_matrix) = get_gl_scene3d_runtime(state, |rt| {
            let entry = &rt.blended_draw_list[i];
            (entry.sort_key, entry.world_matrix.clone())
        });

        set_matrix3_normal_from_matrix4(&mut scratch_normal_matrix, &world_matrix);

        if Some(sort_key) != bound_sort_key {
            get_gl_scene3d_runtime_mut(state, |rt| {
                rt.active_skinned_run = false;
            });

            // TODO: apply blend mode and call renderer.bind
            bound_sort_key = Some(sort_key);
        }

        // TODO: set proxy fields and call renderer.draw
    }

    unsafe {
        state.gl.disable(glow::BLEND);
    }
}

fn draw_opaque_pass(state: &GlRenderState, camera: &Camera3D) {
    let entry_count = get_gl_scene3d_runtime(state, |rt| rt.opaque_draw_list.len());
    let mut bound_sort_key: Option<i32> = None;
    let mut scratch_normal_matrix = create_matrix3();

    for i in 0..entry_count {
        let (sort_key, world_matrix, renderer_id) = get_gl_scene3d_runtime(state, |rt| {
            let entry = &rt.opaque_draw_list[i];
            (entry.sort_key, entry.world_matrix.clone(), entry.renderer_id)
        });

        set_matrix3_normal_from_matrix4(&mut scratch_normal_matrix, &world_matrix);

        if Some(sort_key) != bound_sort_key {
            get_gl_scene3d_runtime_mut(state, |rt| {
                rt.active_skinned_run = false;
            });

            // TODO: resolve renderer by id and call bind
            bound_sort_key = Some(sort_key);
        }

        // TODO: set proxy fields and call renderer.draw
    }
}

fn has_excess_forward_lights(lights: &Scene3DLightsLike) -> bool {
    return lights.point.len() > MAX_FORWARD_LIGHTS || lights.spot.len() > MAX_FORWARD_LIGHTS;
}

fn is_gpu_skinned_draw(state: &GlRenderState, mesh: &Mesh) -> bool {
    let has_feature = get_gl_scene3d_runtime(state, |rt| rt.mesh_skin_feature.is_some());
    if !has_feature {
        return false;
    }
    let geom = mesh.geometry.read().unwrap();
    return mesh.skin.is_some() && has_mesh_geometry_skin(&geom);
}

fn recycle_draw_entries(entries: &mut Vec<GlScene3DDrawEntry>, pool: &mut Vec<GlScene3DDrawEntry>) {
    while let Some(entry) = entries.pop() {
        pool.push(entry);
    }
}

pub fn render_gl_scene3d(
    state: &GlRenderState,
    scene: &dyn flight_scene3d::Node3D,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    return render_gl_scene3d_with_forward_lights(state, scene, camera, lights, None);
}

pub fn render_gl_scene3d_with_forward_lights(
    state: &GlRenderState,
    scene: &dyn flight_scene3d::Node3D,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
    forward_lights: Option<&GlScene3DForwardLightList>,
) {
    let _viewport_aspect = get_gl_scene3d_viewport_aspect(state);
    // TODO: prepare_scene_3d_render requires &mut S where S: RenderState — adapt when available
    // For now, set up a skeleton that compiles and captures the draw algorithm structure.

    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.active_blended_run = false;
    });

    let has_prepared_forward_lights = forward_lights
        .map(|fl| fl.mesh_count > 0)
        .unwrap_or(false);

    if !has_prepared_forward_lights && has_excess_forward_lights(lights) {
        let guard = get_gl_scene3d_runtime(state, |rt| rt.forward_light_selection_guard.clone());
        if let Some(guard) = guard {
            guard(lights);
        }
    }

    // TODO: declare_gl_render_target_color_space requires &mut GlRenderTarget + RenderTargetColorSpace
    let color_space_guard = get_gl_scene3d_runtime(state, |rt| rt.color_space_guard.clone());
    if let Some(guard) = color_space_guard {
        // guard would be called when target color space is not linear
    }

    get_gl_scene3d_runtime_mut(state, |rt| {
        recycle_draw_entries(&mut rt.opaque_draw_list, &mut rt.opaque_pool);
        recycle_draw_entries(&mut rt.blended_draw_list, &mut rt.blended_pool);
    });

    // TODO: iterate visible meshes from Scene3DRenderList (requires prepare_scene_3d_render)
    // The draw algorithm partitions mesh subsets into opaque/blended lists, sorts opaques by
    // material key for bind elision, then draws both passes.

    // Sort opaque by material sort key for bind elision
    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.opaque_draw_list.sort_by(|a, b| a.sort_key.cmp(&b.sort_key));
    });

    // Pass 1: opaque + mask subsets
    let _color_adjustment_enabled = get_gl_color_adjustment_material_feature(state).is_some();
    draw_opaque_pass(state, camera);

    // Pass 2: blended subsets sorted back-to-front
    draw_blended_pass(state, camera);

    // Pass 3: instanced meshes (deferred — requires Scene3DRenderList)

    get_gl_scene3d_runtime_mut(state, |rt| {
        rt.active_blended_run = false;
    });
    unsafe {
        state.gl.depth_mask(true);
    }

    invalidate_gl_render_state_cache(state);
}
