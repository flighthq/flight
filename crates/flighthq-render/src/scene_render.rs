//! The backend-agnostic 3D scene preparation pass.
//!
//! Ports the TS `@flighthq/render` `sceneRender.ts`: [`pack_scene_light_block`]
//! resolves the draw-argument lights into the GPU-ready [`SceneLightBlock`], and
//! [`prepare_scene_render`] walks the scene hierarchy to produce the per-state
//! [`SceneRenderList`] — the view-projection, the packed light block, and the
//! frustum-culled visible meshes — that a backend `draw_scene` consumes.
//!
//! It is pure CPU logic (no GPU context), the 3D analog of the 2D
//! `prepare_display_object_render` pass.
//!
//! TS↔Rust divergence: the TS scene graph is an object hierarchy, so
//! `prepareSceneRender(state, scene, camera, lights)` threads a single `scene`
//! node reference. The Rust scene graph is a two-arena slotmap model (the
//! `SceneArena` of node data plus the `flighthq-node` `HierarchyArena` of parent
//! /child links), so the scene is passed as `(scene_arena, hierarchy,
//! scene_root)`. `SceneRenderList::visible_meshes` therefore holds the arena
//! [`NodeId`] of each visible mesh rather than a `Mesh` object reference; a
//! backend resolves the payload through `scene_arena[node].mesh`.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{
    is_frustum_intersecting_aabb, set_frustum_from_matrix4, transform_aabb_by_matrix4,
};
use flighthq_materials::{create_linear_color, unpack_color_to_linear};
use flighthq_node::{HierarchyArena, NodeId, get_node_children};
use flighthq_scene::{SceneArena, get_scene_node_world_matrix};
use flighthq_types::{
    Aabb, AmbientLight, Camera, DirectionalLight, FrustumLike, Matrix4, Matrix4Like, Projection,
    SceneLightBlock, SceneLights,
};

use crate::render_state::{RenderStateId, RenderStateStore, get_render_state_runtime_mut};

/// Packs the directional + ambient draw-arg lights into `out` (the GPU-ready
/// light block), converting each packed sRGB color to linear, premultiplied
/// radiance (`unpack_color_to_linear(color) * intensity`) so the shader never
/// sees sRGB. Sets the presence counts (0 or 1 each) and bumps `version` so a
/// backend can skip re-uploading an unchanged block.
///
/// The float layout matches the shader's std140 light block: directional
/// `{ direction.xyz @0, _pad, radiance.rgb @4, _pad }` then ambient
/// `{ radiance.rgb @8, _pad }`. An absent term leaves its slots zeroed.
pub fn pack_scene_light_block(out: &mut SceneLightBlock, lights: &SceneLights) {
    for value in out.data.iter_mut() {
        *value = 0.0;
    }

    if let Some(directional) = &lights.directional {
        pack_directional_light(&mut out.data, directional);
        out.directional_count = 1;
    } else {
        out.directional_count = 0;
    }

    if let Some(ambient) = &lights.ambient {
        pack_ambient_light(&mut out.data, ambient);
        out.ambient_count = 1;
    } else {
        out.ambient_count = 0;
    }

    out.version += 1;
}

/// The per-frame preparation pass for a 3D scene, the 3D analog of
/// `prepare_display_object_render`. It is backend-agnostic (no GPU context): it
/// walks the scene hierarchy rooted at `scene_root`, resolves each node's world
/// matrix, computes the draw camera's view-projection, frustum-culls every Mesh
/// against its world-space bounds, and packs `lights` into the shared
/// [`SceneLightBlock`] (sRGB->linear at pack time). The returned
/// [`SceneRenderList`] is the render-ready frame the backend `draw_scene`
/// consumes — it only has to upload buffers, bind, and draw the visible meshes.
///
/// A perspective camera supplies its own aspect through its projection; when the
/// projection's aspect is zero this falls back to a neutral `1`. The returned
/// list is reused scratch owned per render state (a `gl` state and a `wgpu` state
/// prepare independently); a caller must not retain it past the `draw_scene` it
/// feeds.
pub fn prepare_scene_render<'a>(
    store: &'a mut RenderStateStore,
    state: RenderStateId,
    scene_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    scene_root: NodeId,
    camera: &Camera,
    lights: &SceneLights,
) -> &'a SceneRenderList {
    let runtime = get_render_state_runtime_mut(store, state);
    let prepared = runtime
        .prepared_scene
        .get_or_insert_with(PreparedScene::new);

    // A perspective projection carries its own aspect (viewport width / height);
    // when unset (zero) fall back to the neutral aspect. Orthographic ignores it.
    let aspect = match &camera.projection {
        Projection::Perspective(perspective) if perspective.aspect != 0.0 => perspective.aspect,
        _ => DEFAULT_VIEWPORT_ASPECT,
    };
    let mut view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut view_projection, camera, aspect);
    prepared.list.view_projection.m = view_projection.m;
    set_frustum_from_matrix4(&mut prepared.frustum, &view_projection);

    pack_scene_light_block(&mut prepared.list.lights, lights);

    prepared.list.visible_meshes.clear();
    collect_visible_meshes(
        scene_arena,
        hierarchy,
        scene_root,
        &prepared.frustum,
        &mut prepared.world_bounds,
        &mut prepared.list.visible_meshes,
    );
    prepared.list.mesh_count = prepared.list.visible_meshes.len();

    &prepared.list
}

/// The render-ready frame [`prepare_scene_render`] produces and a backend
/// `draw_scene` consumes: the camera `view_projection`, the packed `lights`
/// block, and the frustum-culled `visible_meshes` (their arena [`NodeId`]s, in
/// depth-first order). `mesh_count` mirrors `visible_meshes.len()`.
#[derive(Clone, Debug, Default)]
pub struct SceneRenderList {
    pub lights: SceneLightBlock,
    pub mesh_count: usize,
    pub view_projection: Matrix4,
    pub visible_meshes: Vec<NodeId>,
}

// Appends every visible Mesh leaf in the subtree rooted at `node` to `out`,
// depth-first. Disabled nodes (and their whole subtree) are skipped; a node is a
// drawable Mesh when it carries a mesh payload (structural, so a custom-kind mesh
// still draws). `world_bounds` is shared scratch reused across nodes.
fn collect_visible_meshes(
    scene_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    node: NodeId,
    frustum: &FrustumLike,
    world_bounds: &mut Aabb,
    out: &mut Vec<NodeId>,
) {
    if !scene_arena[node].enabled {
        return;
    }

    if scene_arena[node].mesh.is_some()
        && is_mesh_visible(scene_arena, hierarchy, node, frustum, world_bounds)
    {
        out.push(node);
    }

    for child in get_node_children(hierarchy, node) {
        collect_visible_meshes(scene_arena, hierarchy, child, frustum, world_bounds, out);
    }
}

// Transforms the mesh's local geometry bounds by its world matrix into
// `world_bounds` and tests them against `frustum`. A mesh whose geometry has no
// cached local bounds cannot be culled, so it is conservatively kept.
fn is_mesh_visible(
    scene_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    node: NodeId,
    frustum: &FrustumLike,
    world_bounds: &mut Aabb,
) -> bool {
    // Read the Copy local bounds first so the immutable arena borrow is released
    // before the world-matrix walk mutates the arena's cached world transforms.
    let bounds = scene_arena[node].mesh.as_ref().unwrap().geometry.bounds;
    match bounds {
        None => true,
        Some(local) => {
            let world = Matrix4Like {
                m: get_scene_node_world_matrix(scene_arena, hierarchy, node).m,
            };
            transform_aabb_by_matrix4(world_bounds, &local, &world);
            is_frustum_intersecting_aabb(frustum, world_bounds)
        }
    }
}

fn pack_ambient_light(data: &mut [f32], ambient: &AmbientLight) {
    let mut color = create_linear_color();
    unpack_color_to_linear(&mut color, ambient.color);
    let intensity = ambient.intensity as f64;
    data[8] = (color[0] * intensity) as f32;
    data[9] = (color[1] * intensity) as f32;
    data[10] = (color[2] * intensity) as f32;
}

fn pack_directional_light(data: &mut [f32], directional: &DirectionalLight) {
    data[0] = directional.direction.x;
    data[1] = directional.direction.y;
    data[2] = directional.direction.z;
    let mut color = create_linear_color();
    unpack_color_to_linear(&mut color, directional.color);
    let intensity = directional.intensity as f64;
    data[4] = (color[0] * intensity) as f32;
    data[5] = (color[1] * intensity) as f32;
    data[6] = (color[2] * intensity) as f32;
}

/// The per-render-state prepared frame: the reused [`SceneRenderList`] plus the
/// scratch the prepare pass fills (the culling frustum and a world-bounds
/// scratch). Held as a runtime slot on `RenderStateRuntime`, mirroring the TS
/// `WeakMap<RenderState, PreparedScene>` per-state cache.
pub(crate) struct PreparedScene {
    pub(crate) frustum: FrustumLike,
    pub(crate) list: SceneRenderList,
    pub(crate) world_bounds: Aabb,
}

impl PreparedScene {
    pub(crate) fn new() -> Self {
        Self {
            frustum: FrustumLike::default(),
            list: SceneRenderList::default(),
            world_bounds: Aabb::default(),
        }
    }
}

// Neutral viewport aspect used when a perspective camera does not carry its own.
const DEFAULT_VIEWPORT_ASPECT: f32 = 1.0;

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use flighthq_camera::{
        create_camera, create_perspective_projection, set_camera_view_matrix4_from_look_at,
    };
    use flighthq_geometry::create_vector3;
    use flighthq_lighting::{
        AmbientLightOptions, DirectionalLightOptions, create_ambient_light,
        create_directional_light,
    };
    use flighthq_materials::unpack_color_to_linear;
    use flighthq_mesh::{compute_mesh_geometry_bounds, create_box_mesh_geometry};
    use flighthq_node::{HierarchyArena, HierarchyNode, NodeId, add_node_child};
    use flighthq_scene::{SceneArena, create_mesh, create_scene};
    use flighthq_types::{Aabb, Entity, KindId, Material, MeshGeometry, SceneLights, Vector3Like};

    use super::*;
    use crate::render_state::{RenderStateStore, create_render_state};

    fn close(a: f32, b: f32) {
        assert!((a - b).abs() < 1e-4, "{a} not close to {b}");
    }

    // A boxed geometry with cached local bounds (side 2, centered: [-1, 1]).
    fn bounded_box() -> Arc<MeshGeometry> {
        let mut geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        geometry.bounds = Some(bounds);
        Arc::new(geometry)
    }

    // Camera at (0,0,10) looking at the origin, 60-degree vertical FOV.
    fn front_camera() -> Camera {
        let mut camera = create_camera(
            0.1,
            100.0,
            create_perspective_projection(std::f32::consts::PI / 3.0, 1.0),
        );
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 10.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        camera
    }

    fn empty_lights() -> SceneLights {
        SceneLights::default()
    }

    // Allocates a scene-node kind entry in both arenas at aligned keys.
    fn push_scene(scene_arena: &mut SceneArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let node = create_scene(scene_arena, None);
        let key = hierarchy.insert(HierarchyNode::default());
        assert_eq!(node, key, "arena key alignment required");
        node
    }

    fn push_mesh(
        scene_arena: &mut SceneArena,
        hierarchy: &mut HierarchyArena,
        geometry: Arc<MeshGeometry>,
        materials: Vec<Option<Arc<dyn Material>>>,
    ) -> NodeId {
        let node = create_mesh(scene_arena, geometry, materials, None);
        let key = hierarchy.insert(HierarchyNode::default());
        assert_eq!(node, key, "arena key alignment required");
        node
    }

    #[derive(Debug)]
    struct TestMaterial;
    impl Entity for TestMaterial {}
    impl Material for TestMaterial {
        fn kind(&self) -> KindId {
            KindId::of::<TestMaterial>()
        }
    }

    mod pack_scene_light_block {
        use super::*;

        #[test]
        fn zeroes_the_block_and_clears_counts_when_no_lights_are_present() {
            let mut block = SceneLightBlock::default();
            block.data[0] = 5.0;
            pack_scene_light_block(&mut block, &empty_lights());
            assert_eq!(block.directional_count, 0);
            assert_eq!(block.ambient_count, 0);
            assert_eq!(block.data[0], 0.0);
        }

        #[test]
        fn packs_the_directional_direction_and_linear_premultiplied_radiance() {
            let mut block = SceneLightBlock::default();
            let directional = create_directional_light(&DirectionalLightOptions {
                color: 0xffffffff,
                direction: Some(Vector3Like {
                    x: 0.0,
                    y: -1.0,
                    z: 0.0,
                }),
                intensity: 2.0,
                ..Default::default()
            });
            pack_scene_light_block(
                &mut block,
                &SceneLights {
                    ambient: None,
                    directional: Some(directional),
                },
            );
            assert_eq!(block.directional_count, 1);
            close(block.data[0], 0.0);
            close(block.data[1], -1.0);
            close(block.data[2], 0.0);
            let mut expected = [0.0f64; 4];
            unpack_color_to_linear(&mut expected, 0xffffffff);
            close(block.data[4], (expected[0] * 2.0) as f32);
            close(block.data[5], (expected[1] * 2.0) as f32);
            close(block.data[6], (expected[2] * 2.0) as f32);
        }

        #[test]
        fn packs_the_ambient_radiance_into_the_ambient_slot() {
            let mut block = SceneLightBlock::default();
            let ambient = create_ambient_light(&AmbientLightOptions {
                color: 0xffffffff,
                intensity: 0.5,
            });
            pack_scene_light_block(
                &mut block,
                &SceneLights {
                    ambient: Some(ambient),
                    directional: None,
                },
            );
            assert_eq!(block.ambient_count, 1);
            let mut expected = [0.0f64; 4];
            unpack_color_to_linear(&mut expected, 0xffffffff);
            close(block.data[8], (expected[0] * 0.5) as f32);
            close(block.data[9], (expected[1] * 0.5) as f32);
            close(block.data[10], (expected[2] * 0.5) as f32);
        }

        #[test]
        fn bumps_version_on_every_pack() {
            let mut block = SceneLightBlock::default();
            pack_scene_light_block(&mut block, &empty_lights());
            let v = block.version;
            pack_scene_light_block(&mut block, &empty_lights());
            assert_eq!(block.version, v + 1);
        }

        #[test]
        fn decodes_srgb_color_to_linear() {
            let mut block = SceneLightBlock::default();
            let ambient = create_ambient_light(&AmbientLightOptions {
                color: 0x808080ff,
                intensity: 1.0,
            });
            pack_scene_light_block(
                &mut block,
                &SceneLights {
                    ambient: Some(ambient),
                    directional: None,
                },
            );
            assert!(block.data[8] < (0x80 as f32) / (0xff as f32));
            assert!(block.data[8] > 0.0);
        }
    }

    mod prepare_scene_render {
        use super::*;

        #[test]
        fn returns_the_lit_view_projected_frame_with_the_visible_mesh() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            let mesh = push_mesh(&mut scene_arena, &mut hierarchy, bounded_box(), vec![None]);
            add_node_child(&mut hierarchy, scene, mesh);

            let lights = SceneLights {
                ambient: Some(create_ambient_light(&AmbientLightOptions::default())),
                directional: Some(create_directional_light(&DirectionalLightOptions::default())),
            };
            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &lights,
            );

            assert_eq!(list.mesh_count, 1);
            assert_eq!(list.visible_meshes[0], mesh);
            assert_eq!(list.lights.directional_count, 1);
            assert_eq!(list.lights.ambient_count, 1);
        }

        #[test]
        fn computes_a_non_identity_view_projection() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);

            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            );
            // A perspective view-projection is not the identity matrix.
            assert_ne!(list.view_projection.m[15], 1.0);
        }

        #[test]
        fn culls_a_mesh_placed_far_behind_the_camera() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            let mesh = push_mesh(&mut scene_arena, &mut hierarchy, bounded_box(), vec![None]);
            scene_arena[mesh].local_matrix.m[14] = 1000.0;
            add_node_child(&mut hierarchy, scene, mesh);

            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            );
            assert_eq!(list.mesh_count, 0);
        }

        #[test]
        fn keeps_a_mesh_whose_geometry_has_no_cached_bounds() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            // Geometry with its cached bounds cleared — cannot be culled.
            let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
            geometry.bounds = None;
            let mesh = push_mesh(
                &mut scene_arena,
                &mut hierarchy,
                Arc::new(geometry),
                vec![None],
            );
            scene_arena[mesh].local_matrix.m[14] = 1000.0;
            add_node_child(&mut hierarchy, scene, mesh);

            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            );
            assert_eq!(list.mesh_count, 1);
        }

        #[test]
        fn skips_disabled_subtrees() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            let group = push_scene(&mut scene_arena, &mut hierarchy);
            scene_arena[group].enabled = false;
            let mesh = push_mesh(&mut scene_arena, &mut hierarchy, bounded_box(), vec![None]);
            add_node_child(&mut hierarchy, group, mesh);
            add_node_child(&mut hierarchy, scene, group);

            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            );
            assert_eq!(list.mesh_count, 0);
        }

        #[test]
        fn resolves_world_transforms_through_nested_groups() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            let group = push_scene(&mut scene_arena, &mut hierarchy);
            let mesh = push_mesh(&mut scene_arena, &mut hierarchy, bounded_box(), vec![None]);
            add_node_child(&mut hierarchy, group, mesh);
            add_node_child(&mut hierarchy, scene, group);
            scene_arena[group].local_matrix.m[12] = 1.0;

            let list = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            );
            assert_eq!(list.mesh_count, 1);
            assert_eq!(list.visible_meshes[0], mesh);
        }

        #[test]
        fn reuses_the_same_list_per_render_state_across_calls() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);

            let first = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            ) as *const SceneRenderList;
            let second = prepare_scene_render(
                &mut store,
                state,
                &mut scene_arena,
                &hierarchy,
                scene,
                &front_camera(),
                &empty_lights(),
            ) as *const SceneRenderList;
            assert_eq!(first, second);
        }

        #[test]
        fn honors_a_positional_material_on_a_mesh() {
            let mut store = RenderStateStore::new();
            let state = create_render_state(&mut store, None);
            let mut scene_arena = SceneArena::new();
            let mut hierarchy = HierarchyArena::new();
            let scene = push_scene(&mut scene_arena, &mut hierarchy);
            let material: Arc<dyn Material> = Arc::new(TestMaterial);
            let mesh = push_mesh(
                &mut scene_arena,
                &mut hierarchy,
                bounded_box(),
                vec![Some(Arc::clone(&material))],
            );
            add_node_child(&mut hierarchy, scene, mesh);

            let visible = {
                let list = prepare_scene_render(
                    &mut store,
                    state,
                    &mut scene_arena,
                    &hierarchy,
                    scene,
                    &front_camera(),
                    &empty_lights(),
                );
                list.visible_meshes[0]
            };
            assert_eq!(visible, mesh);
            let stored = scene_arena[mesh].mesh.as_ref().unwrap().materials[0]
                .as_ref()
                .unwrap();
            assert!(Arc::ptr_eq(stored, &material));
        }
    }
}
