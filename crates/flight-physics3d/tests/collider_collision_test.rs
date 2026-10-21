use flight_collision::{
    create_collision_contact_manifold3d, create_collision_raycast_hit3d,
    create_collision_time_of_impact3d,
};

use super::*;
use crate::common::*;

mod collide_physics_3d_collider_shapes {
    use super::*;

    #[test]
    fn detects_overlapping_spheres() {
        let registry = registered_registry();
        let mut out = create_collision_contact_manifold3d();
        assert!(collide_physics_3d_collider_shapes(
            &mut out,
            &registry,
            &sphere_shape(1.0, 0.0, 0.0, 0.0),
            &sphere_shape(1.0, 1.0, 0.0, 0.0),
        ));
        assert!(out.point_count > 0);
    }
}

mod raycast_physics_3d_collider_shape {
    use super::*;

    #[test]
    fn hits_a_sphere() {
        let mut out = create_collision_raycast_hit3d();
        assert!(raycast_physics_3d_collider_shape(
            &mut out,
            &sphere_shape(1.0, 0.0, 0.0, 0.0),
            -2.0,
            0.0,
            0.0,
            4.0,
            0.0,
            0.0,
            None,
        ));
        assert_eq!(out.fraction, 0.25);
    }
}

mod sweep_physics_3d_collider_shapes {
    use super::*;

    #[test]
    fn finds_a_future_sphere_impact() {
        let registry = registered_registry();
        let mut out = create_collision_time_of_impact3d();
        assert!(sweep_physics_3d_collider_shapes(
            &mut out,
            &registry,
            &sphere_shape(1.0, -3.0, 0.0, 0.0),
            4.0,
            0.0,
            0.0,
            &sphere_shape(1.0, 0.0, 0.0, 0.0),
            0.0,
            0.0,
            0.0,
            None,
        ));
        assert!(out.fraction > 0.0 && out.fraction < 1.0);
    }
}
