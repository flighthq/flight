use flight_collision::contract::*;

mod clear_collision_contact_manifold2d {
    use super::*;

    #[test]
    fn resets_the_manifold_to_the_non_overlapping_state() {
        let mut manifold = create_collision_contact_manifold2d();
        manifold.overlapping = true;
        manifold.normal_x = 1.0;
        manifold.normal_y = -1.0;
        manifold.depth = 4.0;
        manifold.point_count = 2;

        clear_collision_contact_manifold2d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.depth, 0.0);
        assert_eq!(manifold.point_count, 0);
    }

    #[test]
    fn keeps_the_point_array_allocated_so_a_cleared_manifold_stays_reusable() {
        let mut manifold = create_collision_contact_manifold2d();
        clear_collision_contact_manifold2d(&mut manifold);
        assert_eq!(manifold.points.len(), MAX_COLLISION_CONTACT_POINTS_2D);
    }
}

mod create_collision_contact_manifold2d {
    use super::*;

    #[test]
    fn starts_non_overlapping_with_zeroed_normal_depth_and_point_count() {
        let manifold = create_collision_contact_manifold2d();
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.depth, 0.0);
        assert_eq!(manifold.point_count, 0);
    }

    #[test]
    fn preallocates_both_contact_points_so_the_hot_path_never_allocates() {
        let manifold = create_collision_contact_manifold2d();
        assert_eq!(manifold.points.len(), MAX_COLLISION_CONTACT_POINTS_2D);
        for point in &manifold.points {
            assert_eq!(point.x, 0.0);
            assert_eq!(point.y, 0.0);
            assert_eq!(point.depth, 0.0);
            assert_eq!(point.feature_id, 0);
        }
    }

    #[test]
    fn gives_each_manifold_its_own_points_rather_than_sharing_one_array() {
        let mut first = create_collision_contact_manifold2d();
        let second = create_collision_contact_manifold2d();
        first.points[0].x = 99.0;
        assert_eq!(second.points[0].x, 0.0);
    }
}

mod initialize_collision_contact_manifold2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_contact_manifold2d() {
        let mut manifold = create_collision_contact_manifold2d();
        initialize_collision_contact_manifold2d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.point_count, 0);
    }
}
