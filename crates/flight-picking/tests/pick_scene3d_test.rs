use std::sync::{Arc, RwLock};

use flight_geometry::{
    copy_quaternion, create_aabb, create_quaternion, create_ray3d, create_vector3,
    set_quaternion_from_axis_angle, set_ray3d, set_vector3,
};
use flight_meshgeometry::contract::ensure_mesh_geometry_bounds;
use flight_meshgeometry::{
    IndexBuffer, MeshAttributeIndices, MeshGeometryFromAttributesOptions, MeshMorph,
    MeshMorphTarget, PrimitiveTopology, create_mesh_geometry_from_attributes,
};
use flight_node::contract::invalidate_node_local_transform;
use flight_node::{NodeRef, add_node_child};
use flight_picking::contract::*;
use flight_scene3d::contract::{get_mesh_runtime, update_mesh_morph};
use flight_scene3d::{Mesh, Node3DFields, create_node3d};

use crate::support::*;

// Two boxes on the camera axis: `far` at the origin (front face z = 1) and `near` shifted to z = 2
// (front face z = 3).
fn overlapping_boxes() -> (NodeRef, flight_entity::Ref<Mesh>, flight_entity::Ref<Mesh>) {
    let scene = group();
    let mesh_far = box_mesh();
    add_node_child(&scene, &node(&mesh_far));
    let mesh_near = box_mesh();
    set_vector3(&mut mesh_near.write().unwrap().position, 0.0, 0.0, 2.0);
    invalidate_node_local_transform(&node(&mesh_near));
    add_node_child(&scene, &node(&mesh_near));
    return (scene, mesh_far, mesh_near);
}

fn is_hit_node(hit: &Scene3DHit, mesh: &flight_entity::Ref<Mesh>) -> bool {
    return hit
        .node
        .as_ref()
        .is_some_and(|node| Arc::ptr_eq(node, &crate::support::node(mesh)));
}

mod create_scene3d_hit {
    use super::*;

    fn assert_entity<T: flight_entity::Entity>(_: &T) {}

    #[test]
    fn allocates_a_zeroed_hit_with_a_sentinel_triangle_index() {
        let mut hit = create_scene3d_hit();

        assert_entity(&hit);
        assert!(!flight_entity::get_entity_uid(&mut hit).is_empty());
        let node: &Option<NodeRef> = &hit.node;
        assert!(node.is_none());
        assert_eq!(hit.triangle_index, -1);
        assert_eq!(hit.distance, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
        assert_eq!(hit.normal_z, 0.0);
    }
}

mod initialize_scene3d_hit {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scene3d_hit() {
        let initializer: fn(&mut Scene3DHit) = initialize_scene3d_hit;
        let mut hit: Scene3DHit = flight_entity::allocate_entity();
        hit.distance = 3.0;
        hit.node = Some(node(&box_mesh()));
        hit.triangle_index = 4;
        hit.u = 0.5;
        hit.point_z = 2.0;
        hit.normal_y = 1.0;

        initializer(&mut hit);

        let created = create_scene3d_hit();
        assert!(hit.node.is_none());
        assert_eq!(
            (hit.distance, hit.triangle_index, hit.u, hit.v, hit.w),
            (
                created.distance,
                created.triangle_index,
                created.u,
                created.v,
                created.w
            )
        );
        assert_eq!(
            (hit.point_x, hit.point_y, hit.point_z),
            (created.point_x, created.point_y, created.point_z)
        );
        assert_eq!(
            (hit.normal_x, hit.normal_y, hit.normal_z),
            (created.normal_x, created.normal_y, created.normal_z)
        );
    }
}

mod pick_scene3d {
    use super::*;

    #[test]
    fn fills_barycentric_weights_that_sum_to_one() {
        let camera = make_camera();
        let (scene, _) = scene_with_centered_box();
        let mut out = create_scene3d_hit();

        let hit = pick_scene3d(&mut out, &scene, &camera, 0.0, 0.0, None, &mut revisions());

        assert!(hit);
        close(out.u + out.v + out.w, 1.0, 5);
    }

    #[test]
    fn fills_the_world_face_normal_and_triangle_index_of_the_hit() {
        let camera = make_camera();
        let (scene, _) = scene_with_centered_box();
        let mut out = create_scene3d_hit();

        assert!(pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions()
        ));

        // Front face of the box points at +Z (toward the camera at z = 5).
        close(out.normal_z, 1.0, 5);
        close(out.normal_x, 0.0, 5);
        close(out.normal_y, 0.0, 5);
        assert!(out.triangle_index >= 0);
    }

    #[test]
    fn returns_null_for_a_scene_containing_only_non_mesh_nodes() {
        let camera = make_camera();
        let scene = group();
        // A plain Node3D is not a Mesh.
        let child: NodeRef = Arc::new(RwLock::new(create_node3d::<Node3DFields>(None, None)));
        add_node_child(&scene, &child);
        let mut out = create_scene3d_hit();

        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn returns_null_when_the_ray_misses_every_mesh() {
        let camera = make_camera();
        let (scene, _) = scene_with_centered_box();
        let mut out = create_scene3d_hit();

        // Far corner of the viewport points away from the small centred box.
        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.99,
            0.99,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn returns_null_when_the_scene_has_no_meshes() {
        let camera = make_camera();
        let scene = group();
        let mut out = create_scene3d_hit();

        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn returns_the_mesh_hit_by_the_center_ray() {
        let camera = make_camera();
        let (scene, mesh) = scene_with_centered_box();
        let mut out = create_scene3d_hit();

        let hit = pick_scene3d(&mut out, &scene, &camera, 0.0, 0.0, None, &mut revisions());

        assert!(hit);
        assert!(is_hit_node(&out, &mesh));
        // Front face of a 2x2x2 box centred at the origin is at z = 1; the ray travels -Z from
        // z ~= 5.
        close(out.point_z, 1.0, 3);
        close(out.point_x, 0.0, 3);
        close(out.point_y, 0.0, 3);
        assert!(out.distance > 0.0);
    }

    #[test]
    fn returns_the_nearer_of_two_overlapping_meshes() {
        // Camera3D is at z = 5 looking toward the origin in the -Z direction. The camera ray hits
        // mesh_near's front face first (distance ≈ 2 vs ≈ 4 for mesh_far).
        let camera = make_camera();
        let (scene, _, mesh_near) = overlapping_boxes();
        let mut out = create_scene3d_hit();

        let hit = pick_scene3d(&mut out, &scene, &camera, 0.0, 0.0, None, &mut revisions());

        assert!(hit);
        assert!(is_hit_node(&out, &mesh_near));
        // Front face of mesh_near is at z = 3.
        close(out.point_z, 3.0, 3);
        assert!(out.distance > 0.0);
        assert!(out.distance < 3.0); // mesh_far's front face would be at distance ≈ 4
    }

    #[test]
    fn skips_a_disabled_mesh_so_it_is_not_pickable() {
        let camera = make_camera();
        let (scene, mesh) = scene_with_centered_box();
        mesh.write().unwrap().enabled = false;
        let mut out = create_scene3d_hit();

        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn prunes_the_subtree_of_a_disabled_group_node() {
        let camera = make_camera();
        let scene = group();
        let disabled = group();
        disabled.write().unwrap().node_fields_mut().enabled = false;
        add_node_child(&disabled, &node(&box_mesh()));
        add_node_child(&scene, &disabled);
        let mut out = create_scene3d_hit();

        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn excludes_a_mesh_rejected_by_the_predicate_option() {
        let camera = make_camera();
        let (scene, mesh_far, _) = overlapping_boxes();
        let mut out = create_scene3d_hit();
        // Identity of the far Mesh allocation, compared against each candidate Mesh.
        let far_address = {
            let guard = mesh_far.read().unwrap();
            &*guard as *const Mesh as usize
        };
        let options = Scene3DPickOptions {
            cull_backfaces: None,
            max_distance: None,
            predicate: Some(Arc::new(move |m: &Mesh| {
                return std::ptr::eq(m, far_address as *const Mesh);
            })),
        };

        let hit = pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            Some(&options),
            &mut revisions(),
        );

        assert!(hit);
        assert!(is_hit_node(&out, &mesh_far));
    }

    #[test]
    fn rejects_hits_beyond_max_distance() {
        let camera = make_camera();
        let (scene, _) = scene_with_centered_box();
        let mut out = create_scene3d_hit();
        let within = |max_distance: f32| {
            return Scene3DPickOptions {
                cull_backfaces: None,
                max_distance: Some(max_distance),
                predicate: None,
            };
        };

        // Front face is ~4 world units from the camera at z = 5.
        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            Some(&within(3.0)),
            &mut revisions()
        ));
        assert!(pick_scene3d(
            &mut out,
            &scene,
            &camera,
            0.0,
            0.0,
            Some(&within(4.5)),
            &mut revisions()
        ));
    }

    #[test]
    fn maps_a_non_square_orthographic_viewport_without_an_aspect_mismap() {
        // View volume is 8 wide (half_width 4) but only 2 tall (half_height 1).
        let camera = make_ortho_camera(4.0, 1.0);
        let scene = group();
        // A 2x2x2 box centred at x = 3 spans x in [2, 4], within the horizontal extent but well
        // outside the vertical one — so a square (aspect = 1) mismap of screen_x would miss it.
        let mesh = box_mesh();
        set_vector3(&mut mesh.write().unwrap().position, 3.0, 0.0, 0.0);
        invalidate_node_local_transform(&node(&mesh));
        add_node_child(&scene, &node(&mesh));
        let mut out = create_scene3d_hit();

        // screen_x = 0.75 → world x = 0.75 * half_width(4) = 3.
        let hit = pick_scene3d(&mut out, &scene, &camera, 0.75, 0.0, None, &mut revisions());

        assert!(hit);
        assert!(is_hit_node(&out, &mesh));
        close(out.point_x, 3.0, 3);
        close(out.point_z, 1.0, 3);
        // A pick past the horizontal extent misses.
        assert!(!pick_scene3d(
            &mut out,
            &scene,
            &camera,
            1.1,
            0.0,
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn hits_a_rotated_and_scaled_mesh_through_the_local_space_path() {
        let camera = make_camera();
        let scene = group();
        let mesh = box_mesh();
        // Non-uniform scale (z doubled) plus a rotation about the Z axis. The +Z face stays
        // on-axis, so its world position is z = 1 * 2 = 2 while the surrounding geometry is
        // rotated — exercising the inverse-transform narrow phase.
        set_vector3(&mut mesh.write().unwrap().scale, 1.5, 1.5, 2.0);
        invalidate_node_local_transform(&node(&mesh));
        let mut q = create_quaternion(0.0, 0.0, 0.0, 1.0);
        set_quaternion_from_axis_angle(
            &mut q,
            &create_vector3(0.0, 0.0, 1.0),
            std::f32::consts::FRAC_PI_4,
        );
        copy_quaternion(&mut mesh.write().unwrap().rotation, &q);
        invalidate_node_local_transform(&node(&mesh));
        add_node_child(&scene, &node(&mesh));
        let mut out = create_scene3d_hit();

        let hit = pick_scene3d(&mut out, &scene, &camera, 0.0, 0.0, None, &mut revisions());

        assert!(hit);
        assert!(is_hit_node(&out, &mesh));
        close(out.point_z, 2.0, 3);
        close(out.point_x, 0.0, 3);
        close(out.point_y, 0.0, 3);
        close(out.normal_z, 1.0, 3);
    }
}

mod pick_scene3d_all {
    use super::*;

    #[test]
    fn collects_both_overlapping_meshes_sorted_by_ascending_distance() {
        let camera = make_camera();
        let (scene, _, mesh_near) = overlapping_boxes();
        let mut out_array: Vec<Scene3DHit> = Vec::new();

        pick_scene3d_all(
            &mut out_array,
            &scene,
            &camera,
            0.0,
            0.0,
            None,
            &mut revisions(),
        );

        // Each box contributes a front-face hit (a 2x2x2 box's front quad is two triangles, but the
        // center ray crosses one triangle per box). Nearest first.
        let hits = &out_array;
        assert!(hits.len() >= 2);
        for i in 1..hits.len() {
            assert!(hits[i].distance >= hits[i - 1].distance);
        }
        assert!(is_hit_node(&hits[0], &mesh_near));
    }

    #[test]
    fn empties_the_array_on_a_miss() {
        let camera = make_camera();
        let (scene, _) = scene_with_centered_box();
        let mut out_array = vec![create_scene3d_hit(), create_scene3d_hit()];

        pick_scene3d_all(
            &mut out_array,
            &scene,
            &camera,
            0.99,
            0.99,
            None,
            &mut revisions(),
        );

        assert_eq!(out_array.len(), 0);
    }
}

mod pick_scene3d_all_with_ray3d {
    use super::*;

    #[test]
    fn collects_every_triangle_a_world_ray_crosses_front_and_back_faces() {
        let (scene, _) = scene_with_centered_box();
        let ray = make_center_ray();
        let mut out_array: Vec<Scene3DHit> = Vec::new();

        pick_scene3d_all_with_ray3d(&mut out_array, &scene, &ray, None, &mut revisions());

        // The center ray runs along the shared diagonal of each quad, so it grazes both triangles
        // of the front face (z = 1) and both of the back face (z = -1): four hits, sorted
        // near-to-far.
        let hits = &out_array;
        assert_eq!(hits.len(), 4);
        for i in 1..hits.len() {
            assert!(hits[i].distance >= hits[i - 1].distance);
        }
        close(hits[0].point_z, 1.0, 3);
        close(hits[hits.len() - 1].point_z, -1.0, 3);
    }

    #[test]
    fn keeps_only_front_faces_when_cull_backfaces_is_set() {
        let (scene, _) = scene_with_centered_box();
        let ray = make_center_ray();
        let mut out_array: Vec<Scene3DHit> = Vec::new();
        let options = Scene3DPickOptions {
            cull_backfaces: Some(true),
            max_distance: None,
            predicate: None,
        };

        pick_scene3d_all_with_ray3d(
            &mut out_array,
            &scene,
            &ray,
            Some(&options),
            &mut revisions(),
        );

        // Only the two front-face triangles survive; both point at +Z (toward the ray origin).
        assert_eq!(out_array.len(), 2);
        for hit in &out_array {
            close(hit.point_z, 1.0, 3);
            close(hit.normal_z, 1.0, 3);
        }
    }

    #[test]
    fn reuses_existing_slots_and_their_entity_identity_across_refills() {
        let (scene, mesh) = scene_with_centered_box();
        let ray = make_center_ray();
        let mut retained = create_scene3d_hit();
        let uid = flight_entity::get_entity_uid(&mut retained);
        let mut out_array = vec![retained];

        pick_scene3d_all_with_ray3d(&mut out_array, &scene, &ray, None, &mut revisions());

        assert_eq!(out_array.len(), 4);
        assert_eq!(flight_entity::get_entity_uid(&mut out_array[0]), uid);
        assert!(is_hit_node(&out_array[0], &mesh));
        close(out_array[0].point_z, 1.0, 3);
    }
}

mod pick_scene3d_with_ray3d {
    use super::*;

    #[test]
    fn resolves_the_nearest_hit_for_a_world_space_ray() {
        let (scene, mesh) = scene_with_centered_box();
        let ray = make_center_ray();
        let mut out = create_scene3d_hit();
        let options = Scene3DPickOptions {
            cull_backfaces: None,
            max_distance: None,
            predicate: None,
        };

        let hit = pick_scene3d_with_ray3d(&mut out, &scene, &ray, Some(&options), &mut revisions());

        assert!(hit);
        assert!(is_hit_node(&out, &mesh));
        close(out.point_z, 1.0, 3);
    }

    #[test]
    fn culls_a_back_facing_triangle_but_keeps_a_front_facing_one() {
        let front = group();
        add_node_child(&front, &node(&triangle_mesh(true)));
        let back = group();
        add_node_child(&back, &node(&triangle_mesh(false)));
        let mut out = create_scene3d_hit();
        let cull = Scene3DPickOptions {
            cull_backfaces: Some(true),
            max_distance: None,
            predicate: None,
        };

        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &front,
            &make_center_ray(),
            Some(&cull),
            &mut revisions()
        ));
        assert!(!pick_scene3d_with_ray3d(
            &mut out,
            &back,
            &make_center_ray(),
            Some(&cull),
            &mut revisions()
        ));
        // Double-sided (default) hits either winding.
        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &back,
            &make_center_ray(),
            None,
            &mut revisions()
        ));
    }

    #[test]
    fn picks_the_second_triangle_of_an_indexed_strip_with_its_ccw_winding() {
        let mut strip = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            positions: vec![
                -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0, 0.0,
            ],
            normals: None,
            uvs: None,
            indices: Some(MeshAttributeIndices::Values(vec![0, 1, 2, 3])),
        });
        assert!(matches!(strip.indices, IndexBuffer::U16(_)));
        strip.topology = PrimitiveTopology::TriangleStrip;
        let scene = group();
        add_node_child(&scene, &node(&mesh(geometry(strip))));
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_ray3d(
            &mut ray,
            &create_vector3(0.5, 0.5, 1.0),
            &create_vector3(0.0, 0.0, -1.0),
        );
        let mut out = create_scene3d_hit();
        let cull = Scene3DPickOptions {
            cull_backfaces: Some(true),
            max_distance: None,
            predicate: None,
        };

        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            Some(&cull),
            &mut revisions()
        ));

        assert_eq!(out.triangle_index, 1);
        close(out.normal_z, 1.0, 2);
    }

    #[test]
    fn observes_morphed_vertices_and_refreshed_broad_phase_bounds_after_explicit_update() {
        let mesh = mesh(geometry(create_mesh_geometry_from_attributes(
            MeshGeometryFromAttributesOptions {
                positions: vec![9.0, -1.0, 0.0, 11.0, -1.0, 0.0, 10.0, 1.0, 0.0],
                normals: None,
                uvs: None,
                indices: None,
            },
        )));
        mesh.write().unwrap().morph = Some(Arc::new(RwLock::new(MeshMorph {
            targets: Arc::new(vec![MeshMorphTarget {
                normal_deltas: None,
                position_deltas: vec![-10.0, 0.0, 0.0, -10.0, 0.0, 0.0, -10.0, 0.0, 0.0].into(),
                tangent_deltas: None,
            }]),
            weights: vec![1.0].into(),
        })));
        let scene = group();
        add_node_child(&scene, &node(&mesh));
        let ray = make_center_ray();
        let mut out = create_scene3d_hit();

        assert!(!pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));
        update_mesh_morph(&mesh.read().unwrap());

        // Bounds are a dirty-gated cache; the morph marks them stale and the ensure recomputes them
        // — which is exactly what the pick below does internally through the broad phase.
        let geometry = mesh.read().unwrap().geometry.clone();
        let bounds = ensure_mesh_geometry_bounds(&mut geometry.write().unwrap()).cloned();
        assert_eq!(bounds.as_ref().map(|b| b.min.x), Some(-1.0));
        assert_eq!(bounds.as_ref().map(|b| b.max.x), Some(1.0));
        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));
        assert!(is_hit_node(&out, &mesh));
    }

    #[test]
    fn broad_phases_against_the_posed_deformed_local_bounds_slot_when_a_deform_pass_wrote_one() {
        // A triangle at the origin that the center ray hits head-on. Its bind-pose bounds admit the
        // ray, so with no posed slot the pick lands.
        let mesh = triangle_mesh(true);
        let scene = group();
        add_node_child(&scene, &node(&mesh));
        let ray = make_center_ray();
        let mut out = create_scene3d_hit();

        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));
        assert!(is_hit_node(&out, &mesh));

        // Simulate a deform pass (prepare_scene3d_skinning) writing a posed local box far off the
        // ray. The broad-phase must read that slot as data and reject the mesh before the triangle
        // test — proving it no longer uses the bind-pose bounds for a posed mesh.
        mesh.write()
            .unwrap()
            .mesh_runtime_mut()
            .deformed_local_bounds = Some(create_aabb(100.0, 100.0, 100.0, 102.0, 102.0, 102.0));
        assert!(
            get_mesh_runtime(&mesh.read().unwrap())
                .deformed_local_bounds
                .is_some()
        );
        assert!(!pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));

        // Clearing the slot falls back to the bind-pose world bounds, and the pick lands again.
        mesh.write()
            .unwrap()
            .mesh_runtime_mut()
            .deformed_local_bounds = None;
        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &ray,
            None,
            &mut revisions()
        ));
        assert!(is_hit_node(&out, &mesh));
    }

    #[test]
    fn leaves_out_untouched_on_a_miss() {
        let (scene, mesh) = scene_with_centered_box();
        let mut out = create_scene3d_hit();
        assert!(pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &make_center_ray(),
            None,
            &mut revisions()
        ));
        let before = (out.distance, out.triangle_index, out.point_z, out.u);
        let mut miss = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        set_ray3d(
            &mut miss,
            &create_vector3(10.0, 10.0, 5.0),
            &create_vector3(0.0, 0.0, -1.0),
        );

        assert!(!pick_scene3d_with_ray3d(
            &mut out,
            &scene,
            &miss,
            None,
            &mut revisions()
        ));

        assert!(is_hit_node(&out, &mesh));
        assert_eq!(
            (out.distance, out.triangle_index, out.point_z, out.u),
            before
        );
    }
}
