use flight_collision::*;

mod clear_collision_manifold2d {
    use super::*;

    #[test]
    fn resets_every_field_to_the_non_overlapping_state() {
        let mut manifold = create_collision_manifold2d();
        manifold.overlapping = true;
        manifold.normal_x = 0.5;
        manifold.normal_y = -0.5;
        manifold.depth = 3.0;
        clear_collision_manifold2d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }
}

mod create_collision_manifold2d {
    use super::*;

    #[test]
    fn allocates_a_fresh_manifold_in_the_non_overlapping_state() {
        let manifold = create_collision_manifold2d();
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }

    #[test]
    fn returns_an_independent_object_each_call() {
        let mut a = create_collision_manifold2d();
        let b = create_collision_manifold2d();
        a.overlapping = true;
        assert_eq!(b.overlapping, false);
    }
}

mod initialize_collision_manifold2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_manifold2d() {
        let mut manifold = CollisionManifold2D::default();
        initialize_collision_manifold2d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.depth, 0.0);
    }
}
