use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionCapsule3D, CollisionColliderShape3D, CollisionConvex3D,
    CollisionShape3D,
};

use super::*;
use crate::common::*;

fn options() -> Physics3DDebugGeometryOptions {
    Physics3DDebugGeometryOptions {
        draw_centers_of_mass: true,
        draw_colliders: true,
        draw_contacts: true,
        draw_joints: true,
        center_of_mass_radius: 0.08,
        contact_normal_length: 0.5,
    }
}

fn unit_box() -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    }))
}

fn add_shaped_body(
    world: &mut Physics3DWorld,
    shape: CollisionColliderShape3D,
    y: f32,
) -> RigidBody3DRef {
    add_shaped_body_of_type(world, shape, y, Physics3DBodyType::Dynamic)
}

fn add_shaped_body_of_type(
    world: &mut Physics3DWorld,
    shape: CollisionColliderShape3D,
    y: f32,
    body_type: Physics3DBodyType,
) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    body.write().unwrap().y = y;
    add_physics_3d_body(world, &body);
    let collider = physics_3d_collider(&shape, None, None, None);
    add_physics_3d_collider(world, &body, &collider);
    body
}

fn live_lines(out: &Physics3DDebugGeometry) -> &[Physics3DDebugLine] {
    &out.lines[..out.line_count]
}

fn live_spheres(out: &Physics3DDebugGeometry) -> &[Physics3DDebugSphere] {
    &out.spheres[..out.sphere_count]
}

fn line_length(line: &Physics3DDebugLine) -> f32 {
    ((line.x1 - line.x0).powi(2) + (line.y1 - line.y0).powi(2) + (line.z1 - line.z0).powi(2)).sqrt()
}

mod create_physics_3d_debug_geometry {
    use super::*;

    #[test]
    fn starts_empty() {
        let out = create_physics_3d_debug_geometry();
        assert!(out.lines.is_empty());
        assert_eq!(out.line_count, 0);
        assert!(out.spheres.is_empty());
        assert_eq!(out.sphere_count, 0);
    }
}

mod initialize_physics_3d_debug_geometry {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut out = create_physics_3d_debug_geometry();
        out.lines.push(Physics3DDebugLine {
            feature: Physics3DDebugFeature::Collider,
            body_a: 0,
            body_b: -1,
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 1.0,
            y1: 0.0,
            z1: 0.0,
        });
        out.line_count = 1;

        initialize_physics_3d_debug_geometry(&mut out);

        assert!(out.lines.is_empty());
        assert_eq!(out.line_count, 0);
        assert!(out.spheres.is_empty());
        assert_eq!(out.sphere_count, 0);
    }
}

mod write_physics_3d_debug_geometry {
    use super::*;

    #[test]
    fn draws_explicit_mesh_triangles_and_heightfield_grid_edges() {
        let mut world = world();
        let mesh = CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(
            collision_triangle_mesh3d(
                vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
                vec![0, 1, 2],
            ),
        )));
        add_shaped_body_of_type(&mut world, mesh, 0.0, Physics3DBodyType::Static);
        let heightfield = CollisionColliderShape3D::Heightfield(Arc::new(RwLock::new(
            collision_heightfield3d(2, 2, vec![0.0; 4], 1.0, 1.0),
        )));
        add_shaped_body_of_type(&mut world, heightfield, 0.0, Physics3DBodyType::Static);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(
            live_lines(&out)
                .iter()
                .filter(|line| line.feature == Physics3DDebugFeature::Collider)
                .count(),
            8
        );
    }

    #[test]
    fn draws_a_box_as_its_twelve_edges() {
        let mut world = world();
        add_shaped_body(&mut world, unit_box(), 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(
            live_lines(&out)
                .iter()
                .filter(|line| line.feature == Physics3DDebugFeature::Collider)
                .count(),
            12
        );
    }

    #[test]
    fn gives_every_box_edge_unit_length_for_a_unit_cube() {
        let mut world = world();
        add_shaped_body(&mut world, unit_box(), 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;
        options.draw_contacts = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        for line in live_lines(&out) {
            assert!((line_length(line) - 1.0).abs() < 1e-6);
        }
    }

    #[test]
    fn follows_the_body_pose_rather_than_drawing_at_the_origin() {
        let mut world = world();
        let body = add_shaped_body(&mut world, unit_box(), 0.0);
        body.write().unwrap().x = 100.0;
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert!(live_lines(&out).iter().all(|line| line.x0 > 99.0));
    }

    #[test]
    fn turns_a_spun_box_into_edges_that_are_no_longer_axis_aligned() {
        let mut world = world();
        let body = add_shaped_body(&mut world, unit_box(), 0.0);
        {
            let mut body = body.write().unwrap();
            body.orientation_y = (std::f32::consts::PI / 8.0).sin();
            body.orientation_w = (std::f32::consts::PI / 8.0).cos();
        }
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        let axis_aligned = live_lines(&out)
            .iter()
            .filter(|line| (line.x1 - line.x0).abs() < 1e-6 && (line.z1 - line.z0).abs() < 1e-6)
            .count();
        assert_eq!(axis_aligned, 4);
    }

    #[test]
    fn draws_a_sphere_collider_as_one_sphere() {
        let mut world = world();
        add_shaped_body(&mut world, sphere_shape(2.0, 0.0, 0.0, 0.0), 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        let spheres: Vec<_> = live_spheres(&out)
            .iter()
            .filter(|sphere| sphere.feature == Physics3DDebugFeature::Collider)
            .collect();
        assert_eq!(spheres.len(), 1);
        assert_eq!(spheres[0].radius, 2.0);
    }

    #[test]
    fn draws_a_capsule_as_two_caps_joined_by_its_axis() {
        let mut world = world();
        let capsule =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: -2.0,
                y0: 0.0,
                z0: 0.0,
                x1: 2.0,
                y1: 0.0,
                z1: 0.0,
                radius: 0.5,
            }));
        add_shaped_body(&mut world, capsule, 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(
            live_spheres(&out)
                .iter()
                .filter(|sphere| sphere.feature == Physics3DDebugFeature::Collider)
                .count(),
            2
        );
        let axes: Vec<_> = live_lines(&out)
            .iter()
            .filter(|line| line.feature == Physics3DDebugFeature::Collider)
            .collect();
        assert_eq!(axes.len(), 1);
        assert!((line_length(axes[0]) - 4.0).abs() < 1e-6);
    }

    #[test]
    fn draws_a_hull_as_the_wireframe_of_its_own_triangulation() {
        let mut world = world();
        let convex =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            }));
        add_shaped_body(&mut world, convex, 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 12);
        assert_eq!(out.sphere_count, 0);
    }

    #[test]
    fn falls_back_to_vertices_for_a_degenerate_hull() {
        let mut world = world();
        let convex =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0],
            }));
        add_shaped_body(&mut world, convex, 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 0);
        assert_eq!(out.sphere_count, 4);
    }

    #[test]
    fn draws_a_contact_normal_from_each_contact_point() {
        let mut world = world();
        let floor = rigid_body(Physics3DBodyType::Static);
        floor.write().unwrap().y = -1.0;
        add_physics_3d_body(&mut world, &floor);
        let floor_shape =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -10.0,
                min_y: -1.0,
                min_z: -10.0,
                max_x: 10.0,
                max_y: 1.0,
                max_z: 10.0,
            }));
        let floor_collider = physics_3d_collider(&floor_shape, None, None, None);
        add_physics_3d_collider(&mut world, &floor, &floor_collider);
        add_shaped_body(&mut world, unit_box(), -0.05);
        build_physics_3d_contacts(&mut world, &registered_registry());
        let point_count = world.contacts[0].read().unwrap().point_count;
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_colliders = false;
        options.draw_centers_of_mass = false;
        options.contact_normal_length = 2.0;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        let normals: Vec<_> = live_lines(&out)
            .iter()
            .filter(|line| line.feature == Physics3DDebugFeature::ContactNormal)
            .collect();
        assert_eq!(normals.len(), point_count);
        assert!((line_length(normals[0]) - 2.0).abs() < 1e-5);
        assert_ne!(normals[0].body_b, -1);
    }

    #[test]
    fn draws_a_joint_as_the_gap_between_its_two_anchors() {
        let mut world = world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        let first = add_shaped_body(&mut world, unit_box(), 0.0);
        let second = add_shaped_body(&mut world, unit_box(), 0.0);
        second.write().unwrap().x = 5.0;
        let joint = physics_3d_ball_and_socket_joint(&joint_options(
            first.read().unwrap().index,
            second.read().unwrap().index,
        ));
        add_physics_3d_joint(&mut world, &joint);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_colliders = false;
        options.draw_centers_of_mass = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        let joints: Vec<_> = live_lines(&out)
            .iter()
            .filter(|line| line.feature == Physics3DDebugFeature::Joint)
            .collect();
        assert_eq!(joints.len(), 1);
        assert!((line_length(joints[0]) - 5.0).abs() < 1e-6);
    }

    #[test]
    fn draws_the_center_of_mass_where_the_body_actually_balances() {
        let mut world = world();
        let offset_box =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: 1.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 2.5,
                max_y: 0.5,
                max_z: 0.5,
            }));
        add_shaped_body(&mut world, offset_box, 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_colliders = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        let centers: Vec<_> = live_spheres(&out)
            .iter()
            .filter(|sphere| sphere.feature == Physics3DDebugFeature::CenterOfMass)
            .collect();
        assert_eq!(centers.len(), 1);
        assert!((centers[0].x - 2.0).abs() < 1e-6);
    }

    #[test]
    fn honors_each_feature_toggle_independently() {
        let mut world = world();
        add_shaped_body(&mut world, unit_box(), 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_colliders = false;
        options.draw_centers_of_mass = false;
        options.draw_contacts = false;
        options.draw_joints = false;

        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 0);
        assert_eq!(out.sphere_count, 0);
    }

    #[test]
    fn reuses_its_records_after_the_first_frame() {
        let mut world = world();
        add_shaped_body(&mut world, unit_box(), 0.0);
        let mut out = create_physics_3d_debug_geometry();

        write_physics_3d_debug_geometry(&mut out, &world, None);
        let line = &out.lines[0] as *const Physics3DDebugLine;
        let sphere = &out.spheres[0] as *const Physics3DDebugSphere;
        let line_len = out.lines.len();
        write_physics_3d_debug_geometry(&mut out, &world, None);

        assert_eq!(&out.lines[0] as *const Physics3DDebugLine, line);
        assert_eq!(&out.spheres[0] as *const Physics3DDebugSphere, sphere);
        assert_eq!(out.lines.len(), line_len);
    }

    #[test]
    fn retains_capacity_above_the_live_prefix_when_the_scene_shrinks() {
        let mut world = world();
        let body = add_shaped_body(&mut world, unit_box(), 0.0);
        let mut out = create_physics_3d_debug_geometry();
        let mut options = options();
        options.draw_centers_of_mass = false;
        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));
        let stored_len = out.lines.len();
        assert_eq!(stored_len, 12);

        body.write().unwrap().colliders.clear();
        write_physics_3d_debug_geometry(&mut out, &world, Some(&options));

        assert_eq!(out.line_count, 0);
        assert_eq!(out.lines.len(), stored_len);
    }
}
