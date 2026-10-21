use flight_collision::*;
use flight_collision::contract::*;

mod clear_collision_manifold3d {
    use super::*;

    #[test]
    fn resets_every_field_so_a_reused_out_never_carries_a_stale_normal_into_a_miss() {
        let mut manifold = create_collision_manifold3d();
        manifold.overlapping = true;
        manifold.normal_x = 1.0;
        manifold.normal_y = 2.0;
        manifold.normal_z = 3.0;
        manifold.depth = 4.0;
        clear_collision_manifold3d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.normal_z, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }
}

mod create_collision_manifold3d {
    use super::*;

    #[test]
    fn allocates_in_the_non_overlapping_state() {
        let manifold = create_collision_manifold3d();
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.normal_z, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }

    #[test]
    fn returns_a_fresh_record_each_call() {
        let mut a = create_collision_manifold3d();
        let b = create_collision_manifold3d();
        a.overlapping = true;
        assert_eq!(b.overlapping, false);
    }
}

mod initialize_collision_manifold3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_manifold3d() {
        let mut manifold = create_collision_manifold3d();
        initialize_collision_manifold3d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.normal_z, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }
}
