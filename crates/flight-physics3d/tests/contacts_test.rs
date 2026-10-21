use super::*;

mod create_physics_3d_contact {
    use super::*;

    #[test]
    fn starts_with_unassigned_bodies_and_colliders() {
        let contact = create_physics_3d_contact();
        let contact = contact.read().unwrap();
        assert_eq!((contact.body_a, contact.body_b), (0, 0));
        assert_eq!((contact.collider_a, contact.collider_b), (0, 0));
        assert!(contact.enabled);
        assert!(!contact.sensor);
        assert!(!contact.touching);
        assert_eq!(contact.point_count, 0);
        assert!(contact.points.is_empty());
        assert_eq!(
            (contact.normal_x, contact.normal_y, contact.normal_z),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(contact.friction, 0.0);
        assert_eq!(contact.restitution, 0.0);
    }

    #[test]
    fn allocates_independent_point_storage() {
        let first = create_physics_3d_contact();
        let second = create_physics_3d_contact();
        first
            .write()
            .unwrap()
            .points
            .push(create_physics_3d_contact_point());
        assert_eq!(first.read().unwrap().points.len(), 1);
        assert!(second.read().unwrap().points.is_empty());
    }
}

mod create_physics_3d_contact_point {
    use super::*;

    #[test]
    fn creates_a_zeroed_point() {
        let point = create_physics_3d_contact_point();
        assert_eq!(
            (point.x, point.y, point.z, point.depth),
            (0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(point.feature_id, 0);
        assert_eq!((point.r_ax, point.r_ay, point.r_az), (0.0, 0.0, 0.0));
        assert_eq!((point.r_bx, point.r_by, point.r_bz), (0.0, 0.0, 0.0));
    }
}

mod initialize_physics_3d_contact {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_contact() {
        let contact = create_physics_3d_contact();
        let mut contact = contact.write().unwrap();
        contact.body_a = 4;
        contact.body_b = 3;
        contact.collider_a = 6;
        contact.collider_b = 5;
        contact.touching = true;
        contact.points.push(create_physics_3d_contact_point());
        initialize_physics_3d_contact(&mut contact);
        assert_eq!((contact.body_a, contact.body_b), (0, 0));
        assert_eq!((contact.collider_a, contact.collider_b), (0, 0));
        assert!(contact.points.is_empty());
        assert!(!contact.touching);
    }
}

mod initialize_physics_3d_contact_point {
    use super::*;

    #[test]
    fn clears_existing_geometry_and_impulse_arms() {
        let mut point = create_physics_3d_contact_point();
        point.x = 4.0;
        point.r_bz = 9.0;
        initialize_physics_3d_contact_point(&mut point);
        assert_eq!(point.x, 0.0);
        assert_eq!(point.r_bz, 0.0);
    }
}
