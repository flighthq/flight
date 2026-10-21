use flight_spatial::SpatialAabb3D;

use super::*;
use crate::common::*;

fn bounds() -> SpatialAabb3D {
    SpatialAabb3D {
        min_x: -1.0,
        min_y: -1.0,
        min_z: -1.0,
        max_x: 1.0,
        max_y: 1.0,
        max_z: 1.0,
    }
}

mod get_physics_3d_broadphase_body_indices {
    use super::*;

    #[test]
    fn returns_the_world_owned_set() {
        let mut world = world();
        get_physics_3d_broadphase_body_indices(&mut world).insert(4);
        assert!(get_physics_3d_broadphase_body_indices(&mut world).contains(&4));
    }
}

mod publish_physics_3d_broadphase_body {
    use super::*;

    #[test]
    fn records_successful_publication() {
        let mut world = world();
        publish_physics_3d_broadphase_body(&mut world, 4, &bounds());
        assert!(get_physics_3d_broadphase_body_indices(&mut world).contains(&4));
    }
}

mod withdraw_physics_3d_broadphase_body {
    use super::*;

    #[test]
    fn removes_publication() {
        let mut world = world();
        publish_physics_3d_broadphase_body(&mut world, 4, &bounds());
        withdraw_physics_3d_broadphase_body(&mut world, 4);
        assert!(!get_physics_3d_broadphase_body_indices(&mut world).contains(&4));
    }
}
