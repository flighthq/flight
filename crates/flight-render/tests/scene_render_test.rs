use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_camera::{
    Camera3D, Projection, create_camera_3d, create_perspective_projection,
    set_camera_3d_view_matrix4_from_look_at,
};
use flight_entity::{Ref, allocate_entity, get_entity_id};
use flight_geometry::{Matrix4, create_matrix4, create_vector3};
use flight_lighting::{
    AmbientLightOptions, DirectionalLightOptions, HemisphereLightOptions, MAX_FORWARD_LIGHTS,
    PointLightOptions, SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET, SCENE_LIGHT_BLOCK_FLOATS,
    SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET, SCENE_LIGHT_HEMISPHERE_OFFSET,
    SCENE_LIGHT_POINT_OFFSET, SCENE_LIGHT_SPOT_OFFSET, Scene3DLightBlock, Scene3DLights,
    SpotLightOptions, create_ambient_light, create_directional_light, create_hemisphere_light,
    create_point_light, create_spot_light,
};
use flight_materials::{Material3D, Material3DFields};
use flight_meshgeometry::{
    CANONICAL_MESH_GEOMETRY_LAYOUT, MeshGeometry, MeshGeometryOptions, create_box_mesh_geometry,
    create_mesh_geometry,
};
use flight_node::contract::{get_node_world_matrix4, set_node_local_matrix4};
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_render::*;
use flight_scene3d::{
    InstancedMesh, Mesh, Node3DFields, Scene3DAppearanceState, Skeleton3D, Skin,
    create_instanced_mesh, create_mesh, create_node3d, get_node3d_world_alpha, publish_node3d,
    set_instanced_mesh_instance_count, set_instanced_mesh_instance_matrix,
};

static GUARD_CALLS: AtomicUsize = AtomicUsize::new(0);
static GUARDED_MESH_ID: AtomicU64 = AtomicU64::new(0);
static CLEARED_GUARD_CALLS: AtomicUsize = AtomicUsize::new(0);

fn light_ref<T>(value: T) -> Ref<T> {
    return Arc::new(RwLock::new(value));
}

fn bounded_box() -> Ref<MeshGeometry> {
    return Arc::new(RwLock::new(create_box_mesh_geometry(
        Some(2.0),
        Some(2.0),
        Some(2.0),
    )));
}

fn mesh(geometry: Ref<MeshGeometry>) -> Ref<Mesh> {
    return create_mesh(geometry, Arc::new(RwLock::new(vec![None])), None, None);
}

fn root() -> NodeRef {
    return publish_node3d(create_node3d::<Node3DFields>(None, None));
}

fn camera_looking_at_x(x: f32) -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 200.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    projection.write().unwrap().aspect = 1.0;
    projection.write().unwrap().fov_y = std::f32::consts::PI / 3.0;
    camera.projection = Projection::Perspective(projection);
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(x, 0.0, 20.0),
        &create_vector3(x, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

fn front_camera() -> Camera3D {
    let mut camera = camera_looking_at_x(0.0);
    camera.far = 100.0;
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(0.0, 0.0, 10.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

fn empty_lights() -> Scene3DLights {
    return crate::support::test_default::<Scene3DLights>();
}

fn ambient_lights(ambient: Ref<flight_lighting::AmbientLight>) -> Scene3DLights {
    let mut lights = empty_lights();
    lights.ambient = Some(ambient);
    return lights;
}

fn directional_lights(directional: Ref<flight_lighting::DirectionalLight>) -> Scene3DLights {
    let mut lights = empty_lights();
    lights.directional = Some(directional);
    return lights;
}

fn point_lights(point: Vec<Ref<flight_lighting::PointLight>>) -> Scene3DLights {
    let mut lights = empty_lights();
    lights.point = point;
    return lights;
}

fn spot_lights(spot: Vec<Ref<flight_lighting::SpotLight>>) -> Scene3DLights {
    let mut lights = empty_lights();
    lights.spot = spot;
    return lights;
}

fn hemisphere_lights(hemisphere: Vec<Ref<flight_lighting::HemisphereLight>>) -> Scene3DLights {
    let mut lights = empty_lights();
    lights.hemisphere = hemisphere;
    return lights;
}

fn translation_matrix(x: f32) -> Matrix4 {
    let mut matrix = create_matrix4();
    matrix.m[12] = x;
    return matrix;
}

fn new_light_block() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 0,
    };
}

fn skin_mesh(mesh: &Ref<Mesh>) {
    let skeleton: Ref<Skeleton3D> = Arc::new(RwLock::new(allocate_entity()));
    mesh.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
        skeleton,
        skeleton_root: None,
    })));
}

fn record_guard(_state: &mut BaseRenderState, mesh: &Mesh) {
    GUARD_CALLS.fetch_add(1, Ordering::SeqCst);
    GUARDED_MESH_ID.store(get_entity_id(mesh), Ordering::SeqCst);
}

fn count_cleared_guard(_state: &mut BaseRenderState, _mesh: &Mesh) {
    CLEARED_GUARD_CALLS.fetch_add(1, Ordering::SeqCst);
}

fn instanced_scene(instance_xs: &[f32]) -> (NodeRef, Ref<InstancedMesh>, NodeRef) {
    let scene = root();
    let mesh = create_instanced_mesh(
        bounded_box(),
        Arc::new(RwLock::new(vec![None])),
        Some(4),
        None,
    );
    set_instanced_mesh_instance_count(&mesh, instance_xs.len() as i32);
    for (index, x) in instance_xs.iter().enumerate() {
        set_instanced_mesh_instance_matrix(&mesh, index as i32, &translation_matrix(*x));
    }
    let mesh_node: NodeRef = mesh.clone();
    add_node_child(&scene, &mesh_node);
    return (scene, mesh, mesh_node);
}

mod pack_scene_3d_light_block {
    use super::*;

    #[test]
    fn empty_lights_zero_block_and_clear_counts() {
        let mut block = new_light_block();
        block.data[0] = 5.0;
        pack_scene_3d_light_block(&mut block, &empty_lights());
        assert_eq!(block.directional_count, 0);
        assert_eq!(block.ambient_count, 0);
        assert_eq!(block.data[0], 0.0);
    }

    #[test]
    fn directional_light_packs_direction_and_linear_premultiplied_radiance() {
        let mut block = new_light_block();
        let directional = light_ref(create_directional_light(Some(&DirectionalLightOptions {
            color: Some(0xffff_ffff),
            direction: Some(create_vector3(0.0, -1.0, 0.0)),
            intensity: Some(2.0),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &directional_lights(directional));
        assert_eq!(block.directional_count, 1);
        assert_eq!(&block.data[0..3], &[0.0, -1.0, 0.0]);
        assert_eq!(block.data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET], 2.0);
        assert_eq!(block.data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 1], 2.0);
        assert_eq!(block.data[SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET + 2], 2.0);
    }

    #[test]
    fn ambient_light_packs_radiance_in_ambient_slot() {
        let mut block = new_light_block();
        let ambient = light_ref(create_ambient_light(Some(&AmbientLightOptions {
            color: Some(0xffff_ffff),
            intensity: Some(0.5),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &ambient_lights(ambient));
        assert_eq!(block.ambient_count, 1);
        assert_eq!(
            &block.data
                [SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET..SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET + 3],
            &[0.5, 0.5, 0.5]
        );
    }

    #[test]
    fn packing_bumps_version_when_block_changes() {
        let mut block = new_light_block();
        pack_scene_3d_light_block(&mut block, &empty_lights());
        let version = block.version;
        let ambient = light_ref(create_ambient_light(Some(&AmbientLightOptions {
            intensity: Some(0.5),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &ambient_lights(ambient));
        assert_eq!(block.version, version + 1);
    }

    #[test]
    fn packing_identical_lights_does_not_bump_version() {
        let mut block = new_light_block();
        let lights = ambient_lights(light_ref(create_ambient_light(Some(
            &AmbientLightOptions {
                intensity: Some(0.5),
                ..crate::support::test_default()
            },
        ))));
        pack_scene_3d_light_block(&mut block, &lights);
        let version = block.version;
        pack_scene_3d_light_block(&mut block, &lights);
        assert_eq!(block.version, version);
    }

    #[test]
    fn srgb_midgray_decodes_to_darker_linear_value() {
        let mut block = new_light_block();
        pack_scene_3d_light_block(
            &mut block,
            &ambient_lights(light_ref(create_ambient_light(Some(
                &AmbientLightOptions {
                    color: Some(0x8080_80ff),
                    ..crate::support::test_default()
                },
            )))),
        );
        let value = block.data[SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET];
        assert!(value > 0.0);
        assert!(value < 0x80 as f32 / 0xff as f32);
    }

    #[test]
    fn point_light_packs_position_range_radiance_and_inverse_square_range() {
        let mut block = new_light_block();
        let point = light_ref(create_point_light(Some(&PointLightOptions {
            color: Some(0xffff_ffff),
            intensity: Some(3.0),
            position: Some(create_vector3(1.0, 2.0, 3.0)),
            range: Some(10.0),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &point_lights(vec![point]));
        let offset = SCENE_LIGHT_POINT_OFFSET;
        assert_eq!(block.point_count, 1);
        assert_eq!(&block.data[offset..offset + 4], &[1.0, 2.0, 3.0, 10.0]);
        assert_eq!(block.data[offset + 4], 3.0);
        assert!((block.data[offset + 7] - 0.01).abs() < 1e-6);
    }

    #[test]
    fn infinite_range_point_light_has_zero_inverse_square_cutoff() {
        let mut block = new_light_block();
        let point = light_ref(create_point_light(Some(&PointLightOptions {
            range: Some(-1.0),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &point_lights(vec![point]));
        assert_eq!(block.data[SCENE_LIGHT_POINT_OFFSET + 3], -1.0);
        assert_eq!(block.data[SCENE_LIGHT_POINT_OFFSET + 7], 0.0);
    }

    #[test]
    fn spot_light_packs_point_direction_and_cone_cosines() {
        let mut block = new_light_block();
        let spot = light_ref(create_spot_light(Some(&SpotLightOptions {
            direction: Some(create_vector3(0.0, -1.0, 0.0)),
            inner_cone_degrees: Some(10.0),
            outer_cone_degrees: Some(30.0),
            position: Some(create_vector3(4.0, 5.0, 6.0)),
            ..crate::support::test_default()
        })));
        let inner = spot.read().unwrap().inner_cone_cos;
        let outer = spot.read().unwrap().outer_cone_cos;
        pack_scene_3d_light_block(&mut block, &spot_lights(vec![spot]));
        let offset = SCENE_LIGHT_SPOT_OFFSET;
        assert_eq!(block.spot_count, 1);
        assert_eq!(block.data[offset], 4.0);
        assert_eq!(&block.data[offset + 8..offset + 11], &[0.0, -1.0, 0.0]);
        assert_eq!(block.data[offset + 12], inner);
        assert_eq!(block.data[offset + 13], outer);
        assert!(block.data[offset + 12] > block.data[offset + 13]);
    }

    #[test]
    fn hemisphere_light_packs_sky_ground_and_world_up() {
        let mut block = new_light_block();
        let hemisphere = light_ref(create_hemisphere_light(Some(&HemisphereLightOptions {
            ground_color: Some(0x0000_00ff),
            intensity: Some(2.0),
            sky_color: Some(0xffff_ffff),
            ..crate::support::test_default()
        })));
        pack_scene_3d_light_block(&mut block, &hemisphere_lights(vec![hemisphere]));
        let offset = SCENE_LIGHT_HEMISPHERE_OFFSET;
        assert_eq!(block.hemisphere_count, 1);
        assert_eq!(block.data[offset], 2.0);
        assert_eq!(block.data[offset + 4], 0.0);
        assert_eq!(&block.data[offset + 8..offset + 11], &[0.0, 1.0, 0.0]);
    }

    #[test]
    fn each_punctual_array_is_capped_at_forward_light_limit() {
        let mut block = new_light_block();
        let point = (0..9)
            .map(|_| light_ref(create_point_light(None)))
            .collect();
        pack_scene_3d_light_block(&mut block, &point_lights(point));
        assert_eq!(block.point_count, MAX_FORWARD_LIGHTS);
    }

    #[test]
    fn empty_punctual_arrays_report_zero_counts() {
        let mut block = new_light_block();
        pack_scene_3d_light_block(&mut block, &empty_lights());
        assert_eq!(block.point_count, 0);
        assert_eq!(block.spot_count, 0);
        assert_eq!(block.hemisphere_count, 0);
    }

    #[test]
    fn identical_punctual_lights_do_not_bump_version() {
        let mut block = new_light_block();
        let lights = point_lights(vec![light_ref(create_point_light(Some(
            &PointLightOptions {
                range: Some(5.0),
                ..crate::support::test_default()
            },
        )))]);
        pack_scene_3d_light_block(&mut block, &lights);
        let version = block.version;
        pack_scene_3d_light_block(&mut block, &lights);
        assert_eq!(block.version, version);
    }
}

mod prepare_scene_3d_render {
    use super::*;

    #[test]
    fn prepare_returns_lit_view_projected_frame_with_visible_mesh() {
        let mut state = create_render_state(None);
        let scene = root();
        let mesh = mesh(bounded_box());
        let mesh_node: NodeRef = mesh.clone();
        add_node_child(&scene, &mesh_node);
        let mut lights = empty_lights();
        lights.ambient = Some(light_ref(create_ambient_light(None)));
        lights.directional = Some(light_ref(create_directional_light(None)));
        let list = prepare_scene_3d_render(&mut state, &scene, &front_camera(), &lights, None);
        assert_eq!(list.mesh_count, 1);
        assert!(Arc::ptr_eq(&list.visible_meshes[0], &mesh_node));
        assert_eq!(list.lights.directional_count, 1);
        assert_eq!(list.lights.ambient_count, 1);
    }

    #[test]
    fn prepare_computes_non_identity_view_projection() {
        let mut state = create_render_state(None);
        let list =
            prepare_scene_3d_render(&mut state, &root(), &front_camera(), &empty_lights(), None);
        assert_ne!(list.view_projection.m[15], 1.0);
    }

    #[test]
    fn draw_time_aspect_does_not_mutate_camera_projection() {
        let mut state = create_render_state(None);
        let scene = root();
        let camera = front_camera();
        let tall = prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), Some(0.5))
            .view_projection
            .m[0];
        let wide = prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), Some(2.0))
            .view_projection
            .m[0];
        assert!((tall - wide * 4.0).abs() < 1e-5);
        let Projection::Perspective(projection) = &camera.projection else {
            panic!("front camera should use perspective projection");
        };
        assert_eq!(projection.read().unwrap().aspect, 1.0);
    }

    #[test]
    fn prepare_consumes_camera_jitter() {
        let mut state = create_render_state(None);
        let scene = root();
        let camera = front_camera();
        let base = prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None)
            .view_projection
            .m[8];
        camera.jitter.write().unwrap().x = 0.125;
        let jittered = prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None)
            .view_projection
            .m[8];
        assert!((jittered - (base - 0.125)).abs() < 1e-5);
    }

    #[test]
    fn prepare_culls_mesh_far_behind_camera() {
        let mut state = create_render_state(None);
        let scene = root();
        let mesh = mesh(bounded_box());
        mesh.write().unwrap().position.z = 1000.0;
        let mesh_node: NodeRef = mesh;
        invalidate_node_local_transform(&mesh_node);
        add_node_child(&scene, &mesh_node);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                .mesh_count,
            0
        );
    }

    #[test]
    fn prepare_computes_uncached_bounds_and_culls_against_them() {
        let mut state = create_render_state(None);
        let scene = root();
        let geometry = bounded_box();
        geometry.write().unwrap().bounds = None;
        let mesh = mesh(geometry);
        mesh.write().unwrap().position.z = 1000.0;
        let mesh_node: NodeRef = mesh;
        invalidate_node_local_transform(&mesh_node);
        add_node_child(&scene, &mesh_node);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                .mesh_count,
            0
        );
    }

    #[test]
    fn prepare_keeps_empty_unbounded_geometry() {
        let empty = Arc::new(RwLock::new(create_mesh_geometry(MeshGeometryOptions {
            vertices: Vec::new().into_boxed_slice(),
            layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
            indices: None,
            subsets: None,
            topology: None,
        })));
        let mesh = mesh(empty);
        mesh.write().unwrap().position.z = 1000.0;
        let mesh_node: NodeRef = mesh;
        invalidate_node_local_transform(&mesh_node);
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                .mesh_count,
            1
        );
    }

    #[test]
    fn prepare_skips_disabled_subtrees() {
        let mut group_fields: Node3DFields = create_node3d(None, None);
        group_fields.enabled = false;
        let group: NodeRef = publish_node3d(group_fields);
        let mesh_node: NodeRef = mesh(bounded_box());
        add_node_child(&group, &mesh_node);
        let scene = root();
        add_node_child(&scene, &group);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                .mesh_count,
            0
        );
    }

    #[test]
    fn prepare_skips_hidden_subtrees() {
        let mut group_fields: Node3DFields = create_node3d(None, None);
        group_fields.visible = false;
        let group: NodeRef = publish_node3d(group_fields);
        let mesh_node: NodeRef = mesh(bounded_box());
        add_node_child(&group, &mesh_node);
        let scene = root();
        add_node_child(&scene, &group);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                .mesh_count,
            0
        );
    }

    #[test]
    fn prepare_resolves_world_transforms_through_nested_groups() {
        let mut group_fields: Node3DFields = create_node3d(None, None);
        group_fields.position.x = 1.0;
        let group: NodeRef = publish_node3d(group_fields);
        invalidate_node_local_transform(&group);
        let mesh_node: NodeRef = mesh(bounded_box());
        add_node_child(&group, &mesh_node);
        let scene = root();
        add_node_child(&scene, &group);
        let mut state = create_render_state(None);
        let list =
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        assert_eq!(list.mesh_count, 1);
        assert!(Arc::ptr_eq(&list.visible_meshes[0], &mesh_node));
    }

    #[test]
    fn parent_and_self_alpha_fold_into_world_alpha() {
        let mut scene_fields: Node3DFields = create_node3d(None, None);
        scene_fields.alpha = 0.5;
        let scene: NodeRef = publish_node3d(scene_fields);
        let mut group_fields: Node3DFields = create_node3d(None, None);
        group_fields.alpha = 0.5;
        let group: NodeRef = publish_node3d(group_fields);
        let mesh = mesh(bounded_box());
        mesh.write().unwrap().alpha = 0.5;
        let mesh_node: NodeRef = mesh;
        add_node_child(&group, &mesh_node);
        add_node_child(&scene, &group);
        let mut state = create_render_state(None);
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        let mut appearance = crate::support::test_default::<Scene3DAppearanceState>();
        assert_eq!(get_node3d_world_alpha(&scene, &mut appearance), 0.5);
        assert_eq!(get_node3d_world_alpha(&group, &mut appearance), 0.25);
        assert_eq!(get_node3d_world_alpha(&mesh_node, &mut appearance), 0.125);
    }

    #[test]
    fn prepare_reuses_same_list_per_render_state() {
        let mut state = create_render_state(None);
        let scene = root();
        let first =
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                as *const _;
        let second =
            prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None)
                as *const _;
        assert_eq!(first, second);
    }

    #[test]
    fn prepare_preserves_positional_material_identity() {
        let material: Ref<dyn Material3D> = Arc::new(RwLock::new(crate::support::test_default::<
            Material3DFields,
        >()));
        let mesh = create_mesh(
            bounded_box(),
            Arc::new(RwLock::new(vec![Some(material.clone())])),
            None,
            None,
        );
        let mesh_node: NodeRef = mesh;
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let mut state = create_render_state(None);
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        let guard = mesh_node.read().unwrap();
        let mesh = guard.as_any().downcast_ref::<Mesh>().unwrap();
        assert!(Arc::ptr_eq(
            mesh.materials.read().unwrap()[0].as_ref().unwrap(),
            &material
        ));
    }

    #[test]
    fn default_policy_refreshes_world_transform_without_explicit_invalidate() {
        let mesh = mesh(bounded_box());
        let mesh_node: NodeRef = mesh.clone();
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let camera = front_camera();
        let mut state = create_render_state(None);
        prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None);
        mesh.write().unwrap().position.x = 3.0;
        prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None);
        let world = get_node_world_matrix4(&mesh_node, &mut state.runtime.node_revisions);
        assert!((world.m[12] - 3.0).abs() < 1e-6);
    }

    #[test]
    fn default_policy_preserves_directly_authored_local_matrix() {
        let mesh_node: NodeRef = mesh(bounded_box());
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let local = translation_matrix(3.0);
        set_node_local_matrix4(&mesh_node, &local);
        let mut state = create_render_state(None);
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        let world = get_node_world_matrix4(&mesh_node, &mut state.runtime.node_revisions);
        assert!((world.m[12] - 3.0).abs() < 1e-6);
    }

    #[test]
    fn invalidation_policy_leaves_world_transform_stale_until_invalidated() {
        let mesh = mesh(bounded_box());
        let mesh_node: NodeRef = mesh.clone();
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let camera = front_camera();
        let mut state = create_render_state(Some(&RenderStateInit {
            scene_graph_sync_policy: Some(Scene3DGraphSyncPolicy::RequiresInvalidation),
            ..crate::support::test_default()
        }));
        prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None);
        mesh.write().unwrap().position.x = 3.0;
        prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None);
        assert_eq!(
            get_node_world_matrix4(&mesh_node, &mut state.runtime.node_revisions).m[12],
            0.0
        );
        invalidate_node_local_transform(&mesh_node);
        prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None);
        assert_eq!(
            get_node_world_matrix4(&mesh_node, &mut state.runtime.node_revisions).m[12],
            3.0
        );
    }

    #[test]
    fn instanced_mesh_is_kept_when_instances_are_away_from_node_origin() {
        let (scene, _mesh, mesh_node) = instanced_scene(&[60.0]);
        let mut state = create_render_state(None);
        let list = prepare_scene_3d_render(
            &mut state,
            &scene,
            &camera_looking_at_x(60.0),
            &empty_lights(),
            None,
        );
        assert_eq!(list.instanced_mesh_count, 1);
        assert!(Arc::ptr_eq(&list.visible_instanced_meshes[0], &mesh_node));
    }

    #[test]
    fn instanced_mesh_is_culled_when_all_instances_are_outside() {
        let (scene, _mesh, _mesh_node) = instanced_scene(&[0.0]);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(
                &mut state,
                &scene,
                &camera_looking_at_x(60.0),
                &empty_lights(),
                None
            )
            .instanced_mesh_count,
            0
        );
    }

    #[test]
    fn instanced_mesh_is_reculled_after_instance_matrices_move() {
        let (scene, mesh, _mesh_node) = instanced_scene(&[0.0]);
        let camera = camera_looking_at_x(60.0);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None)
                .instanced_mesh_count,
            0
        );
        set_instanced_mesh_instance_matrix(&mesh, 0, &translation_matrix(60.0));
        assert_eq!(
            prepare_scene_3d_render(&mut state, &scene, &camera, &empty_lights(), None)
                .instanced_mesh_count,
            1
        );
    }

    #[test]
    fn instanced_mesh_is_kept_when_some_instances_are_visible() {
        let (scene, _mesh, _mesh_node) = instanced_scene(&[0.0, 60.0]);
        let mut state = create_render_state(None);
        assert_eq!(
            prepare_scene_3d_render(
                &mut state,
                &scene,
                &camera_looking_at_x(60.0),
                &empty_lights(),
                None
            )
            .instanced_mesh_count,
            1
        );
    }
}

mod set_skinned_mesh_bounds_guard {
    use super::*;

    #[test]
    fn skinned_mesh_bounds_guard_receives_mesh_reaching_culling() {
        GUARD_CALLS.store(0, Ordering::SeqCst);
        GUARDED_MESH_ID.store(0, Ordering::SeqCst);
        let mesh = mesh(bounded_box());
        skin_mesh(&mesh);
        let mesh_id = get_entity_id(&*mesh.read().unwrap());
        let mesh_node: NodeRef = mesh;
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let mut state = create_render_state(None);
        set_skinned_mesh_bounds_guard(&mut state, Some(record_guard));
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        assert_eq!(GUARD_CALLS.load(Ordering::SeqCst), 1);
        assert_eq!(GUARDED_MESH_ID.load(Ordering::SeqCst), mesh_id);
    }

    #[test]
    fn cleared_skinned_mesh_bounds_guard_stops_reporting() {
        CLEARED_GUARD_CALLS.store(0, Ordering::SeqCst);
        let mesh = mesh(bounded_box());
        skin_mesh(&mesh);
        let mesh_node: NodeRef = mesh;
        let scene = root();
        add_node_child(&scene, &mesh_node);
        let mut state = create_render_state(None);
        set_skinned_mesh_bounds_guard(&mut state, Some(count_cleared_guard));
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        set_skinned_mesh_bounds_guard(&mut state, None);
        prepare_scene_3d_render(&mut state, &scene, &front_camera(), &empty_lights(), None);
        assert_eq!(CLEARED_GUARD_CALLS.load(Ordering::SeqCst), 1);
    }
}
