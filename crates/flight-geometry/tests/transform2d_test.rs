use flight_geometry::contract::*;

const DEG_TO_RAD: f32 = std::f32::consts::PI / 180.0;

fn assert_close(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {} to be approximately {}, diff = {}",
        actual,
        expected,
        diff
    );
}

fn build_matrix(
    x: f32,
    y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
    skew_x: f32,
    skew_y: f32,
) -> Matrix {
    let rad_y = (rotation + skew_y) * DEG_TO_RAD;
    let rad_x = (rotation + skew_x) * DEG_TO_RAD;
    return create_matrix(
        rad_y.cos() * scale_x,
        rad_y.sin() * scale_x,
        -(rad_x.sin()) * scale_y,
        rad_x.cos() * scale_y,
        x,
        y,
    );
}

fn expect_round_trip(source: &Matrix) {
    let mut out = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
    decompose_matrix_to_transform2d(&mut out, source);
    let rebuilt = build_matrix(
        out.x,
        out.y,
        out.rotation,
        out.scale_x,
        out.scale_y,
        out.skew_x,
        out.skew_y,
    );
    assert_close(rebuilt.a, source.a);
    assert_close(rebuilt.b, source.b);
    assert_close(rebuilt.c, source.c);
    assert_close(rebuilt.d, source.d);
}

mod create_transform2d {
    use super::*;

    #[test]
    fn defaults_to_the_identity_transform() {
        let t = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(t.x, 0.0);
        assert_eq!(t.y, 0.0);
        assert_eq!(t.rotation, 0.0);
        assert_eq!(t.scale_x, 1.0);
        assert_eq!(t.scale_y, 1.0);
        assert_eq!(t.skew_x, 0.0);
        assert_eq!(t.skew_y, 0.0);
        assert_eq!(t.pivot_x, 0.0);
        assert_eq!(t.pivot_y, 0.0);
    }

    #[test]
    fn accepts_positional_fields() {
        let t = create_transform2d(10.0, 20.0, 45.0, 2.0, 3.0, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(t.x, 10.0);
        assert_eq!(t.y, 20.0);
        assert_eq!(t.rotation, 45.0);
        assert_eq!(t.scale_x, 2.0);
        assert_eq!(t.scale_y, 3.0);
    }
}

mod decompose_matrix_to_transform2d {
    use super::*;

    #[test]
    fn decomposes_the_identity_matrix() {
        let mut out = create_transform2d(99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 99.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(&mut out, &create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        assert_eq!(out.rotation, 0.0);
        assert_close(out.scale_x, 1.0);
        assert_close(out.scale_y, 1.0);
        assert_eq!(out.skew_x, 0.0);
        assert_eq!(out.skew_y, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn recovers_translation_and_scale() {
        let mut out = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(&mut out, &build_matrix(5.0, 7.0, 0.0, 2.0, 3.0, 0.0, 0.0));
        assert_close(out.x, 5.0);
        assert_close(out.y, 7.0);
        assert_close(out.scale_x, 2.0);
        assert_close(out.scale_y, 3.0);
    }

    #[test]
    fn recovers_a_pure_rotation_with_no_skew() {
        let mut out = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(
            &mut out,
            &build_matrix(0.0, 0.0, 30.0, 1.0, 1.0, 0.0, 0.0),
        );
        assert_close(out.rotation, 30.0);
        assert_eq!(out.skew_x, 0.0);
        assert_eq!(out.skew_y, 0.0);
    }

    #[test]
    fn round_trips_a_skewed_transform_folding_the_angles_into_skew() {
        let mut out = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(
            &mut out,
            &build_matrix(0.0, 0.0, 0.0, 1.0, 1.0, 10.0, 20.0),
        );
        assert_eq!(out.rotation, 0.0);
        assert_close(out.skew_x, 10.0);
        assert_close(out.skew_y, 20.0);
    }

    #[test]
    fn carries_a_reflection_on_scale_y() {
        let mut out = create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(&mut out, &create_matrix(1.0, 0.0, 0.0, -1.0, 0.0, 0.0));
        assert_close(out.scale_x, 1.0);
        assert_close(out.scale_y, -1.0);
    }

    #[test]
    fn round_trips_a_mirrored_matrix_through_the_forward_build() {
        expect_round_trip(&create_matrix(1.0, 0.0, 0.0, -1.0, 0.0, 0.0));
        expect_round_trip(&create_matrix(-1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        expect_round_trip(&create_matrix(0.5, 0.8, 0.8, -0.5, 3.0, 4.0));
    }

    #[test]
    fn round_trips_every_non_degenerate_matrix_in_a_grid_spanning_both_determinant_signs() {
        let values: &[f32] = &[-2.0, -1.0, -0.5, 0.5, 1.0, 2.0];
        let mut negative_determinant_count: i32 = 0;
        for &a in values {
            for &b in values {
                for &c in values {
                    for &d in values {
                        if (a * d - b * c).abs() < 1e-9 {
                            continue;
                        }
                        if a * d - b * c < 0.0 {
                            negative_determinant_count += 1;
                        }
                        expect_round_trip(&create_matrix(a, b, c, d, 0.0, 0.0));
                    }
                }
            }
        }
        assert_eq!(negative_determinant_count, 572);
    }
}
