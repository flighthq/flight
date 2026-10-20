use flight_collision::*;

mod clear_collision_contact_manifold3d {
    use super::*;

    #[test]
    fn resets_the_overlap_state_and_the_point_count() {
        let mut manifold = create_collision_contact_manifold3d();
        manifold.overlapping = true;
        manifold.normal_x = 1.0;
        manifold.normal_y = 2.0;
        manifold.normal_z = 3.0;
        manifold.point_count = 4;
        clear_collision_contact_manifold3d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.normal_x, 0.0);
        assert_eq!(manifold.normal_y, 0.0);
        assert_eq!(manifold.normal_z, 0.0);
        assert_eq!(manifold.point_count, 0);
    }

    #[test]
    fn keeps_the_point_array_and_its_entries_so_a_held_reference_survives_a_miss() {
        let mut manifold = create_collision_contact_manifold3d();
        clear_collision_contact_manifold3d(&mut manifold);
        assert_eq!(manifold.points.len(), MAX_COLLISION_CONTACT_POINTS_3D);
    }
}

mod create_collision_contact_manifold3d {
    use super::*;

    #[test]
    fn allocates_the_full_point_array_up_front_so_the_narrow_phase_never_grows_it() {
        let manifold = create_collision_contact_manifold3d();
        assert_eq!(manifold.points.len(), MAX_COLLISION_CONTACT_POINTS_3D);
        assert_eq!(manifold.point_count, 0);
        assert_eq!(manifold.overlapping, false);
    }

    #[test]
    fn gives_each_manifold_its_own_points() {
        let mut a = create_collision_contact_manifold3d();
        let b = create_collision_contact_manifold3d();
        a.points[0].x = 42.0;
        assert_eq!(b.points[0].x, 0.0);
    }
}

mod initialize_collision_contact_manifold3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_contact_manifold3d() {
        let mut manifold = CollisionContactManifold3D::default();
        initialize_collision_contact_manifold3d(&mut manifold);
        assert_eq!(manifold.overlapping, false);
        assert_eq!(manifold.point_count, 0);
    }
}
