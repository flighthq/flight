// flight-lint: allow-file(contract-vocabulary) D17 the 3D draw walk dispatches backend-typed renderers over thread-bound render-gl state

use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_geometry::{Matrix4, create_matrix3, create_matrix4, set_matrix3_normal_from_matrix4};
use flight_lighting::{MAX_FORWARD_LIGHTS, Scene3DLightBlock, Scene3DLightsLike};
use flight_materials::{BLEND_MODE_NORMAL, Material, Material3D, Material3DRef, MaterialAlphaMode};
use flight_meshgeometry::{MeshSubset, has_mesh_geometry_skin};
use flight_node::NodeRef;
use flight_node::contract::get_node_world_matrix4;
use flight_render::{Scene3DRenderProxy, prepare_scene_3d_render};
use flight_render_gl::{
    GlMeshMaterialRenderer, GlRenderPass, GlRenderState, GlRenderTarget,
    declare_gl_render_target_color_space, enable_gl_blend_mode_support,
    get_gl_color_adjustment_material_feature, invalidate_gl_render_state_cache,
};
use flight_scene3d::{InstancedMesh, Mesh, get_node3d_world_alpha};
use flight_texture::RenderTargetColorSpace;
use glow::HasContext;

use crate::gl_mesh_material_registry::resolve_gl_mesh_material_renderer;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::{GlScene3DDrawEntry, GlScene3DForwardLightList};

// Assigns a stable integer to each unique (renderer, material) identity within one frame so entries
// sharing both sort together and the opaque pass minimizes bind() calls.
fn acquire_sort_key(
    keys: &mut HashMap<usize, u32>,
    counter: &mut u32,
    renderer: &'static GlMeshMaterialRenderer,
    material: &Material3DRef,
) -> u32 {
    let renderer_key = renderer as *const GlMeshMaterialRenderer as usize;
    let material_key = Arc::as_ptr(material) as *const () as usize;
    let rk = *keys.entry(renderer_key).or_insert_with(|| {
        let value = *counter;
        *counter += 1;
        value
    });
    let mk = *keys.entry(material_key).or_insert_with(|| {
        let value = *counter;
        *counter += 1;
        value
    });
    return rk * 65536 + mk;
}

// Takes from the per-runtime pool or allocates a fresh entry.
fn acquire_draw_entry(pool: &mut Vec<GlScene3DDrawEntry>) -> GlScene3DDrawEntry {
    return pool.pop().unwrap_or_else(create_draw_entry);
}

// Applies a material's fixed-function blend equation at the same run boundary as its renderer bind,
// through render-gl's canonical, overridable blend registry (enabled lazily). A faded opaque/masked
// material uses Normal because blendMode is only meaningful for alphaMode 'blend'.
fn apply_gl_surface_blend_mode(state: &mut GlRenderState, material: &dyn Material3D) {
    let surface = material.material3d_fields();
    let blend_mode = if surface.alpha_mode == MaterialAlphaMode::Blend {
        surface.blend_mode.clone()
    } else {
        BLEND_MODE_NORMAL.to_string()
    };
    if state.apply_blend_mode.is_none() {
        enable_gl_blend_mode_support(state);
    }
    if let Some(apply) = state.apply_blend_mode {
        apply(state, Some(&blend_mode));
    }
}

fn create_draw_entry() -> GlScene3DDrawEntry {
    return GlScene3DDrawEntry {
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

// Draws one pass's entries: binds once per contiguous run sharing renderer, material, light block,
// skinned-ness and color-adjustment variant, then draws each subset from the reused proxy.
fn draw_gl_scene3d_entries(
    state: &mut GlRenderState,
    entries: &[GlScene3DDrawEntry],
    camera: &Camera3D,
    proxy: &mut Scene3DRenderProxy,
    color_adjustment_feature_enabled: bool,
    blended: bool,
) {
    let mut bound_material: Option<usize> = None;
    let mut bound_light_block: Option<usize> = None;
    let mut bound_renderer: Option<usize> = None;
    let mut bound_skinned: Option<bool> = None;
    let mut bound_color_adjustment: Option<bool> = None;
    let mut bound_color_matrix: Option<bool> = None;
    let mut normal_matrix = create_matrix3();

    for entry in entries {
        let (Some(renderer), Some(material), Some(light_block), Some(mesh_node)) = (
            entry.renderer,
            entry.material.as_ref(),
            entry.light_block.as_ref(),
            entry.mesh.as_ref(),
        ) else {
            continue;
        };
        set_matrix3_normal_from_matrix4(&mut normal_matrix, &entry.world_matrix);

        let mesh_guard = mesh_node.read().unwrap();
        let Some(mesh) = as_mesh(&*mesh_guard) else {
            continue;
        };
        // A skinned run selects the HAS_SKIN program variant; split runs on it.
        let skinned = is_gpu_skinned_draw(state, mesh);
        let color_adjusted = color_adjustment_feature_enabled
            && (entry.color_matrix.is_some() || entry.color_scale_bias.is_some());
        let color_matrix = color_adjusted && entry.color_matrix.is_some();
        let renderer_key = renderer as *const GlMeshMaterialRenderer as usize;
        let material_key = Arc::as_ptr(material) as *const () as usize;
        let light_block_key = Rc::as_ptr(light_block) as usize;
        if Some(renderer_key) != bound_renderer
            || Some(material_key) != bound_material
            || Some(light_block_key) != bound_light_block
            || Some(skinned) != bound_skinned
            || Some(color_adjusted) != bound_color_adjustment
            || Some(color_matrix) != bound_color_matrix
        {
            let material_guard = material.read().unwrap();
            if blended {
                apply_gl_surface_blend_mode(state, &*material_guard);
            }
            {
                let mut runtime = get_gl_scene3d_runtime(state);
                runtime.active_color_adjustment_run = color_adjusted;
                runtime.active_color_matrix_run = color_matrix;
                runtime.active_skinned_run = skinned;
            }
            (renderer.bind)(state, Some(&*material_guard), light_block, camera);
            bound_renderer = Some(renderer_key);
            bound_material = Some(material_key);
            bound_light_block = Some(light_block_key);
            bound_skinned = Some(skinned);
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
        proxy.alpha = Some(entry.alpha);
        proxy.color_scale_bias = if color_adjusted {
            entry.color_scale_bias.clone()
        } else {
            None
        };
        proxy.color_matrix = if color_adjusted {
            entry.color_matrix
        } else {
            None
        };
        proxy.joint_matrices = skeleton
            .as_ref()
            .map(|skeleton| skeleton.read().unwrap().joint_matrices.clone());
        proxy.normal_matrices = skeleton
            .as_ref()
            .map(|skeleton| skeleton.read().unwrap().normal_matrices.clone());
        proxy.material = material.clone();
        proxy.normal_matrix.m = normal_matrix.m;
        proxy.subset = entry.subset;
        proxy.world_matrix.m = entry.world_matrix.m;
        let geometry = mesh.geometry.clone();
        drop(mesh_guard);
        (renderer.draw)(state, proxy, &geometry.read().unwrap());
    }
}

// Unpacks the batch's packed sRGB instance colours into the linear RGBA the shaders multiply. A batch
// with no colours yields opaque white, so the multiply is an identity.
fn flatten_instanced_mesh_colors(out: &mut Vec<f32>, mesh: &InstancedMesh) {
    let count = mesh.instance_count.max(0) as usize;
    out.clear();
    out.resize(count * 4, 1.0);
    let Some(colors) = &mesh.instance_colors else {
        return;
    };
    let mut linear: LinearColor = allocate_linear_color();
    for i in 0..count {
        unpack_color_to_linear(&mut linear, colors[i]);
        out[i * 4] = linear.r;
        out[i * 4 + 1] = linear.g;
        out[i * 4 + 2] = linear.b;
        out[i * 4 + 3] = linear.a;
    }
}

fn flatten_instanced_mesh_matrices(out: &mut Vec<f32>, mesh: &InstancedMesh) {
    let count = mesh.instance_count.max(0) as usize;
    out.clear();
    out.resize(count * 16, 0.0);
    for i in 0..count {
        out[i * 16..i * 16 + 16].copy_from_slice(&mesh.instance_matrices[i].read().unwrap().m);
    }
}

fn as_mesh(node: &dyn flight_node::Node) -> Option<&Mesh> {
    let any = node.as_any();
    if let Some(mesh) = any.downcast_ref::<Mesh>() {
        return Some(mesh);
    }
    return any.downcast_ref::<InstancedMesh>().map(|mesh| &**mesh);
}

fn has_excess_forward_lights(lights: &Scene3DLightsLike) -> bool {
    return lights.point.len() > MAX_FORWARD_LIGHTS || lights.spot.len() > MAX_FORWARD_LIGHTS;
}

// True when a mesh should be GPU-skinned this draw: it carries a skin, its geometry has the
// joints0/weights0 channels, and the skinning capability is registered (an unregistered state never
// selects a HAS_SKIN variant; the mesh draws at its bind pose).
fn is_gpu_skinned_draw(state: &GlRenderState, mesh: &Mesh) -> bool {
    if get_gl_scene3d_runtime(state).mesh_skin_feature.is_none() {
        return false;
    }
    return mesh.skin.is_some() && has_mesh_geometry_skin(&mesh.geometry.read().unwrap());
}

// Returns last frame's entries to their per-state pool before the lists are rebuilt.
fn recycle_draw_entries(entries: &mut Vec<GlScene3DDrawEntry>, pool: &mut Vec<GlScene3DDrawEntry>) {
    while let Some(entry) = entries.pop() {
        pool.push(entry);
    }
}

// Draws a prepared 3D scene on the GL backend. prepare_scene_3d_render resolves world matrices, the
// camera view-projection, frustum culling and the packed light block into the per-state render list;
// for each visible Mesh, each geometry subset draws with its resolved material's registered
// mesh-material renderer.
//
// The draw is two-phased for correct alpha compositing: pass 1 draws every opaque/mask subset sorted by
// material (depth writes on, no blending); pass 2 draws every blended subset (alphaMode 'blend' or a
// faded object) back-to-front with blending enabled and depth writes off, each material's blendMode
// selecting its fixed-function equation. Instanced meshes draw in a third pass, then the registered
// GlScene3DPass hooks run. Subsets sharing renderer + material draw under one bind; a subset whose
// material resolves to no renderer is skipped.
//
// The render target is declared 'linear' (scene materials output linear HDR radiance): `target` is
// the destination the pass was begun on, which render-gl's declaration requires explicitly; with no
// target (drawing straight to the canvas) the opt-in color-space guard reports the un-encoded output.
// flight-lint: allow(conform-params) D17 the render state and the pass's destination target are explicit arguments; a native GlRenderPass handle carries neither
pub fn render_gl_scene3d(
    state: &mut GlRenderState,
    _pass: &GlRenderPass,
    target: Option<&mut dyn GlRenderTarget>,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
    forward_lights: Option<&GlScene3DForwardLightList>,
) {
    let aspect = get_gl_scene3d_viewport_aspect(state);
    let (visible_meshes, visible_instanced_meshes, view_projection, list_lights) = {
        let list = prepare_scene_3d_render(state, scene, camera, lights, Some(aspect));
        (
            list.visible_meshes[..list.mesh_count].to_vec(),
            list.visible_instanced_meshes[..list.instanced_mesh_count].to_vec(),
            list.view_projection.m,
            list.lights.clone(),
        )
    };
    let mesh_count = visible_meshes.len();
    let light_block = resolve_gl_scene3d_list_light_block(state, list_lights);

    get_gl_scene3d_runtime(state).active_blended_run = false;
    let prepared_forward_lights = forward_lights.filter(|value| value.mesh_count == mesh_count);
    if prepared_forward_lights.is_none() && has_excess_forward_lights(lights) {
        let guard = get_gl_scene3d_runtime(state).forward_light_selection_guard;
        if let Some(guard) = guard {
            guard(state, lights);
        }
    }

    let declared = match target {
        Some(target) => {
            declare_gl_render_target_color_space(state, target, RenderTargetColorSpace::Linear)
        }
        None => false,
    };
    if !declared {
        let guard = get_gl_scene3d_runtime(state).color_space_guard;
        if let Some(guard) = guard {
            guard(state);
        }
    }

    let (mut opaque_draw_list, mut blended_draw_list, mut opaque_pool, mut blended_pool) = {
        let mut runtime = get_gl_scene3d_runtime(state);
        (
            std::mem::take(&mut runtime.opaque_draw_list),
            std::mem::take(&mut runtime.blended_draw_list),
            std::mem::take(&mut runtime.opaque_pool),
            std::mem::take(&mut runtime.blended_pool),
        )
    };
    recycle_draw_entries(&mut opaque_draw_list, &mut opaque_pool);
    recycle_draw_entries(&mut blended_draw_list, &mut blended_pool);
    let mut sort_keys: HashMap<usize, u32> = HashMap::new();
    let mut sort_key_counter = 0_u32;
    let default_material = get_gl_scene3d_runtime(state).default_material.clone();

    // Morph and skin palettes are readied by the app before prepare; a mesh that reaches this draw
    // undeformed is a missing-prepare-call bug the opt-in deform guard reports.
    let deform_guard = get_gl_scene3d_runtime(state).deform_guard;
    for (m, mesh_node) in visible_meshes.iter().enumerate() {
        if let Some(guard) = deform_guard {
            let guard_node = mesh_node.read().unwrap();
            if let Some(mesh) = as_mesh(&*guard_node) {
                guard(state, mesh);
            }
        }
        let world_matrix = get_node_world_matrix4(mesh_node, &mut state.runtime.node_revisions);
        // The mesh origin's projected depth: larger Z/W = farther from the camera in GL NDC.
        let wx = world_matrix.m[12];
        let wy = world_matrix.m[13];
        let wz = world_matrix.m[14];
        let vp = &view_projection;
        let clip_w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
        let clip_z = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];

        // Resolved per-object opacity (parent×self), constant across a mesh's subsets.
        let object_alpha = {
            let mut runtime = get_gl_scene3d_runtime(state);
            get_node3d_world_alpha(mesh_node, &mut runtime.appearance)
        };
        let node_guard = mesh_node.read().unwrap();
        let color_scale_bias = node_guard.node_runtime().resolved_color_scale_bias.clone();
        let color_matrix = node_guard.node_runtime().resolved_color_matrix;
        let Some(mesh) = as_mesh(&*node_guard) else {
            continue;
        };
        let subsets = mesh.geometry.read().unwrap().subsets.clone();
        let materials = mesh.materials.read().unwrap().clone();
        drop(node_guard);

        for (s, subset) in subsets.iter().enumerate() {
            let material = materials.get(s).cloned().flatten();
            let renderer = match &material {
                Some(material) => {
                    let guard = material.read().unwrap();
                    resolve_gl_mesh_material_renderer(state, Some(&*guard as &dyn Material))
                }
                None => resolve_gl_mesh_material_renderer(state, None),
            };
            let Some(renderer) = renderer else {
                continue;
            };
            let resolved_material = material.unwrap_or_else(|| default_material.clone());
            let is_blended = resolved_material.read().unwrap().material3d_fields().alpha_mode
                == MaterialAlphaMode::Blend
                || object_alpha < 1.0;
            let mut entry = acquire_draw_entry(if is_blended {
                &mut blended_pool
            } else {
                &mut opaque_pool
            });
            entry.alpha = object_alpha;
            entry.color_matrix = color_matrix;
            entry.color_scale_bias = color_scale_bias.clone();
            entry.depth = clip_z / clip_w;
            entry.light_block = Some(match prepared_forward_lights {
                Some(forward) => forward.mesh_light_blocks[m].clone(),
                None => light_block.clone(),
            });
            entry.mesh = Some(mesh_node.clone());
            entry.sort_key =
                acquire_sort_key(&mut sort_keys, &mut sort_key_counter, renderer, &resolved_material);
            entry.material = Some(resolved_material);
            entry.renderer = Some(renderer);
            entry.subset = *subset;
            entry.world_matrix.m = world_matrix.m;
            if is_blended {
                blended_draw_list.push(entry);
            } else {
                opaque_draw_list.push(entry);
            }
        }
    }

    // Sort the opaque list by material so the bind elision fires maximally (stable, as TS sort).
    if opaque_draw_list.len() > 1 {
        opaque_draw_list.sort_by_key(|entry| entry.sort_key);
    }

    let color_adjustment_feature_enabled = get_gl_color_adjustment_material_feature(state).is_some();
    let mut proxy = Scene3DRenderProxy {
        alpha: None,
        color_scale_bias: None,
        color_matrix: None,
        instance_count: None,
        instance_matrices: None,
        instance_colors: None,
        joint_matrices: None,
        normal_matrices: None,
        material: default_material.clone(),
        normal_matrix: create_matrix3(),
        subset: MeshSubset {
            index_count: 0,
            index_offset: 0,
        },
        world_matrix: create_matrix4(),
    };

    // Pass 1: opaque + mask subsets sorted by material. No blending; depth-write on (set by bind).
    draw_gl_scene3d_entries(
        state,
        &opaque_draw_list,
        camera,
        &mut proxy,
        color_adjustment_feature_enabled,
        false,
    );

    // Pass 2: blended subsets back-to-front (descending projected depth), blending enabled.
    if !blended_draw_list.is_empty() {
        blended_draw_list.sort_by(|a, b| {
            b.depth
                .partial_cmp(&a.depth)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        get_gl_scene3d_runtime(state).active_blended_run = true;
        // SAFETY: fixed-function state changes run on the owning GL thread.
        unsafe { state.gl.enable(glow::BLEND) };
        draw_gl_scene3d_entries(
            state,
            &blended_draw_list,
            camera,
            &mut proxy,
            color_adjustment_feature_enabled,
            true,
        );
        // SAFETY: fixed-function state changes run on the owning GL thread.
        unsafe { state.gl.disable(glow::BLEND) };
    }

    // Restore the run flag consumed by future material binds and the actual GL depth mask,
    // unconditionally, so an empty/opaque-only scene also repairs a mask left by an earlier pass.
    get_gl_scene3d_runtime(state).active_blended_run = false;
    // SAFETY: fixed-function state changes run on the owning GL thread.
    unsafe { state.gl.depth_mask(true) };

    // Pass 3: instanced meshes, one instanced draw per subset with the instance palettes.
    if !visible_instanced_meshes.is_empty() {
        {
            let mut runtime = get_gl_scene3d_runtime(state);
            runtime.active_instanced_run = true;
            runtime.active_skinned_run = false;
        }
        let mut flat_matrices: Vec<f32> = Vec::new();
        let mut flat_colors: Vec<f32> = Vec::new();
        let mut normal_matrix = create_matrix3();
        for mesh_node in &visible_instanced_meshes {
            let world_matrix: Matrix4 =
                get_node_world_matrix4(mesh_node, &mut state.runtime.node_revisions);
            set_matrix3_normal_from_matrix4(&mut normal_matrix, &world_matrix);
            let object_alpha = {
                let mut runtime = get_gl_scene3d_runtime(state);
                get_node3d_world_alpha(mesh_node, &mut runtime.appearance)
            };
            let node_guard = mesh_node.read().unwrap();
            let color_scale_bias = node_guard.node_runtime().resolved_color_scale_bias.clone();
            let color_matrix = node_guard.node_runtime().resolved_color_matrix;
            let color_adjusted = color_adjustment_feature_enabled
                && (color_matrix.is_some() || color_scale_bias.is_some());
            let color_matrix_flag = color_adjusted && color_matrix.is_some();
            let Some(mesh) = node_guard.as_any().downcast_ref::<InstancedMesh>() else {
                continue;
            };
            flatten_instanced_mesh_matrices(&mut flat_matrices, mesh);
            flatten_instanced_mesh_colors(&mut flat_colors, mesh);
            let instance_count = mesh.instance_count.max(0) as usize;
            let geometry = mesh.geometry.clone();
            let subsets = geometry.read().unwrap().subsets.clone();
            let materials = mesh.materials.read().unwrap().clone();
            drop(node_guard);

            for (s, subset) in subsets.iter().enumerate() {
                let material = materials.get(s).cloned().flatten();
                let renderer = match &material {
                    Some(material) => {
                        let guard = material.read().unwrap();
                        resolve_gl_mesh_material_renderer(state, Some(&*guard as &dyn Material))
                    }
                    None => resolve_gl_mesh_material_renderer(state, None),
                };
                let Some(renderer) = renderer else {
                    continue;
                };
                let resolved_material = material.unwrap_or_else(|| default_material.clone());
                {
                    let mut runtime = get_gl_scene3d_runtime(state);
                    runtime.active_color_adjustment_run = color_adjusted;
                    runtime.active_color_matrix_run = color_matrix_flag;
                }
                {
                    let material_guard = resolved_material.read().unwrap();
                    (renderer.bind)(state, Some(&*material_guard), &light_block, camera);
                }
                proxy.alpha = Some(object_alpha);
                proxy.color_scale_bias = if color_adjusted {
                    color_scale_bias.clone()
                } else {
                    None
                };
                proxy.color_matrix = if color_adjusted { color_matrix } else { None };
                proxy.instance_count = Some(instance_count);
                proxy.instance_matrices = Some(flat_matrices.clone());
                proxy.instance_colors = Some(flat_colors.clone());
                proxy.joint_matrices = None;
                proxy.normal_matrices = None;
                proxy.material = resolved_material;
                proxy.normal_matrix.m = normal_matrix.m;
                proxy.subset = *subset;
                proxy.world_matrix.m = world_matrix.m;
                (renderer.draw)(state, &proxy, &geometry.read().unwrap());
            }
        }
        get_gl_scene3d_runtime(state).active_instanced_run = false;
        proxy.instance_count = Some(0);
        proxy.instance_matrices = None;
        proxy.instance_colors = None;
    }

    {
        let mut runtime = get_gl_scene3d_runtime(state);
        runtime.opaque_draw_list = opaque_draw_list;
        runtime.blended_draw_list = blended_draw_list;
        runtime.opaque_pool = opaque_pool;
        runtime.blended_pool = blended_pool;
    }

    if let Some(passes) = state.gl_registries.passes.clone() {
        for pass in passes.iter() {
            pass(state, scene, camera, lights);
        }
    }

    // Mesh/skybox/shadow binds issued raw program/blend/framebuffer calls render-gl's binding cache
    // did not observe; invalidate it so the next render-gl operation re-binds from scratch.
    invalidate_gl_render_state_cache(state);
}

// The frame's shared light block: the prepared list's block, retained across frames while its
// content version is unchanged so per-program light uploads stay elided (TS: the list is reused
// state-owned scratch with a stable identity).
fn resolve_gl_scene3d_list_light_block(
    state: &GlRenderState,
    lights: Scene3DLightBlock,
) -> Rc<Scene3DLightBlock> {
    let mut runtime = get_gl_scene3d_runtime(state);
    if let Some(existing) = &runtime.list_light_block {
        if **existing == lights {
            return existing.clone();
        }
    }
    let block = Rc::new(lights);
    runtime.list_light_block = Some(block.clone());
    return block;
}
