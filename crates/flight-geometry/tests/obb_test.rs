use flight_geometry::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {} to be approximately {}, diff = {}",
        actual, expected, diff
    );
}

fn orientation_from_axis_angle(axis_x: f32, axis_y: f32, axis_z: f32, radians: f32) -> (f32, f32, f32, f32) {
    let length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
    let half = (radians / 2.0).sin();
    return (
        (axis_x / length) * half,
        (axis_y / length) * half,
        (axis_z / length) * half,
        (radians / 2.0).cos(),
    );
}

fn rotation_matrix4(axis_x: f32, axis_y: f32, axis_z: f32, radians: f32) -> Matrix4 {
    let length = (axis_x * axis_x + axis_y * axis_y + axis_z * axis_z).sqrt();
    let nx = axis_x / length;
    let ny = axis_y / length;
    let nz = axis_z / length;
    let c = radians.cos();
    let s = radians.sin();
    let t = 1.0 - c;
    let mut m = create_matrix4();
    m.m[0] = t * nx * nx + c;
    m.m[1] = t * nx * ny + s * nz;
    m.m[2] = t * nx * nz - s * ny;
    m.m[3] = 0.0;
    m.m[4] = t * nx * ny - s * nz;
    m.m[5] = t * ny * ny + c;
    m.m[6] = t * ny * nz + s * nx;
    m.m[7] = 0.0;
    m.m[8] = t * nx * nz + s * ny;
    m.m[9] = t * ny * nz - s * nx;
    m.m[10] = t * nz * nz + c;
    m.m[11] = 0.0;
    m.m[12] = 0.0;
    m.m[13] = 0.0;
    m.m[14] = 0.0;
    m.m[15] = 1.0;
    return m;
}

fn matrix4_transform_point(out: &mut Vector3, m: &Matrix4, p: &Vector3) {
    let x = p.x;
    let y = p.y;
    let z = p.z;
    out.x = m.m[0] * x + m.m[4] * y + m.m[8] * z + m.m[12];
    out.y = m.m[1] * x + m.m[5] * y + m.m[9] * z + m.m[13];
    out.z = m.m[2] * x + m.m[6] * y + m.m[10] * z + m.m[14];
}

fn create_unit_vector3(axis: usize) -> Vector3 {
    return create_vector3(
        if axis == 0 { 1.0 } else { 0.0 },
        if axis == 1 { 1.0 } else { 0.0 },
        if axis == 2 { 1.0 } else { 0.0 },
    );
}

fn create_rod_obb(
    center_x: f32, center_y: f32, center_z: f32,
    long_axis: usize,
    orientation_x: f32, orientation_y: f32, orientation_z: f32, orientation_w: f32,
) -> Obb {
    let thickness = 0.1;
    return create_obb(
        center_x, center_y, center_z,
        if long_axis == 0 { 3.0 } else { thickness },
        if long_axis == 1 { 3.0 } else { thickness },
        if long_axis == 2 { 3.0 } else { thickness },
        orientation_x, orientation_y, orientation_z, orientation_w,
    );
}

fn create_tilted_obb() -> Obb {
    let (qx, qy, qz, qw) = orientation_from_axis_angle(1.0, 2.0, 3.0, 0.8);
    return create_obb(0.0, 0.0, 0.0, 3.0, 2.0, 1.0, qx, qy, qz, qw);
}

fn cross_vec3(out: &mut Vector3, a: &Vector3, b: &Vector3) {
    let ax = a.x; let ay = a.y; let az = a.z;
    let bx = b.x; let by = b.y; let bz = b.z;
    out.x = ay * bz - az * by;
    out.y = az * bx - ax * bz;
    out.z = ax * by - ay * bx;
}

fn normalize_vec3(out: &mut Vector3, source: &Vector3) {
    let x = source.x; let y = source.y; let z = source.z;
    let l = (x * x + y * y + z * z).sqrt();
    if l != 0.0 {
        out.x = x / l; out.y = y / l; out.z = z / l;
    } else {
        out.x = 0.0; out.y = 0.0; out.z = 0.0;
    }
}

struct FaceAxisSeparation {
    axis: usize,
    of_turned_box: bool,
    extents: [f32; 3],
    clear: f32,
}

const FACE_AXIS_SEPARATIONS: &[FaceAxisSeparation] = &[
    FaceAxisSeparation { axis: 0, clear: 3.8, extents: [2.5, 1.5, 0.5], of_turned_box: false },
    FaceAxisSeparation { axis: 1, clear: 4.9, extents: [2.5, 1.5, 0.5], of_turned_box: false },
    FaceAxisSeparation { axis: 2, clear: 5.9, extents: [0.5, 1.5, 2.5], of_turned_box: false },
    FaceAxisSeparation { axis: 0, clear: 3.6, extents: [0.5, 1.5, 2.5], of_turned_box: true },
    FaceAxisSeparation { axis: 1, clear: 4.7, extents: [0.5, 1.5, 2.5], of_turned_box: true },
    FaceAxisSeparation { axis: 2, clear: 3.7, extents: [2.5, 1.5, 0.5], of_turned_box: true },
];

fn expect_transformed_obb_matches_rotated_points(m: &Matrix4, obb: &Obb) {
    let mut transformed = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    transform_obb_by_matrix4(&mut transformed, obb, m);

    let mut expected = create_vector3(0.0, 0.0, 0.0);
    let mut actual = create_vector3(0.0, 0.0, 0.0);
    let mut probe = create_vector3(0.0, 0.0, 0.0);

    let points: &[[f32; 3]] = &[
        [10.0, 0.0, 0.0],
        [0.0, 10.0, 0.0],
        [0.0, 0.0, 10.0],
        [4.0, -6.0, 2.0],
        [-5.0, 3.0, 8.0],
        [7.0, 7.0, -7.0],
    ];

    for &[px, py, pz] in points {
        let p = create_vector3(px, py, pz);
        get_closest_point_on_obb(&mut expected, obb, &p);
        let expected_copy = expected.clone();
        matrix4_transform_point(&mut expected, m, &expected_copy);

        matrix4_transform_point(&mut probe, m, &p);
        get_closest_point_on_obb(&mut actual, &transformed, &probe);

        assert_approx(actual.x, expected.x);
        assert_approx(actual.y, expected.y);
        assert_approx(actual.z, expected.z);
    }
}

mod create_obb {
    use super::*;

    #[test]
    fn stores_center_half_extents_and_orientation() {
        let o = create_obb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(o.center_x, 1.0);
        assert_eq!(o.center_y, 2.0);
        assert_eq!(o.center_z, 3.0);
        assert_eq!(o.half_extent_x, 4.0);
        assert_eq!(o.half_extent_y, 5.0);
        assert_eq!(o.half_extent_z, 6.0);
        assert_eq!(o.orientation_x, 0.0);
        assert_eq!(o.orientation_y, 0.0);
        assert_eq!(o.orientation_z, 0.0);
        assert_eq!(o.orientation_w, 1.0);
    }
}

mod get_closest_point_on_obb {
    use super::*;

    #[test]
    fn clamps_an_outside_point_to_the_nearest_face() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_obb(&mut out, &o, &create_vector3(5.0, 0.0, 0.0));
        assert_approx(out.x, 1.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn returns_a_point_inside_unchanged() {
        let o = create_obb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0, 0.0, 0.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_obb(&mut out, &o, &create_vector3(1.0, 0.5, -0.5));
        assert_approx(out.x, 1.0);
        assert_approx(out.y, 0.5);
        assert_approx(out.z, -0.5);
    }

    #[test]
    fn handles_off_center_obb() {
        let o = create_obb(10.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut out = create_vector3(0.0, 0.0, 0.0);
        get_closest_point_on_obb(&mut out, &o, &create_vector3(0.0, 0.0, 0.0));
        assert_approx(out.x, 9.0);
        assert_approx(out.y, 0.0);
        assert_approx(out.z, 0.0);
    }

    #[test]
    fn supports_out_equals_point() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut p = create_vector3(5.0, 0.0, 0.0);
        let snap = p.clone();
        get_closest_point_on_obb(&mut p, &o, &snap);
        assert_approx(p.x, 1.0);
    }
}

mod intersect_ray3d_obb {
    use super::*;

    #[test]
    fn hits_from_outside() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(5.0, 0.0, 0.0, -1.0, 0.0, 0.0);
        assert_approx(intersect_ray3d_obb(&ray, &o), 4.0);
    }

    #[test]
    fn returns_negative_one_for_ray_away() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(5.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_obb(&ray, &o), -1.0);
    }

    #[test]
    fn returns_zero_inside() {
        let o = create_obb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0, 0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_obb(&ray, &o), 0.0);
    }

    #[test]
    fn returns_negative_one_for_miss() {
        let o = create_obb(10.0, 10.0, 10.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let ray = create_ray3d(0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        assert_eq!(intersect_ray3d_obb(&ray, &o), -1.0);
    }

    #[test]
    fn returns_negative_one_for_no_direction() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(intersect_ray3d_obb(&create_ray3d(0.5, 0.5, 0.5, 0.0, 0.0, 0.0), &o), -1.0);
        assert_eq!(intersect_ray3d_obb(&create_ray3d(5.0, 0.0, 0.0, 0.0, 0.0, 0.0), &o), -1.0);
    }

    #[test]
    fn hits_a_flat_obb() {
        let o = create_obb(0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert_approx(intersect_ray3d_obb(&create_ray3d(5.0, 0.0, 0.0, -1.0, 0.0, 0.0), &o), 5.0);
        assert_eq!(intersect_ray3d_obb(&create_ray3d(5.0, 3.0, 0.0, -1.0, 0.0, 0.0), &o), -1.0);
    }
}

mod is_obb_intersecting_aabb {
    use super::*;

    #[test]
    fn returns_true_for_coincident() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(is_obb_intersecting_aabb(&o, &a));
    }

    #[test]
    fn returns_true_for_overlapping() {
        let o = create_obb(0.5, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(is_obb_intersecting_aabb(&o, &a));
    }

    #[test]
    fn returns_false_for_separated() {
        let o = create_obb(10.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let a = create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        assert!(!is_obb_intersecting_aabb(&o, &a));
    }

    #[test]
    fn returns_false_for_empty_aabb_on_each_axis() {
        let o = create_obb(0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 0.0, 1.0);
        for empty in &[
            create_aabb(1.0, 0.0, 0.0, 0.0, 1.0, 1.0),
            create_aabb(0.0, 1.0, 0.0, 1.0, 0.0, 1.0),
            create_aabb(0.0, 0.0, 1.0, 1.0, 1.0, 0.0),
        ] {
            assert!(!is_obb_intersecting_aabb(&o, empty));
        }
    }
}

mod is_obb_intersecting_obb {
    use super::*;

    #[test]
    fn returns_true_for_coincident() {
        let a = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let b = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(is_obb_intersecting_obb(&a, &b));
    }

    #[test]
    fn returns_true_for_overlapping() {
        let a = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let b = create_obb(1.5, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(is_obb_intersecting_obb(&a, &b));
    }

    #[test]
    fn returns_false_for_separated() {
        let a = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let b = create_obb(10.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        assert!(!is_obb_intersecting_obb(&a, &b));
    }

    #[test]
    fn separates_on_each_of_the_six_face_axes() {
        let (tx, ty, tz, tw) = orientation_from_axis_angle(1.0, 2.0, 3.0, 0.9);
        let tilt_as_matrix = rotation_matrix4(1.0, 2.0, 3.0, 0.9);
        let first = create_obb(0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 0.0, 0.0, 0.0, 1.0);

        for case in FACE_AXIS_SEPARATIONS {
            let mut direction = create_unit_vector3(case.axis);
            if case.of_turned_box {
                let copy = direction.clone();
                matrix4_transform_point(&mut direction, &tilt_as_matrix, &copy);
            }

            let away = create_obb(
                direction.x * case.clear,
                direction.y * case.clear,
                direction.z * case.clear,
                case.extents[0], case.extents[1], case.extents[2],
                tx, ty, tz, tw,
            );
            assert!(!is_obb_intersecting_obb(&first, &away));

            let concentric = create_obb(0.0, 0.0, 0.0, case.extents[0], case.extents[1], case.extents[2], tx, ty, tz, tw);
            assert!(is_obb_intersecting_obb(&first, &concentric));
        }
    }

    #[test]
    fn separates_on_every_one_of_the_nine_edge_cross_axes() {
        let (tx, ty, tz, tw) = orientation_from_axis_angle(1.0, 2.0, 3.0, 0.9);
        let tilt_as_matrix = rotation_matrix4(1.0, 2.0, 3.0, 0.9);
        let mut rod_long_direction = create_vector3(0.0, 0.0, 0.0);

        for first_long_axis in 0..3_usize {
            for second_long_axis in 0..3_usize {
                let first = create_rod_obb(0.0, 0.0, 0.0, first_long_axis, 0.0, 0.0, 0.0, 1.0);
                matrix4_transform_point(&mut rod_long_direction, &tilt_as_matrix, &create_unit_vector3(second_long_axis));

                let mut perpendicular = create_vector3(0.0, 0.0, 0.0);
                cross_vec3(&mut perpendicular, &create_unit_vector3(first_long_axis), &rod_long_direction);
                let perp_copy = perpendicular.clone();
                normalize_vec3(&mut perpendicular, &perp_copy);

                let clear = 0.3_f32;
                let separated = create_rod_obb(
                    perpendicular.x * clear,
                    perpendicular.y * clear,
                    perpendicular.z * clear,
                    second_long_axis,
                    tx, ty, tz, tw,
                );
                assert!(!is_obb_intersecting_obb(&first, &separated));

                let concentric = create_rod_obb(0.0, 0.0, 0.0, second_long_axis, tx, ty, tz, tw);
                assert!(is_obb_intersecting_obb(&first, &concentric));
            }
        }
    }
}

mod is_obb_intersecting_sphere {
    use super::*;

    #[test]
    fn returns_true_at_center() {
        let obb = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, 0.5);
        assert!(is_obb_intersecting_sphere(&obb, &sphere));
    }

    #[test]
    fn returns_true_touching_face() {
        let obb = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let sphere = create_bounding_sphere(1.5, 0.0, 0.0, 1.0);
        assert!(is_obb_intersecting_sphere(&obb, &sphere));
    }

    #[test]
    fn returns_false_outside() {
        let obb = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let sphere = create_bounding_sphere(5.0, 5.0, 5.0, 1.0);
        assert!(!is_obb_intersecting_sphere(&obb, &sphere));
    }

    #[test]
    fn returns_false_negative_radius() {
        let obb = create_obb(0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 0.0, 1.0);
        let sphere = create_bounding_sphere(0.0, 0.0, 0.0, -1.0);
        assert!(!is_obb_intersecting_sphere(&obb, &sphere));
    }
}

mod set_obb {
    use super::*;

    #[test]
    fn updates_all_fields_in_place() {
        let mut o = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_obb(&mut o, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.1, 0.2, 0.3, 0.9);
        assert_eq!(o.center_x, 1.0);
        assert_eq!(o.center_y, 2.0);
        assert_eq!(o.center_z, 3.0);
        assert_eq!(o.half_extent_x, 4.0);
        assert_eq!(o.half_extent_y, 5.0);
        assert_eq!(o.half_extent_z, 6.0);
        assert_eq!(o.orientation_x, 0.1);
        assert_eq!(o.orientation_w, 0.9);
    }
}

mod transform_obb_by_matrix4 {
    use super::*;

    #[test]
    fn translates_the_center() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut m = create_matrix4();
        m.m[12] = 5.0;
        let mut out = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_obb_by_matrix4(&mut out, &o, &m);
        assert_approx(out.center_x, 5.0);
        assert_approx(out.center_y, 0.0);
        assert_approx(out.half_extent_x, 1.0);
        assert_approx(out.orientation_w, 1.0);
    }

    #[test]
    fn scales_half_extents() {
        let o = create_obb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut m = create_matrix4();
        m.m = [2.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0, 1.0];
        let mut out = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_obb_by_matrix4(&mut out, &o, &m);
        assert_approx(out.half_extent_x, 2.0);
        assert_approx(out.half_extent_y, 2.0);
        assert_approx(out.half_extent_z, 2.0);
    }

    #[test]
    fn supports_out_equals_obb() {
        let mut o = create_obb(1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0);
        let mut m = create_matrix4();
        m.m[13] = 3.0;
        let snap = o.clone();
        transform_obb_by_matrix4(&mut o, &snap, &m);
        assert_approx(o.center_x, 1.0);
        assert_approx(o.center_y, 3.0);
        assert_approx(o.half_extent_x, 1.0);
    }

    #[test]
    fn rotates_correctly() {
        expect_transformed_obb_matches_rotated_points(&rotation_matrix4(1.0, 0.0, 0.0, 0.7), &create_tilted_obb());
        expect_transformed_obb_matches_rotated_points(&rotation_matrix4(1.0, 2.0, 3.0, 0.9), &create_tilted_obb());
    }

    #[test]
    fn rotates_correctly_near_half_turn() {
        let near_half_turn = std::f32::consts::PI - 0.01;
        expect_transformed_obb_matches_rotated_points(&rotation_matrix4(1.0, 0.0, 0.0, near_half_turn), &create_tilted_obb());
        expect_transformed_obb_matches_rotated_points(&rotation_matrix4(0.0, 1.0, 0.0, near_half_turn), &create_tilted_obb());
        expect_transformed_obb_matches_rotated_points(&rotation_matrix4(0.0, 0.0, 1.0, near_half_turn), &create_tilted_obb());
    }

    #[test]
    fn flattens_along_collapsed_column() {
        let o = create_obb(0.0, 0.0, 0.0, 2.0, 3.0, 4.0, 0.0, 0.0, 0.0, 1.0);
        let mut m = create_matrix4();
        m.m = [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
        let mut out = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_obb_by_matrix4(&mut out, &o, &m);
        assert_eq!(out.half_extent_x, 0.0);
        assert_approx(out.half_extent_y, 3.0);
        assert_approx(out.half_extent_z, 4.0);
        assert_approx(out.orientation_w, 1.0);
    }

    #[test]
    fn collapses_to_point_when_all_zero() {
        let (tx, ty, tz, tw) = orientation_from_axis_angle(1.0, 1.0, 1.0, 0.6);
        let o = create_obb(1.0, 2.0, 3.0, 2.0, 3.0, 4.0, tx, ty, tz, tw);
        let mut m = create_matrix4();
        m.m = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.0, 6.0, 7.0, 1.0];
        let mut out = create_obb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        transform_obb_by_matrix4(&mut out, &o, &m);
        assert_approx(out.center_x, 5.0);
        assert_approx(out.center_y, 6.0);
        assert_approx(out.center_z, 7.0);
        assert_eq!(out.half_extent_x, 0.0);
        assert_eq!(out.half_extent_y, 0.0);
        assert_eq!(out.half_extent_z, 0.0);
        assert_approx(out.orientation_x, tx);
        assert_approx(out.orientation_y, ty);
        assert_approx(out.orientation_z, tz);
        assert_approx(out.orientation_w, tw);
    }
}
