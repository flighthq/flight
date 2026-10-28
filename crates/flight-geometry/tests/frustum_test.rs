use flight_geometry::contract::*;

fn create_test_view_projection() -> Matrix4 {
    let projection = create_perspective_matrix4(0.5, 1.0, 0.1, 100.0);
    let mut view = create_matrix4();
    set_matrix4_look_at(
        &mut view,
        &create_vector3(0.0, 0.0, 5.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    let mut vp = create_matrix4();
    multiply_matrix4(&mut vp, &projection, &view);
    return vp;
}

mod create_frustum {
    use super::*;

    #[test]
    fn creates_six_zero_planes() {
        let f = create_frustum();
        assert_eq!(f.top.a, 0.0);
        assert_eq!(f.bottom.a, 0.0);
        assert_eq!(f.left.a, 0.0);
        assert_eq!(f.right.a, 0.0);
        assert_eq!(f.near.a, 0.0);
        assert_eq!(f.far.a, 0.0);
    }
}

mod get_frustum_corners {
    use super::*;

    #[test]
    fn writes_8_corners_for_a_perspective_frustum() {
        let vp = create_test_view_projection();
        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &vp);
        let mut corners = [
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
        ];
        get_frustum_corners(&mut corners, &inv);
        for i in 0..8 {
            assert!(corners[i].x.is_finite());
            assert!(corners[i].y.is_finite());
            assert!(corners[i].z.is_finite());
            for j in (i + 1)..8 {
                let dx = (corners[i].x - corners[j].x).abs();
                let dy = (corners[i].y - corners[j].y).abs();
                let dz = (corners[i].z - corners[j].z).abs();
                assert!(dx > 1e-4 || dy > 1e-4 || dz > 1e-4);
            }
        }
    }

    #[test]
    fn near_corners_are_closer_to_the_camera_than_far_corners() {
        let vp = create_test_view_projection();
        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &vp);
        let mut corners = [
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
        ];
        get_frustum_corners(&mut corners, &inv);
        for i in 0..4 {
            for j in 4..8 {
                assert!(
                    corners[i].z > corners[j].z,
                    "near corner {} z={} should be > far corner {} z={}",
                    i,
                    corners[i].z,
                    j,
                    corners[j].z
                );
            }
        }
    }

    #[test]
    fn writes_only_as_many_corners_as_out_length() {
        let vp = create_test_view_projection();
        let mut inv = create_matrix4();
        inverse_matrix4(&mut inv, &vp);
        let mut corners = [create_vector3(0.0, 0.0, 0.0), create_vector3(0.0, 0.0, 0.0)];
        get_frustum_corners(&mut corners, &inv);
        assert!(corners[0].x.is_finite());
        assert!(corners[1].x.is_finite());
    }

    #[test]
    fn writes_finite_corners_for_a_matrix_that_divides_a_corner_by_zero() {
        let mut corners = [
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
            create_vector3(0.0, 0.0, 0.0),
        ];
        let mut m = create_matrix4();
        m.m = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        ];
        get_frustum_corners(&mut corners, &m);
        for corner in &corners {
            assert!(corner.x.is_finite());
            assert!(corner.y.is_finite());
            assert!(corner.z.is_finite());
        }
    }
}

mod initialize_frustum {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_frustum() {
        let mut f = create_frustum();
        initialize_frustum(
            &mut f,
            create_plane(1.0, 0.0, 0.0, 0.0),
            create_plane(0.0, 1.0, 0.0, 0.0),
            create_plane(0.0, 0.0, 1.0, 0.0),
            create_plane(0.0, 0.0, 0.0, 1.0),
            create_plane(1.0, 1.0, 0.0, 0.0),
            create_plane(0.0, 1.0, 1.0, 0.0),
        );
        assert_eq!(f.bottom.a, 1.0);
        assert_eq!(f.far.b, 1.0);
        assert_eq!(f.left.c, 1.0);
        assert_eq!(f.near.d, 1.0);
        assert_eq!(f.right.a, 1.0);
        assert_eq!(f.right.b, 1.0);
        assert_eq!(f.top.b, 1.0);
        assert_eq!(f.top.c, 1.0);
    }
}

mod is_frustum_containing_point {
    use super::*;

    #[test]
    fn contains_a_point_in_front_of_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(is_frustum_containing_point(
            &f,
            &create_vector3(0.0, 0.0, 0.0)
        ));
    }

    #[test]
    fn rejects_a_point_behind_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_containing_point(
            &f,
            &create_vector3(0.0, 0.0, 20.0)
        ));
    }

    #[test]
    fn rejects_a_point_far_off_to_the_side() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_containing_point(
            &f,
            &create_vector3(100.0, 0.0, 0.0)
        ));
    }
}

mod is_frustum_intersecting_aabb {
    use super::*;

    #[test]
    fn accepts_a_box_straddling_the_origin() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(is_frustum_intersecting_aabb(
            &f,
            &create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0)
        ));
    }

    #[test]
    fn rejects_a_box_entirely_behind_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_intersecting_aabb(
            &f,
            &create_aabb(-1.0, -1.0, 10.0, 1.0, 1.0, 12.0)
        ));
    }

    #[test]
    fn rejects_a_box_far_off_to_the_side() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_intersecting_aabb(
            &f,
            &create_aabb(50.0, 50.0, -1.0, 60.0, 60.0, 1.0)
        ));
    }

    #[test]
    fn rejects_an_aabb_empty_on_x() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_matrix4());
        assert!(!is_frustum_intersecting_aabb(
            &f,
            &create_aabb(0.5, -0.5, -0.5, -0.5, 0.5, 0.5)
        ));
    }

    #[test]
    fn rejects_an_aabb_empty_on_y() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_matrix4());
        assert!(!is_frustum_intersecting_aabb(
            &f,
            &create_aabb(-0.5, 0.5, -0.5, 0.5, -0.5, 0.5)
        ));
    }

    #[test]
    fn rejects_an_aabb_empty_on_z() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_matrix4());
        assert!(!is_frustum_intersecting_aabb(
            &f,
            &create_aabb(-0.5, -0.5, 0.5, 0.5, 0.5, -0.5)
        ));
    }
}

mod is_frustum_intersecting_obb {
    use super::*;

    #[test]
    fn accepts_an_axis_aligned_obb_inside_the_frustum() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        let obb = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(is_frustum_intersecting_obb(&f, &obb));
    }

    #[test]
    fn rejects_an_obb_behind_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        let obb = create_obb(0.0, 0.0, 20.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(!is_frustum_intersecting_obb(&f, &obb));
    }

    #[test]
    fn rejects_an_obb_to_the_far_right() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        let obb = create_obb(100.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(!is_frustum_intersecting_obb(&f, &obb));
    }
}

mod is_frustum_intersecting_sphere {
    use super::*;

    #[test]
    fn accepts_a_sphere_centered_in_front_of_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(is_frustum_intersecting_sphere(
            &f,
            &create_bounding_sphere(0.0, 0.0, 0.0, 1.0)
        ));
    }

    #[test]
    fn rejects_a_sphere_entirely_behind_the_camera() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_intersecting_sphere(
            &f,
            &create_bounding_sphere(0.0, 0.0, 20.0, 1.0)
        ));
    }

    #[test]
    fn rejects_an_empty_sphere_negative_radius() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(!is_frustum_intersecting_sphere(
            &f,
            &create_bounding_sphere(0.0, 0.0, 0.0, -1.0)
        ));
    }

    #[test]
    fn accepts_a_sphere_that_straddles_the_near_plane() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        assert!(is_frustum_intersecting_sphere(
            &f,
            &create_bounding_sphere(0.0, 0.0, 5.5, 2.0)
        ));
    }
}

mod set_frustum_from_matrix4 {
    use super::*;

    #[test]
    fn produces_unit_length_plane_normals() {
        let mut f = create_frustum();
        set_frustum_from_matrix4(&mut f, &create_test_view_projection());
        let near = f.near;
        let len = (near.a * near.a + near.b * near.b + near.c * near.c).sqrt();
        let diff = (len - 1.0).abs();
        assert!(
            diff < 1e-5,
            "expected near-plane normal length ~1.0, got {len}"
        );
    }

    #[test]
    fn writes_finite_coefficients_for_a_matrix_with_no_frustum_in_it() {
        let mut f = create_frustum();
        let mut m = create_matrix4();
        m.m = [0.0; 16];
        set_frustum_from_matrix4(&mut f, &m);
        for plane in &[f.near, f.far, f.left, f.right, f.top, f.bottom] {
            assert!(plane.a.is_finite());
            assert!(plane.b.is_finite());
            assert!(plane.c.is_finite());
            assert!(plane.d.is_finite());
        }
    }
}
