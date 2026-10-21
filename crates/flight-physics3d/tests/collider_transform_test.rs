use flight_collision::{
    CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionColliderShape3D, CollisionCone3D,
    CollisionConvex3D, CollisionCylinder3D, CollisionShape3D, CollisionSphere3D,
};
use flight_spatial::SpatialAabb3D;

use super::*;
use crate::common::*;

fn box_shape() -> CollisionBox3D {
    CollisionBox3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        half_x: 0.0,
        half_y: 0.0,
        half_z: 0.0,
        rotation_x: 0.0,
        rotation_y: 0.0,
        rotation_z: 0.0,
        rotation_w: 0.0,
    }
}

fn capsule_shape() -> CollisionCapsule3D {
    CollisionCapsule3D {
        x0: 0.0,
        y0: 0.0,
        z0: 0.0,
        x1: 0.0,
        y1: 0.0,
        z1: 0.0,
        radius: 0.0,
    }
}

fn held_collider(local: &CollisionColliderShape3D) -> Physics3DColliderRef {
    physics_3d_collider(local, None, None, None)
}

fn spatial_bounds() -> SpatialAabb3D {
    SpatialAabb3D {
        min_x: 0.0,
        min_y: 0.0,
        min_z: 0.0,
        max_x: 0.0,
        max_y: 0.0,
        max_z: 0.0,
    }
}

fn spun_body() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut body_write = body.write().unwrap();
    body_write.orientation_y = (std::f32::consts::PI / 4.0).sin();
    body_write.orientation_w = (std::f32::consts::PI / 4.0).cos();
    drop(body_write);
    body
}

mod create_physics_3d_collider_world_shape {
    use super::*;

    #[test]
    fn does_not_alias_local_hull_points() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![1.0, 2.0, 3.0],
            }));
        let world = create_physics_3d_collider_world_shape(&local);
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(local)) = &local else {
            panic!("expected local convex hull")
        };
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(world)) = &world else {
            panic!("expected world convex hull")
        };
        assert_ne!(world.points.as_ptr(), local.points.as_ptr());
    }

    #[test]
    fn keeps_the_kind_for_shapes_a_rigid_transform_cannot_change() {
        let sphere = create_physics_3d_collider_world_shape(&sphere_shape(4.0, 1.0, 2.0, 3.0));
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) = sphere else {
            panic!("expected sphere")
        };
        assert_eq!(
            (sphere.x, sphere.y, sphere.z, sphere.radius),
            (1.0, 2.0, 3.0, 4.0)
        );

        let capsule =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: 0.0,
                y0: 0.0,
                z0: 0.0,
                x1: 0.0,
                y1: 1.0,
                z1: 0.0,
                radius: 1.0,
            }));
        assert!(matches!(
            create_physics_3d_collider_world_shape(&capsule),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(_))
        ));

        let convex =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0],
            }));
        assert!(matches!(
            create_physics_3d_collider_world_shape(&convex),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(_))
        ));
    }

    #[test]
    fn promotes_an_axis_aligned_box_to_an_oriented_box() {
        let local = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        }));
        let world = create_physics_3d_collider_world_shape(&local);
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(box_shape)) = world else {
            panic!("expected oriented box")
        };
        assert_eq!(box_shape.rotation_w, 1.0);
    }

    #[test]
    fn sizes_hull_storage_from_the_local_shape() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
            }));
        let world = create_physics_3d_collider_world_shape(&local);
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(world)) = world else {
            panic!("expected convex hull")
        };
        assert_eq!(world.points.len(), 6);
    }
}

mod initialize_collision_box_3d {
    use super::*;

    #[test]
    fn writes_identity_rotation() {
        let mut out = box_shape();
        initialize_collision_box_3d(&mut out);
        assert_eq!(out.rotation_w, 1.0);
    }
}

mod initialize_collision_capsule_3d {
    use super::*;

    #[test]
    fn writes_endpoints_and_radius() {
        let mut out = capsule_shape();
        initialize_collision_capsule_3d(&mut out, 2.0, 1.0, 4.0, 2.0, 5.0, 3.0, 6.0);
        assert_eq!((out.x0, out.z1, out.radius), (1.0, 6.0, 2.0));
    }
}

mod initialize_collision_cone_3d {
    use super::*;

    #[test]
    fn writes_endpoints_and_radius() {
        let mut out = CollisionCone3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.0,
        };
        initialize_collision_cone_3d(&mut out, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0);
        assert_eq!((out.x0, out.z1, out.radius), (1.0, 6.0, 7.0));
    }
}

mod initialize_collision_convex_3d {
    use super::*;

    #[test]
    fn replaces_points() {
        let mut out = CollisionConvex3D { points: Vec::new() };
        initialize_collision_convex_3d(&mut out, vec![1.0, 2.0, 3.0]);
        assert_eq!(out.points, vec![1.0, 2.0, 3.0]);
    }
}

mod initialize_collision_cylinder_3d {
    use super::*;

    #[test]
    fn writes_endpoints_and_radius() {
        let mut out = CollisionCylinder3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.0,
        };
        initialize_collision_cylinder_3d(&mut out, 2.0, 1.0, 4.0, 2.0, 5.0, 3.0, 6.0);
        assert_eq!((out.x0, out.z1, out.radius), (1.0, 6.0, 2.0));
    }
}

mod initialize_collision_sphere_3d {
    use super::*;

    #[test]
    fn writes_center_and_radius() {
        let mut out = CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 0.0,
        };
        initialize_collision_sphere_3d(&mut out, 4.0, 1.0, 2.0, 3.0);
        assert_eq!((out.x, out.y, out.z, out.radius), (1.0, 2.0, 3.0, 4.0));
    }
}

mod update_physics_3d_collider_world_shape {
    use super::*;

    #[test]
    fn carries_body_orientation_onto_a_promoted_aabb() {
        let body = spun_body();
        let local = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        }));
        let collider = held_collider(&local);

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(world_box)) = &collider.world
        else {
            panic!("expected box")
        };
        assert!((world_box.half_x - 1.0).abs() < 1.0e-6);
        assert!((world_box.half_z - 3.0).abs() < 1.0e-6);
        assert!((world_box.rotation_y - body.read().unwrap().orientation_y).abs() < 1.0e-6);
    }

    #[test]
    fn composes_body_and_local_rotations() {
        let half = (std::f32::consts::PI / 4.0).sin();
        let local = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: half,
            rotation_z: 0.0,
            rotation_w: half,
        }));
        let collider = held_collider(&local);
        let body = spun_body();

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(world_box)) = &collider.world
        else {
            panic!("expected box")
        };
        assert!((world_box.rotation_y - 1.0).abs() < 1.0e-6);
        assert!(world_box.rotation_w.abs() < 1.0e-6);
    }

    #[test]
    fn moves_both_capsule_endpoints() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: 0.0,
                y0: -1.0,
                z0: 0.0,
                x1: 0.0,
                y1: 1.0,
                z1: 0.0,
                radius: 0.5,
            }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        body.write().unwrap().y = 5.0;

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(capsule)) = &collider.world
        else {
            panic!("expected capsule")
        };
        assert!((capsule.y0 - 4.0).abs() < 1.0e-6);
        assert!((capsule.y1 - 6.0).abs() < 1.0e-6);
    }

    #[test]
    fn moves_every_hull_point() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        body.write().unwrap().x = 100.0;

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(convex)) = &collider.world
        else {
            panic!("expected convex hull")
        };
        assert_eq!(
            convex.points,
            vec![100.0, 0.0, 0.0, 101.0, 0.0, 0.0, 100.0, 1.0, 0.0]
        );
    }

    #[test]
    fn rotates_a_sphere_offset_about_the_body_origin() {
        let collider = held_collider(&sphere_shape(1.0, 1.0, 0.0, 0.0));
        let body = spun_body();

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) = &collider.world
        else {
            panic!("expected sphere")
        };
        assert!(sphere.x.abs() < 1.0e-6);
        assert!((sphere.z + 1.0).abs() < 1.0e-6);
    }

    #[test]
    fn translates_a_sphere_by_the_body_position() {
        let collider = held_collider(&sphere_shape(2.0, 1.0, 0.0, 0.0));
        let body = create_rigid_body_3d();
        {
            let mut body = body.write().unwrap();
            body.x = 10.0;
            body.y = 20.0;
            body.z = 30.0;
        }

        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) = &collider.world
        else {
            panic!("expected sphere")
        };
        assert_eq!(
            (sphere.x, sphere.y, sphere.z, sphere.radius),
            (11.0, 20.0, 30.0, 2.0)
        );
    }

    #[test]
    fn writes_in_place_across_repeated_updates() {
        let collider = held_collider(&sphere_shape(1.0, 0.0, 0.0, 0.0));
        let body = create_rigid_body_3d();
        let before = {
            let collider = collider.read().unwrap();
            let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) =
                &collider.world
            else {
                panic!("expected sphere")
            };
            std::ptr::from_ref(sphere) as usize
        };

        body.write().unwrap().x = 1.0;
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        body.write().unwrap().x = 2.0;
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );

        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) = &collider.world
        else {
            panic!("expected sphere")
        };
        assert_eq!(std::ptr::from_ref(sphere) as usize, before);
        assert_eq!(sphere.x, 2.0);
    }
}

mod write_physics_3d_collider_bounds {
    use super::*;

    #[test]
    fn bounds_a_capsule_by_both_endpoints_plus_the_radius() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: -2.0,
                y0: 0.0,
                z0: 0.0,
                x1: 2.0,
                y1: 0.0,
                z1: 0.0,
                radius: 0.5,
            }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert_eq!(
            out,
            SpatialAabb3D {
                min_x: -2.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 2.5,
                max_y: 0.5,
                max_z: 0.5,
            }
        );
    }

    #[test]
    fn bounds_a_hull_by_its_extreme_points() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![-1.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 7.0, 0.0, 0.0, 0.0, -2.0],
            }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert_eq!(
            out,
            SpatialAabb3D {
                min_x: -1.0,
                min_y: 0.0,
                min_z: -2.0,
                max_x: 3.0,
                max_y: 7.0,
                max_z: 0.0,
            }
        );
    }

    #[test]
    fn bounds_a_sphere_by_its_radius() {
        let collider = held_collider(&sphere_shape(4.0, 1.0, 2.0, 3.0));
        let body = create_rigid_body_3d();
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert_eq!(
            out,
            SpatialAabb3D {
                min_x: -3.0,
                min_y: -2.0,
                min_z: -1.0,
                max_x: 5.0,
                max_y: 6.0,
                max_z: 7.0,
            }
        );
    }

    #[test]
    fn grows_an_oriented_box_to_the_extent_its_rotation_sweeps() {
        let local = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        {
            let mut body = body.write().unwrap();
            body.orientation_y = (std::f32::consts::PI / 8.0).sin();
            body.orientation_w = (std::f32::consts::PI / 8.0).cos();
        }
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert!((out.max_x - std::f32::consts::SQRT_2).abs() < 1.0e-6);
        assert!((out.max_z - std::f32::consts::SQRT_2).abs() < 1.0e-6);
        assert!((out.max_y - 1.0).abs() < 1.0e-6);
    }

    #[test]
    fn leaves_an_unrotated_box_at_its_own_extent() {
        let local = CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        }));
        let collider = held_collider(&local);
        let body = create_rigid_body_3d();
        update_physics_3d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert_eq!(
            out,
            SpatialAabb3D {
                min_x: -1.0,
                min_y: -2.0,
                min_z: -3.0,
                max_x: 1.0,
                max_y: 2.0,
                max_z: 3.0,
            }
        );
    }

    #[test]
    fn zeroes_the_bounds_of_an_empty_hull() {
        let local =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Convex(CollisionConvex3D {
                points: Vec::new(),
            }));
        let collider = held_collider(&local);
        let mut out = spatial_bounds();

        write_physics_3d_collider_bounds(&collider.read().unwrap(), &mut out);

        assert_eq!(out, spatial_bounds());
    }
}
