use flight_geometry::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {} to be approximately {}, diff = {}",
        actual, expected, diff
    );
}

fn assert_approx_tight(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-6,
        "expected {} to be approximately {}, diff = {}",
        actual, expected, diff
    );
}

mod create_ray3d {
    use super::*;

    #[test]
    fn creates_a_ray_with_explicit_origin_and_direction() {
        let ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 1.0, 0.0);
        assert_eq!(ray.origin.x, 1.0);
        assert_eq!(ray.origin.y, 2.0);
        assert_eq!(ray.origin.z, 3.0);
        assert_eq!(ray.direction.x, 0.0);
        assert_eq!(ray.direction.y, 1.0);
        assert_eq!(ray.direction.z, 0.0);
    }
}

mod get_closest_point_between_ray3ds {
    use super::*;

    #[test]
    fn finds_the_closest_points_between_two_skew_rays() {
        let a = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = create_ray3d(2.0, 0.0, 1.0, 0.0, 1.0, 0.0);
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        assert_approx(pa.x, 2.0);
        assert_approx(pa.y, 0.0);
        assert_approx(pa.z, 0.0);
        assert_approx(pb.x, 2.0);
        assert_approx(pb.y, 0.0);
        assert_approx(pb.z, 1.0);
    }

    #[test]
    fn clamps_to_the_origins_when_both_rays_point_away() {
        let a = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = create_ray3d(-1.0, 1.0, 0.0, -1.0, 0.0, 0.0);
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        assert_approx(pa.x, 0.0);
        assert_approx(pa.y, 0.0);
        assert_approx(pb.x, -1.0);
        assert_approx(pb.y, 1.0);
    }

    #[test]
    fn handles_parallel_rays() {
        let a = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = create_ray3d(0.0, 2.0, 0.0, 1.0, 0.0, 0.0);
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        let dist = ((pa.x - pb.x).powi(2) + (pa.y - pb.y).powi(2) + (pa.z - pb.z).powi(2)).sqrt();
        assert_approx(dist, 2.0);
    }

    #[test]
    fn clamps_to_origin_of_first_ray_when_nearest_approach_is_behind() {
        let a = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = create_ray3d(-5.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        assert_approx(pa.x, 0.0);
        assert_approx(pa.y, 0.0);
        assert_approx(pa.z, 0.0);
        assert_approx(pb.x, -5.0);
        assert_approx(pb.y, 1.0);
        assert_approx(pb.z, 0.0);
    }

    #[test]
    fn clamps_both_rays_to_their_origins() {
        let a = create_ray3d(5.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let b = create_ray3d(0.0, 3.0, 0.0, 0.0, 1.0, 0.0);
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_between_ray3ds(&mut pa, &mut pb, &a, &b);
        assert_approx(pa.x, 5.0);
        assert_approx(pa.y, 0.0);
        assert_approx(pb.x, 0.0);
        assert_approx(pb.y, 3.0);
    }

    #[test]
    fn writes_finite_points_when_either_direction_has_no_length() {
        let mut pa = create_vector3(0.0, 0.0, 0.0);
        let mut pb = create_vector3(0.0, 0.0, 0.0);

        get_closest_point_between_ray3ds(&mut pa, &mut pb, &create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0), &create_ray3d(5.0, 1.0, 0.0, 0.0, 0.0, 0.0));
        assert!(pa.x.is_finite() && pa.y.is_finite() && pa.z.is_finite());
        assert_eq!(pb.x, 5.0);
        assert_eq!(pb.y, 1.0);

        get_closest_point_between_ray3ds(&mut pa, &mut pb, &create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0), &create_ray3d(0.0, 0.0, 5.0, 0.0, 0.0, 1.0));
        assert_eq!(pa.x, 0.0);
        assert_eq!(pa.y, 0.0);
        assert_eq!(pa.z, 0.0);
        assert!(pb.x.is_finite() && pb.y.is_finite() && pb.z.is_finite());
    }
}

mod get_closest_point_on_ray3d {
    use super::*;

    #[test]
    fn projects_a_point_onto_the_ray() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &ray, &create_vector3(3.0, 4.0, 0.0));
        assert_approx(out.x, 3.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn clamps_to_origin_when_point_projects_behind() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &ray, &create_vector3(-5.0, 2.0, 0.0));
        assert_approx(out.x, 0.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn works_with_non_normalized_direction() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 2.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &ray, &create_vector3(3.0, 7.0, 0.0));
        assert_approx(out.x, 3.0);
        assert_approx(out.y, 0.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 1.0, 0.0);
        let mut p = create_vector3(5.0, 4.0, 1.0);
        let snap = p.clone();
        get_closest_point_on_ray3d(&mut p, &ray, &snap);
        assert_approx(p.x, 0.0);
        assert_approx(p.y, 4.0);
        assert_approx(p.z, 0.0);
    }

    #[test]
    fn writes_origin_for_ray_with_no_direction() {
        let ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_ray3d(&mut out, &ray, &create_vector3(9.0, 9.0, 9.0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }
}

mod get_ray3d_point_at {
    use super::*;

    #[test]
    fn returns_origin_when_t_is_zero() {
        let ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_ray3d_point_at(&mut out, &ray, 0.0);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn advances_along_direction_by_t() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_ray3d_point_at(&mut out, &ray, 5.0);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
    }

    #[test]
    fn is_safe_when_out_aliases_ray_origin() {
        let mut ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 1.0, 0.0);
        let snap = ray.clone();
        get_ray3d_point_at(&mut ray.origin, &snap, 3.0);
        assert_eq!(ray.origin.x, 1.0);
        assert_eq!(ray.origin.y, 5.0);
        assert_eq!(ray.origin.z, 3.0);
    }
}

mod initialize_ray3d {
    use super::*;

    #[test]
    fn copies_the_origin_and_direction_vectors() {
        let origin = create_vector3(1.0, 2.0, 3.0);
        let direction = create_vector3(0.0, 0.0, 1.0);
        let mut out = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        initialize_ray3d(&mut out, &origin, &direction);
        assert_eq!((out.origin.x, out.origin.y, out.origin.z), (1.0, 2.0, 3.0));
        assert_eq!(
            (out.direction.x, out.direction.y, out.direction.z),
            (0.0, 0.0, 1.0)
        );
    }
}

mod intersect_ray3d_aabb {
    use super::*;

    #[test]
    fn returns_zero_when_origin_inside() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(intersect_ray3d_aabb(&ray, &aabb), 0.0);
    }

    #[test]
    fn returns_entry_t_from_outside() {
        let ray = create_ray3d(0.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_approx(intersect_ray3d_aabb(&ray, &aabb), 4.0);
    }

    #[test]
    fn returns_negative_one_when_miss() {
        let ray = create_ray3d(5.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(intersect_ray3d_aabb(&ray, &aabb), -1.0);
    }

    #[test]
    fn returns_negative_one_when_pointing_away() {
        let ray = create_ray3d(0.0, 0.0, 5.0, 0.0, 0.0, 1.0);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(intersect_ray3d_aabb(&ray, &aabb), -1.0);
    }

    #[test]
    fn handles_axis_aligned_rays() {
        let ray = create_ray3d(-5.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_approx(intersect_ray3d_aabb(&ray, &aabb), 4.0);
    }

    #[test]
    fn returns_negative_one_for_empty_aabb_on_each_axis() {
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(5.0, 1.5, 1.5, -1.0, 0.0, 0.0), &create_aabb(2.0, 1.0, 1.0, 1.0, 2.0, 2.0)), -1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(1.5, 5.0, 1.5, 0.0, -1.0, 0.0), &create_aabb(1.0, 2.0, 1.0, 2.0, 1.0, 2.0)), -1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(1.5, 1.5, 5.0, 0.0, 0.0, -1.0), &create_aabb(1.0, 1.0, 2.0, 2.0, 2.0, 1.0)), -1.0);
    }

    #[test]
    fn returns_negative_one_for_no_direction() {
        let aabb = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0), &aabb), -1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(5.0, 0.0, 0.0, 0.0, 0.0, 0.0), &aabb), -1.0);
    }

    #[test]
    fn enters_each_of_the_six_sides_at_the_correct_distance() {
        let lopsided = create_aabb(-1.0, -4.0, -6.0, 2.0, 3.0, 5.0);
        let rays_into_lopsided_box: &[(f32, f32, f32, f32, f32, f32, f32)] = &[
            (-10.0, 0.0, 0.0, 1.0, 0.0, 0.0, 9.0),
            (10.0, 0.0, 0.0, -1.0, 0.0, 0.0, 8.0),
            (0.0, -10.0, 0.0, 0.0, 1.0, 0.0, 6.0),
            (0.0, 10.0, 0.0, 0.0, -1.0, 0.0, 7.0),
            (0.0, 0.0, -10.0, 0.0, 0.0, 1.0, 4.0),
            (0.0, 0.0, 10.0, 0.0, 0.0, -1.0, 5.0),
        ];
        for &(ox, oy, oz, dx, dy, dz, entry) in rays_into_lopsided_box {
            assert_approx_tight(intersect_ray3d_aabb(&create_ray3d(ox, oy, oz, dx, dy, dz), &lopsided), entry);
        }
    }

    #[test]
    fn returns_negative_one_for_ray_aimed_away_along_any_axis() {
        let lopsided = create_aabb(-1.0, -4.0, -6.0, 2.0, 3.0, 5.0);
        let rays: &[(f32, f32, f32, f32, f32, f32)] = &[
            (-10.0, 0.0, 0.0, 1.0, 0.0, 0.0),
            (10.0, 0.0, 0.0, -1.0, 0.0, 0.0),
            (0.0, -10.0, 0.0, 0.0, 1.0, 0.0),
            (0.0, 10.0, 0.0, 0.0, -1.0, 0.0),
            (0.0, 0.0, -10.0, 0.0, 0.0, 1.0),
            (0.0, 0.0, 10.0, 0.0, 0.0, -1.0),
        ];
        for &(ox, oy, oz, dx, dy, dz) in rays {
            assert_eq!(intersect_ray3d_aabb(&create_ray3d(ox, oy, oz, -dx, -dy, -dz), &lopsided), -1.0);
        }
    }

    #[test]
    fn returns_negative_one_for_ray_running_alongside() {
        let lopsided = create_aabb(-1.0, -4.0, -6.0, 2.0, 3.0, 5.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(10.0, 0.0, 0.0, 0.0, 1.0, 0.0), &lopsided), -1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(0.0, 10.0, 0.0, 0.0, 0.0, 1.0), &lopsided), -1.0);
        assert_eq!(intersect_ray3d_aabb(&create_ray3d(0.0, 0.0, 10.0, 1.0, 0.0, 0.0), &lopsided), -1.0);
    }
}

mod intersect_ray3d_plane {
    use super::*;

    #[test]
    fn returns_t_of_simple_xy_plane_intersection() {
        let plane = create_plane(0.0, 0.0, 1.0, 0.0);
        let ray = create_ray3d(0.0, 0.0, -3.0, 0.0, 0.0, 1.0);
        assert_approx(intersect_ray3d_plane(&ray, &plane), 3.0);
    }

    #[test]
    fn returns_negative_one_when_parallel() {
        let plane = create_plane(0.0, 0.0, 1.0, 0.0);
        let ray = create_ray3d(0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_plane(&ray, &plane), -1.0);
    }

    #[test]
    fn returns_negative_one_when_behind_origin() {
        let plane = create_plane(0.0, 0.0, 1.0, 0.0);
        let ray = create_ray3d(0.0, 0.0, 3.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_plane(&ray, &plane), -1.0);
    }

    #[test]
    fn is_invariant_when_plane_equation_is_scaled() {
        for &scale in &[1.0_f32, 1e-6, 1e-12] {
            let plane = create_plane(0.0, 0.0, scale, 3.0 * scale);
            let ray = create_ray3d(0.0, 0.0, -6.0, 0.0, 0.0, 2.0);
            assert_approx(intersect_ray3d_plane(&ray, &plane), 1.5);
        }
    }

    #[test]
    fn returns_negative_one_for_zero_normal_or_zero_direction() {
        assert_eq!(intersect_ray3d_plane(&create_ray3d(0.0, 0.0, -3.0, 0.0, 0.0, 1.0), &create_plane(0.0, 0.0, 0.0, 0.0)), -1.0);
        assert_eq!(intersect_ray3d_plane(&create_ray3d(0.0, 0.0, -3.0, 0.0, 0.0, 0.0), &create_plane(0.0, 0.0, 1.0, 0.0)), -1.0);
    }
}

mod intersect_ray3d_sphere {
    use super::*;

    #[test]
    fn returns_near_t_for_hit() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(0.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        assert_approx(intersect_ray3d_sphere(&ray, &sphere), 4.0);
    }

    #[test]
    fn returns_zero_when_inside() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 2.0);
        let ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&ray, &sphere), 0.0);
    }

    #[test]
    fn returns_negative_one_when_miss() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(5.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&ray, &sphere), -1.0);
    }

    #[test]
    fn returns_negative_one_for_empty_sphere() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        let ray = create_ray3d(0.0, 0.0, -5.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&ray, &sphere), -1.0);
    }

    #[test]
    fn returns_negative_one_when_sphere_behind() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&create_ray3d(5.0, 0.0, 0.0, 1.0, 0.0, 0.0), &sphere), -1.0);
    }

    #[test]
    fn returns_negative_one_for_no_direction() {
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_sphere(&create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0), &sphere), -1.0);
    }
}

mod intersect_ray3d_triangle {
    use super::*;

    fn tri_a() -> Vector3 { create_vector3(-1.0, 0.0, 0.0) }
    fn tri_b() -> Vector3 { create_vector3(1.0, 0.0, 0.0) }
    fn tri_c() -> Vector3 { create_vector3(0.0, 1.0, 0.0) }

    #[test]
    fn returns_t_for_hit() {
        let ray = create_ray3d(0.0, 0.3, -3.0, 0.0, 0.0, 1.0);
        assert_approx(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), 3.0);
    }

    #[test]
    fn returns_negative_one_when_miss() {
        let ray = create_ray3d(5.0, 5.0, -3.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn returns_negative_one_when_behind_origin() {
        let ray = create_ray3d(0.0, 0.3, 3.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn tests_both_sides_no_backface_culling() {
        let ray = create_ray3d(0.0, 0.3, 3.0, 0.0, 0.0, -1.0);
        assert_approx(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), 3.0);
    }

    #[test]
    fn returns_negative_one_for_degenerate_triangle() {
        let p = create_vector3(0.0, 0.0, 0.0);
        let ray = create_ray3d(0.0, 0.0, -1.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&ray, &p, &p, &p), -1.0);
    }

    #[test]
    fn accepts_non_normalized_direction() {
        for &scale in &[1.0_f32, 1e-6, 1e-12] {
            let ray = create_ray3d(0.0, 0.3, -3.0, 0.0, 0.0, scale);
            assert_approx(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()) * scale, 3.0);
        }
    }

    #[test]
    fn does_not_treat_small_triangle_as_degenerate() {
        for &scale in &[1.0_f32, 1e-3, 1e-6] {
            let sa = create_vector3(-scale, 0.0, 0.0);
            let sb = create_vector3(scale, 0.0, 0.0);
            let sc = create_vector3(0.0, scale, 0.0);
            let ray = create_ray3d(0.0, 0.3 * scale, -3.0, 0.0, 0.0, 1.0);
            assert_approx(intersect_ray3d_triangle(&ray, &sa, &sb, &sc), 3.0);
        }
    }

    #[test]
    fn returns_negative_one_for_zero_direction() {
        assert_eq!(intersect_ray3d_triangle(&create_ray3d(0.0, 0.3, -3.0, 0.0, 0.0, 0.0), &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn returns_negative_one_for_nearly_parallel() {
        let nearly_parallel = create_ray3d(-1.0, 0.3, -1e-12, 1.0, 0.0, 1e-12);
        assert_eq!(intersect_ray3d_triangle(&nearly_parallel, &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn returns_negative_one_past_far_edge() {
        let ray = create_ray3d(0.9, 0.9, -3.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn returns_negative_one_on_far_side_of_base() {
        let ray = create_ray3d(0.0, -0.5, -3.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_triangle(&ray, &tri_a(), &tri_b(), &tri_c()), -1.0);
    }

    #[test]
    fn returns_negative_one_beyond_first_edge_ends() {
        assert_eq!(intersect_ray3d_triangle(&create_ray3d(3.0, 0.0, -3.0, 0.0, 0.0, 1.0), &tri_a(), &tri_b(), &tri_c()), -1.0);
        assert_eq!(intersect_ray3d_triangle(&create_ray3d(0.0, 3.0, -3.0, 0.0, 0.0, 1.0), &tri_a(), &tri_b(), &tri_c()), -1.0);
    }
}

mod ray_shape_direction_scale_parity {
    use super::*;

    #[test]
    fn preserves_the_hit_point_across_all_six_shapes() {
        for &scale in &[1.0_f32, 1e-6, 1e-12] {
            let ray = create_ray3d(5.0, 0.0, 0.0, -scale, 0.0, 0.0);
            let hits = [
                intersect_ray3d_aabb(&ray, &create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0)),
                intersect_ray3d_sphere(&ray, &create_bounding_sphere(0.0, 0.0, 0.0, 1.0)),
                intersect_ray3d_capsule(&ray, &create_capsule(0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 1.0)),
                intersect_ray3d_obb(&ray, &create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0)),
                intersect_ray3d_plane(&ray, &create_plane(1.0, 0.0, 0.0, -1.0)),
                intersect_ray3d_triangle(&ray, &create_vector3(1.0, -1.0, -1.0), &create_vector3(1.0, 1.0, -1.0), &create_vector3(1.0, 0.0, 1.0)),
            ];
            for t in &hits {
                assert_approx(t * scale, 4.0);
            }
        }
    }
}

mod set_ray3d {
    use super::*;

    #[test]
    fn writes_origin_and_direction() {
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let origin = create_vector3(4.0, 5.0, 6.0);
        let direction = create_vector3(0.0, 0.0, -1.0);
        set_ray3d(&mut ray, &origin, &direction);
        assert_eq!(ray.origin.x, 4.0);
        assert_eq!(ray.origin.y, 5.0);
        assert_eq!(ray.origin.z, 6.0);
        assert_eq!(ray.direction.x, 0.0);
        assert_eq!(ray.direction.y, 0.0);
        assert_eq!(ray.direction.z, -1.0);
    }

    #[test]
    fn is_safe_when_origin_aliases_ray_origin() {
        let mut ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 1.0, 0.0);
        let direction = create_vector3(1.0, 0.0, 0.0);
        let origin_snap = ray.origin.clone();
        set_ray3d(&mut ray, &origin_snap, &direction);
        assert_eq!(ray.origin.x, 1.0);
        assert_eq!(ray.origin.y, 2.0);
        assert_eq!(ray.origin.z, 3.0);
        assert_eq!(ray.direction.x, 1.0);
    }

    #[test]
    fn is_safe_when_direction_aliases_ray_direction() {
        let mut ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 1.0, 0.0);
        let origin = create_vector3(5.0, 6.0, 7.0);
        let dir_snap = ray.direction.clone();
        set_ray3d(&mut ray, &origin, &dir_snap);
        assert_eq!(ray.origin.x, 5.0);
        assert_eq!(ray.origin.y, 6.0);
        assert_eq!(ray.origin.z, 7.0);
        assert_eq!(ray.direction.x, 0.0);
        assert_eq!(ray.direction.y, 1.0);
    }
}

mod transform_ray3d_by_matrix4 {
    use super::*;

    fn translate_matrix4(m: &mut Matrix4, tx: f32, ty: f32, tz: f32) {
        let m00 = m.m[0]; let m01 = m.m[1]; let m02 = m.m[2]; let m03 = m.m[3];
        let m10 = m.m[4]; let m11 = m.m[5]; let m12 = m.m[6]; let m13 = m.m[7];
        let m20 = m.m[8]; let m21 = m.m[9]; let m22 = m.m[10]; let m23 = m.m[11];
        m.m[12] = m00 * tx + m10 * ty + m20 * tz + m.m[12];
        m.m[13] = m01 * tx + m11 * ty + m21 * tz + m.m[13];
        m.m[14] = m02 * tx + m12 * ty + m22 * tz + m.m[14];
        m.m[15] = m03 * tx + m13 * ty + m23 * tz + m.m[15];
    }

    #[test]
    fn leaves_ray_unchanged_under_identity() {
        let ray = create_ray3d(1.0, 2.0, 3.0, 0.0, 0.0, 1.0);
        let m = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        let mut out = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_ray3d_by_matrix4(&mut out, &ray, &m);
        assert_approx(out.origin.x, 1.0);
        assert_approx(out.origin.y, 2.0);
        assert_approx(out.origin.z, 3.0);
        assert_approx(out.direction.x, 0.0);
        assert_approx(out.direction.y, 0.0);
        assert_approx(out.direction.z, 1.0);
    }

    #[test]
    fn translates_origin_but_not_direction() {
        let ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 1.0, 0.0);
        let mut m = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        translate_matrix4(&mut m, 5.0, 6.0, 7.0);
        let mut out = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_ray3d_by_matrix4(&mut out, &ray, &m);
        assert_approx(out.origin.x, 5.0);
        assert_approx(out.origin.y, 6.0);
        assert_approx(out.origin.z, 7.0);
        assert_approx(out.direction.x, 0.0);
        assert_approx(out.direction.y, 1.0);
        assert_approx(out.direction.z, 0.0);
    }

    #[test]
    fn is_alias_safe() {
        let mut ray = create_ray3d(1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        let mut m = create_matrix4(
            None, None, None, None, None, None, None, None, None, None, None, None, None, None,
            None, None,
        );
        translate_matrix4(&mut m, 10.0, 0.0, 0.0);
        let snap = ray.clone();
        transform_ray3d_by_matrix4(&mut ray, &snap, &m);
        assert_approx(ray.origin.x, 11.0);
        assert_approx(ray.origin.y, 0.0);
        assert_approx(ray.origin.z, 0.0);
        assert_approx(ray.direction.x, 0.0);
        assert_approx(ray.direction.y, 0.0);
        assert_approx(ray.direction.z, 1.0);
    }
}
