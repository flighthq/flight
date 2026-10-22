use flight_camera::{Camera3D, Projection, apply_oblique_near_clip_plane};
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_geometry::{
    Aabb, Matrix4, clone_aabb, copy_aabb, copy_matrix4, create_aabb, create_frustum,
    create_matrix4, is_frustum_intersecting_aabb, multiply_matrix4, set_frustum_from_matrix4,
    set_orthographic_matrix4, set_perspective_matrix4, transform_aabb_by_matrix4, union_aabb,
};
use flight_lighting::{
    AmbientLight, DirectionalLight, HemisphereLight, MAX_FORWARD_LIGHTS, PointLight,
    SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET, SCENE_LIGHT_BLOCK_FLOATS,
    SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET, SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET,
    SCENE_LIGHT_HEMISPHERE_OFFSET, SCENE_LIGHT_HEMISPHERE_STRIDE, SCENE_LIGHT_POINT_OFFSET,
    SCENE_LIGHT_POINT_STRIDE, SCENE_LIGHT_SPOT_OFFSET, SCENE_LIGHT_SPOT_STRIDE, Scene3DLightBlock,
    Scene3DLightsLike, SpotLight,
};
use flight_meshgeometry::contract::ensure_mesh_geometry_bounds;
use flight_node::contract::{get_node_world_matrix4, is_node_local_matrix4_detached};
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_scene3d::{InstancedMesh, Mesh};

use crate::{PreparedScene3D, RenderState, Scene3DGraphSyncPolicy, Scene3DRenderList};

fn create_prepared_scene_3d() -> PreparedScene3D {
    return PreparedScene3D {
        frustum: create_frustum(),
        list: Scene3DRenderList {
            instanced_mesh_count: 0,
            lights: Scene3DLightBlock {
                ambient_count: 0,
                data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
                directional_count: 0,
                hemisphere_count: 0,
                point_count: 0,
                spot_count: 0,
                version: 0,
            },
            mesh_count: 0,
            view_projection: create_matrix4(),
            visible_instanced_meshes: Vec::new(),
            visible_meshes: Vec::new(),
        },
        world_bounds: create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    };
}

fn apply_scene_3d_projection_jitter(out: &mut Matrix4, x: f32, y: f32) {
    let m = &mut out.m;
    m[0] += x * m[3];
    m[4] += x * m[7];
    m[8] += x * m[11];
    m[12] += x * m[15];
    m[1] += y * m[3];
    m[5] += y * m[7];
    m[9] += y * m[11];
    m[13] += y * m[15];
}

fn collect_visible_meshes<S: RenderState>(
    state: &mut S,
    root: &NodeRef,
    frustum: &flight_geometry::Frustum,
    world_bounds: &mut Aabb,
    refresh_transforms: bool,
    out_meshes: &mut Vec<NodeRef>,
    out_instanced_meshes: &mut Vec<NodeRef>,
) {
    let mut stack = vec![root.clone()];
    while let Some(node) = stack.pop() {
        let (enabled, visible, children, is_transform_3d) = {
            let node = node.read().unwrap();
            (
                node.node_fields().enabled,
                node.as_appearance_node()
                    .map(|value| *value.appearance().visible)
                    .unwrap_or(true),
                node.node_runtime().children.clone().unwrap_or_default(),
                node.as_transform3d_node().is_some(),
            )
        };
        if !enabled || !visible {
            continue;
        }
        if refresh_transforms && is_transform_3d && !is_node_local_matrix4_detached(&node) {
            invalidate_node_local_transform(&node);
        }
        let kind = {
            let node_guard = node.read().unwrap();
            if node_guard.as_any().is::<InstancedMesh>() {
                2
            } else if node_guard.as_any().is::<Mesh>() {
                1
            } else {
                0
            }
        };
        if kind == 2 {
            if is_instanced_mesh_visible(state, &node, frustum, world_bounds) {
                out_instanced_meshes.push(node.clone());
            }
        } else if kind == 1 && is_mesh_visible(state, &node, frustum, world_bounds) {
            out_meshes.push(node.clone());
        }
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }
}

fn is_instanced_mesh_visible<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    frustum: &flight_geometry::Frustum,
    world_bounds: &mut Aabb,
) -> bool {
    let local_bounds = {
        let node = source.read().unwrap();
        let mesh = node.as_any().downcast_ref::<InstancedMesh>().unwrap();
        if mesh.instance_count <= 0 {
            return false;
        }
        let bounds = {
            let mut geometry = mesh.geometry.write().unwrap();
            ensure_mesh_geometry_bounds(&mut geometry).cloned()
        };
        let Some(bounds) = bounds else {
            return true;
        };
        let mut out = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut scratch = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        for index in 0..mesh.instance_count as usize {
            transform_aabb_by_matrix4(
                &mut scratch,
                &bounds,
                &mesh.instance_matrices[index].read().unwrap(),
            );
            if index == 0 {
                copy_aabb(&mut out, &scratch);
            } else {
                let previous = clone_aabb(&out);
                union_aabb(&mut out, &previous, &scratch);
            }
        }
        out
    };
    let world = get_node_world_matrix4(source, &mut state.render_runtime_mut().node_revisions);
    transform_aabb_by_matrix4(world_bounds, &local_bounds, &world);
    return is_frustum_intersecting_aabb(frustum, world_bounds);
}

fn is_mesh_visible<S: RenderState>(
    state: &mut S,
    source: &NodeRef,
    frustum: &flight_geometry::Frustum,
    world_bounds: &mut Aabb,
) -> bool {
    let bounds = {
        let node = source.read().unwrap();
        let mesh = node.as_any().downcast_ref::<Mesh>().unwrap();
        let runtime_bounds = flight_scene3d::contract::get_mesh_runtime(mesh)
            .deformed_local_bounds
            .clone();
        if mesh.skin.is_some()
            && runtime_bounds.is_none()
            && let Some(guard) = state.render_registries().skinned_mesh_bounds_guard
        {
            guard(state, mesh);
        }
        match runtime_bounds {
            Some(bounds) => Some(bounds),
            None => {
                let mut geometry = mesh.geometry.write().unwrap();
                ensure_mesh_geometry_bounds(&mut geometry).cloned()
            }
        }
    };
    let Some(bounds) = bounds else {
        return true;
    };
    let world = get_node_world_matrix4(source, &mut state.render_runtime_mut().node_revisions);
    transform_aabb_by_matrix4(world_bounds, &bounds, &world);
    return is_frustum_intersecting_aabb(frustum, world_bounds);
}

fn linear_color(color: u32) -> LinearColor {
    let mut out = allocate_linear_color();
    unpack_color_to_linear(&mut out, color);
    return out;
}

fn pack_ambient_light(data: &mut [f32], ambient: &AmbientLight) {
    let color = linear_color(ambient.color);
    data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET] = color.r * ambient.intensity;
    data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 1] = color.g * ambient.intensity;
    data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 2] = color.b * ambient.intensity;
}

fn pack_directional_light(data: &mut [f32], directional: &DirectionalLight) {
    data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET] = directional.direction.x;
    data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET + 1] = directional.direction.y;
    data[SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET + 2] = directional.direction.z;
    let color = linear_color(directional.color);
    data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET] = color.r * directional.intensity;
    data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 1] = color.g * directional.intensity;
    data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 2] = color.b * directional.intensity;
}

fn pack_hemisphere_light(data: &mut [f32], offset: usize, light: &HemisphereLight) {
    let sky = linear_color(light.sky_color);
    let ground = linear_color(light.ground_color);
    data[offset] = sky.r * light.intensity;
    data[offset + 1] = sky.g * light.intensity;
    data[offset + 2] = sky.b * light.intensity;
    data[offset + 4] = ground.r * light.intensity;
    data[offset + 5] = ground.g * light.intensity;
    data[offset + 6] = ground.b * light.intensity;
    data[offset + 8] = 0.0;
    data[offset + 9] = 1.0;
    data[offset + 10] = 0.0;
}

fn pack_point_light(data: &mut [f32], offset: usize, light: &PointLight) {
    data[offset] = light.position.x;
    data[offset + 1] = light.position.y;
    data[offset + 2] = light.position.z;
    data[offset + 3] = light.range;
    let color = linear_color(light.color);
    data[offset + 4] = color.r * light.intensity;
    data[offset + 5] = color.g * light.intensity;
    data[offset + 6] = color.b * light.intensity;
    data[offset + 7] = if light.range > 0.0 {
        1.0 / (light.range * light.range)
    } else {
        0.0
    };
}

pub fn pack_scene_3d_light_block(out: &mut Scene3DLightBlock, lights: &Scene3DLightsLike) {
    let mut data = vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice();
    let directional_count = if let Some(directional) = &lights.directional {
        pack_directional_light(&mut data, &directional.read().unwrap());
        1
    } else {
        0
    };
    let ambient_count = if let Some(ambient) = &lights.ambient {
        pack_ambient_light(&mut data, &ambient.read().unwrap());
        1
    } else {
        0
    };
    let point_count = lights.point.len().min(MAX_FORWARD_LIGHTS);
    for (index, point) in lights.point.iter().take(point_count).enumerate() {
        pack_point_light(
            &mut data,
            SCENE_LIGHT_POINT_OFFSET + index * SCENE_LIGHT_POINT_STRIDE,
            &point.read().unwrap(),
        );
    }
    let spot_count = lights.spot.len().min(MAX_FORWARD_LIGHTS);
    for (index, spot) in lights.spot.iter().take(spot_count).enumerate() {
        pack_spot_light(
            &mut data,
            SCENE_LIGHT_SPOT_OFFSET + index * SCENE_LIGHT_SPOT_STRIDE,
            &spot.read().unwrap(),
        );
    }
    let hemisphere_count = lights.hemisphere.len().min(MAX_FORWARD_LIGHTS);
    for (index, hemisphere) in lights.hemisphere.iter().take(hemisphere_count).enumerate() {
        pack_hemisphere_light(
            &mut data,
            SCENE_LIGHT_HEMISPHERE_OFFSET + index * SCENE_LIGHT_HEMISPHERE_STRIDE,
            &hemisphere.read().unwrap(),
        );
    }
    if out.directional_count == directional_count
        && out.ambient_count == ambient_count
        && out.point_count == point_count
        && out.spot_count == spot_count
        && out.hemisphere_count == hemisphere_count
        && out.data.as_ref() == data.as_ref()
    {
        return;
    }
    out.data = data;
    out.directional_count = directional_count;
    out.ambient_count = ambient_count;
    out.point_count = point_count;
    out.spot_count = spot_count;
    out.hemisphere_count = hemisphere_count;
    out.version = out.version.wrapping_add(1);
}

fn pack_spot_light(data: &mut [f32], offset: usize, light: &SpotLight) {
    data[offset] = light.position.x;
    data[offset + 1] = light.position.y;
    data[offset + 2] = light.position.z;
    data[offset + 3] = light.range;
    let color = linear_color(light.color);
    data[offset + 4] = color.r * light.intensity;
    data[offset + 5] = color.g * light.intensity;
    data[offset + 6] = color.b * light.intensity;
    data[offset + 7] = if light.range > 0.0 {
        1.0 / (light.range * light.range)
    } else {
        0.0
    };
    data[offset + 8] = light.direction.x;
    data[offset + 9] = light.direction.y;
    data[offset + 10] = light.direction.z;
    data[offset + 12] = light.inner_cone_cos;
    data[offset + 13] = light.outer_cone_cos;
}

pub fn prepare_scene_3d_render<'a, S: RenderState>(
    state: &'a mut S,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
    viewport_aspect: Option<f32>,
) -> &'a Scene3DRenderList {
    let mut prepared = state
        .render_runtime_mut()
        .prepared_scene3d
        .take()
        .unwrap_or_else(create_prepared_scene_3d);
    set_scene_3d_view_projection_matrix_4(
        &mut prepared.list.view_projection,
        camera,
        resolve_scene_3d_viewport_aspect(camera, viewport_aspect),
    );
    set_frustum_from_matrix4(&mut prepared.frustum, &prepared.list.view_projection);
    pack_scene_3d_light_block(&mut prepared.list.lights, lights);
    prepared.list.visible_meshes.clear();
    prepared.list.visible_instanced_meshes.clear();
    let refresh =
        state.render_state().scene_graph_sync_policy == Scene3DGraphSyncPolicy::RefreshDerivedState;
    collect_visible_meshes(
        state,
        scene,
        &prepared.frustum,
        &mut prepared.world_bounds,
        refresh,
        &mut prepared.list.visible_meshes,
        &mut prepared.list.visible_instanced_meshes,
    );
    prepared.list.mesh_count = prepared.list.visible_meshes.len();
    prepared.list.instanced_mesh_count = prepared.list.visible_instanced_meshes.len();
    state.render_runtime_mut().prepared_scene3d = Some(prepared);
    return &state
        .render_runtime()
        .prepared_scene3d
        .as_ref()
        .unwrap()
        .list;
}

fn resolve_scene_3d_viewport_aspect(camera: &Camera3D, viewport_aspect: Option<f32>) -> f32 {
    if let Some(value) = viewport_aspect.filter(|value| value.is_finite() && *value > 0.0) {
        return value;
    }
    if let Projection::Perspective(value) = &camera.projection {
        let aspect = value.read().unwrap().aspect;
        if aspect.is_finite() && aspect > 0.0 {
            return aspect;
        }
    }
    return 1.0;
}

fn set_scene_3d_view_projection_matrix_4(out: &mut Matrix4, camera: &Camera3D, aspect: f32) {
    let mut projection = create_matrix4();
    match &camera.projection {
        Projection::Perspective(value) => {
            let value = value.read().unwrap();
            set_perspective_matrix4(
                &mut projection,
                (value.fov_y * 0.5).tan(),
                aspect,
                camera.near,
                camera.far,
            );
        }
        Projection::Raw(value) => {
            copy_matrix4(
                &mut projection,
                &value.read().unwrap().matrix.read().unwrap(),
            );
        }
        Projection::Orthographic(value) => {
            let value = value.read().unwrap();
            set_orthographic_matrix4(
                &mut projection,
                -value.half_width,
                value.half_width,
                -value.half_height,
                value.half_height,
                camera.near,
                camera.far,
            );
        }
    }
    let jitter = camera.jitter.read().unwrap();
    apply_scene_3d_projection_jitter(&mut projection, jitter.x, jitter.y);
    if let Some(plane) = &camera.near_clip_plane {
        apply_oblique_near_clip_plane(&mut projection, &plane.read().unwrap());
    }
    multiply_matrix4(out, &projection, &camera.view.read().unwrap());
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
