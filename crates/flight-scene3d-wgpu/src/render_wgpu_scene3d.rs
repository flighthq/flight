//! Draws a prepared 3D scene on the wgpu backend (TS `renderWgpuScene3D.ts`), the WGSL mirror of
//! scene3d-gl's `render_gl_scene3d`.

use std::sync::{Arc, RwLock};

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::{Ref, get_entity_id};
use flight_geometry::{
    create_matrix3, create_matrix4, get_matrix4_determinant, set_matrix3_normal_from_matrix4,
};
use flight_lighting::{MAX_FORWARD_LIGHTS, Scene3DLightBlock, Scene3DLightsLike};
use flight_materials::{
    BLEND_MODE_NORMAL, BlendMode, Material3D, Material3DRef, MaterialAlphaMode,
};
use flight_meshgeometry::MeshSubset;
use flight_node::NodeRef;
use flight_node::contract::get_node_world_matrix4;
use flight_render::{PreparedScene3D, RenderState, Scene3DRenderProxy, prepare_scene_3d_render};
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderPass, WgpuRenderState,
    declare_wgpu_render_target_color_space, get_wgpu_color_adjustment_material_feature,
    get_wgpu_render_state_runtime,
};
use flight_scene3d::{InstancedMesh, Mesh, get_node3d_world_alpha};
use flight_texture::RenderTargetColorSpace;

use crate::types::*;
use crate::wgpu_mesh_material_registry::resolve_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::INSTANCE_RECORD_FLOATS;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_default_material, get_wgpu_scene3d_runtime};

fn create_draw_entry() -> WgpuScene3DDrawEntry {
    return WgpuScene3DDrawEntry {
        alpha: 1.0,
        color_matrix: None,
        color_scale_bias: None,
        depth: 0.0,
        light_block: None,
        material: None,
        mesh: None,
        renderer: None,
        sort_key: 0,
        subset: MeshSubset {
            index_count: 0,
            index_offset: 0,
        },
        world_matrix: create_matrix4(),
    };
}

fn acquire_draw_entry(pool: &mut Vec<WgpuScene3DDrawEntry>) -> WgpuScene3DDrawEntry {
    return pool.pop().unwrap_or_else(create_draw_entry);
}

// A run sort key: the renderer's first-seen ordinal in the high bits, the material's in the low.
// Renderers are `&'static` tables compared by reference (a static is never freed, so it cannot alias
// another); materials key by their numeric entity id (D12/D15), never by address.
fn acquire_sort_key(
    state: &mut WgpuRenderState,
    renderer: &'static WgpuMeshMaterialRenderer,
    material: &Material3DRef,
) -> u32 {
    let material_id = get_entity_id(&*material.read().unwrap());
    let runtime = get_wgpu_scene3d_runtime(state);
    let renderer_ordinal = match runtime
        .renderer_sort_keys
        .iter()
        .find(|(seen, _)| std::ptr::eq(*seen, renderer))
    {
        Some((_, ordinal)) => *ordinal,
        None => {
            let ordinal = runtime.sort_key_counter;
            runtime.sort_key_counter += 1;
            runtime.renderer_sort_keys.push((renderer, ordinal));
            ordinal
        }
    };
    let material_ordinal = match runtime.material_sort_keys.get(&material_id) {
        Some(ordinal) => *ordinal,
        None => {
            let ordinal = runtime.sort_key_counter;
            runtime.sort_key_counter += 1;
            runtime.material_sort_keys.insert(material_id, ordinal);
            ordinal
        }
    };
    return renderer_ordinal * 65536 + material_ordinal;
}

fn draw_entries(
    state: &mut WgpuRenderState,
    entries: &[WgpuScene3DDrawEntry],
    shared_light_block: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
    blended: bool,
) {
    get_wgpu_scene3d_runtime(state).active_blended_run = blended;
    let mut bound_material: Option<u64> = None;
    let mut bound_light_block: Option<Option<Ref<Scene3DLightBlock>>> = None;
    let mut bound_renderer: Option<&'static WgpuMeshMaterialRenderer> = None;
    let mut bound_mirrored: Option<bool> = None;
    let mut bound_skinned: Option<bool> = None;
    let mut bound_color_adjustment: Option<bool> = None;
    let mut bound_color_matrix: Option<bool> = None;
    let color_adjustment_feature_enabled =
        get_wgpu_color_adjustment_material_feature(state).is_some();

    for entry in entries {
        let material = entry.material.clone().unwrap();
        let renderer = entry.renderer.unwrap();
        let mesh_node = entry.mesh.clone().unwrap();
        let blend_mode = if blended {
            Some(get_material_blend_mode(&*material.read().unwrap()))
        } else {
            None
        };
        get_wgpu_scene3d_runtime(state).active_blend_mode = blend_mode;
        let world_matrix = &entry.world_matrix;
        let mut normal_matrix = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut normal_matrix, world_matrix);
        let node = mesh_node.read().unwrap();
        let mesh = node
            .as_any()
            .downcast_ref::<Mesh>()
            .expect("draw entries hold Mesh nodes");
        let skinned = is_wgpu_mesh_gpu_skinned(state, mesh);
        // A negative determinant means the world matrix mirrors, which reverses triangle winding;
        // WebGPU fixes frontFace at pipeline creation, so this selects a 'cw' variant.
        let mirrored = get_matrix4_determinant(world_matrix) < 0.0;
        let color_adjusted = color_adjustment_feature_enabled
            && (entry.color_matrix.is_some() || entry.color_scale_bias.is_some());
        let color_matrix = color_adjusted && entry.color_matrix.is_some();
        let material_id = get_entity_id(&*material.read().unwrap());
        let same_light_block = match &bound_light_block {
            Some(bound) => match (bound, &entry.light_block) {
                (None, None) => true,
                (Some(a), Some(b)) => Arc::ptr_eq(a, b),
                _ => false,
            },
            None => false,
        };
        let same_renderer = bound_renderer.is_some_and(|bound| std::ptr::eq(bound, renderer));
        if !same_renderer
            || bound_material != Some(material_id)
            || !same_light_block
            || bound_skinned != Some(skinned)
            || bound_mirrored != Some(mirrored)
            || bound_color_adjustment != Some(color_adjusted)
            || bound_color_matrix != Some(color_matrix)
        {
            {
                let runtime = get_wgpu_scene3d_runtime(state);
                runtime.active_color_adjustment_run = color_adjusted;
                runtime.active_color_matrix_run = color_matrix;
                runtime.active_skinned_run = skinned;
                runtime.active_mirrored_run = mirrored;
            }
            let guard = material.read().unwrap();
            let material_ref = &*guard as &dyn flight_materials::Material;
            let block = entry.light_block.as_ref().unwrap_or(shared_light_block);
            (renderer.bind)(state, Some(material_ref), block, camera);
            bound_renderer = Some(renderer);
            bound_material = Some(material_id);
            bound_light_block = Some(entry.light_block.clone());
            bound_skinned = Some(skinned);
            bound_mirrored = Some(mirrored);
            bound_color_adjustment = Some(color_adjusted);
            bound_color_matrix = Some(color_matrix);
        }

        let skeleton = if skinned {
            mesh.skin
                .as_ref()
                .map(|skin| skin.read().unwrap().skeleton.clone())
        } else {
            None
        };
        let (joint_matrices, normal_matrices) = match &skeleton {
            Some(skeleton) => {
                let skeleton = skeleton.read().unwrap();
                (
                    Some(skeleton.joint_matrices.clone()),
                    Some(skeleton.normal_matrices.clone()),
                )
            }
            None => (None, None),
        };
        let proxy = Scene3DRenderProxy {
            alpha: Some(entry.alpha),
            color_scale_bias: if color_adjusted {
                entry.color_scale_bias.clone()
            } else {
                None
            },
            color_matrix: if color_adjusted {
                entry.color_matrix
            } else {
                None
            },
            instance_count: None,
            instance_matrices: None,
            instance_colors: None,
            joint_matrices,
            normal_matrices,
            material: material.clone(),
            normal_matrix,
            subset: entry.subset,
            world_matrix: world_matrix.clone(),
        };
        let geometry = mesh.geometry.read().unwrap();
        (renderer.draw)(state, &proxy, &geometry);
    }
}

fn draw_wgpu_scene3d_prepared(
    state: &mut WgpuRenderState,
    prepared: &PreparedScene3D,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
    forward_lights: Option<&WgpuScene3DForwardLightList>,
) {
    let list = &prepared.list;
    let light_block = &resolve_wgpu_scene3d_list_light_block(state, &list.lights);
    let view_projection = &list.view_projection;
    declare_wgpu_render_target_color_space(state, RenderTargetColorSpace::Linear);
    let has_prepared_forward_lights =
        forward_lights.is_some_and(|forward| forward.mesh_count == list.mesh_count);
    if !has_prepared_forward_lights && has_excess_forward_lights(lights) {
        let guard = get_wgpu_scene3d_runtime(state).forward_light_selection_guard;
        if let Some(guard) = guard {
            guard(state, lights);
        }
    }
    {
        let runtime = get_wgpu_scene3d_runtime(state);
        recycle_draw_entries(&mut runtime.opaque_draw_list, &mut runtime.opaque_pool);
        recycle_draw_entries(&mut runtime.blended_draw_list, &mut runtime.blended_pool);
        runtime.sort_key_counter = 0;
        runtime.renderer_sort_keys.clear();
        runtime.material_sort_keys.clear();
    }

    for (mesh_index, mesh_node) in list.visible_meshes.iter().take(list.mesh_count).enumerate() {
        let world_matrix =
            get_node_world_matrix4(mesh_node, &mut state.render_runtime_mut().node_revisions);
        let wx = world_matrix.m[12];
        let wy = world_matrix.m[13];
        let wz = world_matrix.m[14];
        let vp = &view_projection.m;
        let clip_w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
        let clip_z = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
        let object_alpha =
            get_node3d_world_alpha(mesh_node, &mut get_wgpu_scene3d_runtime(state).appearance);
        let (subsets, materials, color_scale_bias, color_matrix) = {
            let node = mesh_node.read().unwrap();
            let mesh = node
                .as_any()
                .downcast_ref::<Mesh>()
                .expect("visible meshes are Mesh nodes");
            let runtime = node.node_runtime();
            (
                mesh.geometry.read().unwrap().subsets.clone(),
                mesh.materials.read().unwrap().clone(),
                runtime.resolved_color_scale_bias.clone(),
                runtime.resolved_color_matrix,
            )
        };
        for (subset_index, subset) in subsets.iter().enumerate() {
            let material = resolve_subset_material(&materials, subset_index);
            let renderer = {
                let guard = material.as_ref().map(|material| material.read().unwrap());
                resolve_wgpu_mesh_material_renderer(
                    state,
                    guard
                        .as_deref()
                        .map(|material| material as &dyn flight_materials::Material),
                )
            };
            let Some(renderer) = renderer else {
                continue;
            };
            let resolved_material = match material {
                Some(material) => material,
                None => get_wgpu_scene3d_default_material(state),
            };
            let blended =
                is_blended_material(&*resolved_material.read().unwrap()) || object_alpha < 1.0;
            let sort_key = acquire_sort_key(state, renderer, &resolved_material);
            let runtime = get_wgpu_scene3d_runtime(state);
            let mut entry = acquire_draw_entry(if blended {
                &mut runtime.blended_pool
            } else {
                &mut runtime.opaque_pool
            });
            entry.alpha = object_alpha;
            entry.depth = clip_z / clip_w;
            entry.color_matrix = color_matrix;
            entry.color_scale_bias = color_scale_bias.clone();
            entry.light_block = if has_prepared_forward_lights {
                Some(forward_lights.unwrap().mesh_light_blocks[mesh_index].clone())
            } else {
                None
            };
            entry.material = Some(resolved_material);
            entry.mesh = Some(mesh_node.clone());
            entry.renderer = Some(renderer);
            entry.sort_key = sort_key;
            entry.subset = *subset;
            entry.world_matrix = world_matrix.clone();
            if blended {
                runtime.blended_draw_list.push(entry);
            } else {
                runtime.opaque_draw_list.push(entry);
            }
        }
    }

    let mut opaque = std::mem::take(&mut get_wgpu_scene3d_runtime(state).opaque_draw_list);
    if opaque.len() > 1 {
        opaque.sort_by_key(|entry| entry.sort_key);
    }
    draw_entries(state, &opaque, light_block, camera, false);
    get_wgpu_scene3d_runtime(state).opaque_draw_list = opaque;
    let mut blended = std::mem::take(&mut get_wgpu_scene3d_runtime(state).blended_draw_list);
    if !blended.is_empty() {
        blended.sort_by(|a, b| b.depth.total_cmp(&a.depth));
        draw_entries(state, &blended, light_block, camera, true);
    }
    get_wgpu_scene3d_runtime(state).blended_draw_list = blended;

    // Instanced meshes use a rigid, indexed path with one instance-step vertex buffer, drawn after
    // the ordinary entries because per-instance depth sorting is not representable by one draw.
    {
        let runtime = get_wgpu_scene3d_runtime(state);
        runtime.active_blended_run = false;
        runtime.active_skinned_run = false;
    }
    let color_adjustment_feature_enabled =
        get_wgpu_color_adjustment_material_feature(state).is_some();
    for mesh_node in list
        .visible_instanced_meshes
        .iter()
        .take(list.instanced_mesh_count)
    {
        let world_matrix =
            get_node_world_matrix4(mesh_node, &mut state.render_runtime_mut().node_revisions);
        let mut normal_matrix = create_matrix3();
        set_matrix3_normal_from_matrix4(&mut normal_matrix, &world_matrix);
        let object_alpha =
            get_node3d_world_alpha(mesh_node, &mut get_wgpu_scene3d_runtime(state).appearance);
        let node = mesh_node.read().unwrap();
        let mesh = node
            .as_any()
            .downcast_ref::<InstancedMesh>()
            .expect("visible instanced meshes are InstancedMesh nodes");
        let color_scale_bias = node.node_runtime().resolved_color_scale_bias.clone();
        let color_matrix = node.node_runtime().resolved_color_matrix;
        let color_adjusted = color_adjustment_feature_enabled
            && (color_matrix.is_some() || color_scale_bias.is_some());
        let flat_matrices = flatten_instanced_mesh_matrices(state, mesh);
        let materials = mesh.materials.read().unwrap().clone();
        let geometry = mesh.geometry.read().unwrap();
        for (subset_index, subset) in geometry.subsets.iter().enumerate() {
            let material = resolve_subset_material(&materials, subset_index);
            let renderer = {
                let guard = material.as_ref().map(|material| material.read().unwrap());
                resolve_wgpu_mesh_material_renderer(
                    state,
                    guard
                        .as_deref()
                        .map(|material| material as &dyn flight_materials::Material),
                )
            };
            let Some(renderer) = renderer else {
                continue;
            };
            let resolved_material = match material {
                Some(material) => material,
                None => get_wgpu_scene3d_default_material(state),
            };
            {
                let runtime = get_wgpu_scene3d_runtime(state);
                runtime.active_color_adjustment_run = color_adjusted;
                runtime.active_color_matrix_run = color_adjusted && color_matrix.is_some();
            }
            {
                let material = resolved_material.read().unwrap();
                (renderer.bind)(
                    state,
                    Some(&*material as &dyn flight_materials::Material),
                    light_block,
                    camera,
                );
            }
            let proxy = Scene3DRenderProxy {
                alpha: Some(object_alpha),
                color_scale_bias: if color_adjusted {
                    color_scale_bias.clone()
                } else {
                    None
                },
                color_matrix: if color_adjusted { color_matrix } else { None },
                instance_count: Some(mesh.instance_count.max(0) as usize),
                instance_matrices: Some(flat_matrices.clone()),
                instance_colors: None,
                joint_matrices: None,
                normal_matrices: None,
                material: resolved_material,
                normal_matrix: normal_matrix.clone(),
                subset: *subset,
                world_matrix: world_matrix.clone(),
            };
            (renderer.draw)(state, &proxy, &geometry);
        }
    }
}

// Packs each instance as its model matrix followed by its linear RGBA tint (the 20-float record the
// instance layout describes); a batch with no per-instance colours packs opaque white.
fn flatten_instanced_mesh_matrices(state: &mut WgpuRenderState, mesh: &InstancedMesh) -> Vec<f32> {
    let count = mesh.instance_count.max(0) as usize;
    let scratch = &mut get_wgpu_scene3d_runtime(state).instance_scratch;
    scratch.clear();
    scratch.resize(count * INSTANCE_RECORD_FLOATS, 0.0);
    let mut color = allocate_linear_color();
    for index in 0..count {
        let offset = index * INSTANCE_RECORD_FLOATS;
        scratch[offset..offset + 16]
            .copy_from_slice(&mesh.instance_matrices[index].read().unwrap().m);
        match &mesh.instance_colors {
            None => scratch[offset + 16..offset + 20].fill(1.0),
            Some(colors) => {
                unpack_color_to_linear(&mut color, colors[index]);
                scratch[offset + 16] = color.r;
                scratch[offset + 17] = color.g;
                scratch[offset + 18] = color.b;
                scratch[offset + 19] = color.a;
            }
        }
    }
    return scratch.clone();
}

// A material-authored blend equation applies only when alphaMode requests blending; a node fade of
// an opaque or masked material keeps the ordinary Normal equation.
fn get_material_blend_mode(material: &dyn Material3D) -> BlendMode {
    let fields = material.material3d_fields();
    if fields.alpha_mode == MaterialAlphaMode::Blend {
        return fields.blend_mode.clone();
    }
    return BLEND_MODE_NORMAL.to_string();
}

fn has_excess_forward_lights(lights: &Scene3DLightsLike) -> bool {
    return lights.point.len() > MAX_FORWARD_LIGHTS || lights.spot.len() > MAX_FORWARD_LIGHTS;
}

fn is_blended_material(material: &dyn Material3D) -> bool {
    return material.material3d_fields().alpha_mode == MaterialAlphaMode::Blend;
}

/// Whether the state's opt-in skinning adapter GPU-skins `mesh` (TS `isWgpuMeshGpuSkinned`).
pub fn is_wgpu_mesh_gpu_skinned(state: &mut WgpuRenderState, mesh: &Mesh) -> bool {
    return get_wgpu_scene3d_runtime(state)
        .skinning_adapter
        .is_some_and(|skinning| (skinning.is_gpu_skinned)(mesh));
}

fn recycle_draw_entries(
    entries: &mut Vec<WgpuScene3DDrawEntry>,
    pool: &mut Vec<WgpuScene3DDrawEntry>,
) {
    while let Some(entry) = entries.pop() {
        pool.push(entry);
    }
}

/// Draws a prepared 3D scene into the pass's target (TS `renderWgpuScene3D`): opaque and masked
/// subsets first in sort-key order, then blended or faded subsets back to front, each contiguous run
/// of one renderer + material + light block bound once; then instanced meshes, then the registered
/// 3D passes. A subset whose material resolves to no renderer is skipped.
pub fn render_wgpu_scene3d(
    pass: &mut WgpuRenderPass<'_>,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
    forward_lights: Option<&WgpuScene3DForwardLightList>,
) {
    let state = &mut *pass.state;
    prepare_scene_3d_render(state, scene, camera, lights, None);
    // The prepared frame stays where prepare left it; it is taken out for the draw so its light
    // block can be handed to renderers beside the state, and restored before the passes run.
    let prepared = state
        .render_runtime_mut()
        .prepared_scene3d
        .take()
        .expect("prepareScene3DRender leaves a prepared frame on the state");
    draw_wgpu_scene3d_prepared(state, &prepared, camera, lights, forward_lights);
    state.render_runtime_mut().prepared_scene3d = Some(prepared);

    let passes = get_wgpu_render_state_runtime(state)
        .registries
        .passes
        .clone();
    if let Some(passes) = passes {
        for pass in passes.iter() {
            pass(state, scene, camera, lights);
        }
    }
    let runtime = get_wgpu_scene3d_runtime(state);
    runtime.active_blend_mode = None;
    runtime.active_blended_run = false;
    runtime.active_color_adjustment_run = false;
    runtime.active_color_matrix_run = false;
    runtime.active_skinned_run = false;
}

// The material for a subset index: the positional materials[i] entry, or `None` when the slot is
// absent (the registry then falls back to the standard kind, or skips the subset).
fn resolve_subset_material(
    materials: &[Option<Material3DRef>],
    subset_index: usize,
) -> Option<Material3DRef> {
    return materials.get(subset_index).cloned().flatten();
}

// The frame's shared light block as a stable handle (TS: the prepared list's block object, reused
// state-owned scratch). Its content is refreshed in place, so the handle keeps its identity and the
// Frame binding keyed by it stays put across frames.
fn resolve_wgpu_scene3d_list_light_block(
    state: &mut WgpuRenderState,
    lights: &Scene3DLightBlock,
) -> Ref<Scene3DLightBlock> {
    let runtime = get_wgpu_scene3d_runtime(state);
    if let Some(existing) = &runtime.list_light_block {
        if *existing.read().unwrap() != *lights {
            existing.write().unwrap().clone_from(lights);
        }
        return existing.clone();
    }
    let block = Arc::new(RwLock::new(lights.clone()));
    runtime.list_light_block = Some(block.clone());
    return block;
}
