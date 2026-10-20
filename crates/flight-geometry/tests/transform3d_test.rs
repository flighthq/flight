use flight_geometry::*;

fn assert_close(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {} to be approximately {}, diff = {}",
        actual, expected, diff
    );
}

mod compose_matrix4_from_transform3d {
    use super::*;

    #[test]
    fn composes_translation_rotation_and_scale_into_a_matrix() {
        let mut t = create_transform3d();
        t.position = create_vector3(4.0, 5.0, 6.0);
        t.scale = create_vector3(2.0, 2.0, 2.0);
        let mut out = create_matrix4();
        compose_matrix4_from_transform3d(&mut out, &t);
        assert_close(out.m[0], 2.0);
        assert_close(out.m[5], 2.0);
        assert_close(out.m[10], 2.0);
        assert_close(out.m[12], 4.0);
        assert_close(out.m[13], 5.0);
        assert_close(out.m[14], 6.0);
    }
}

mod create_transform3d {
    use super::*;

    #[test]
    fn defaults_to_identity_zero_translation_identity_rotation_unit_scale() {
        let t = create_transform3d();
        assert_eq!(t.position.x, 0.0);
        assert_eq!(t.position.y, 0.0);
        assert_eq!(t.position.z, 0.0);
        assert_eq!(t.rotation.x, 0.0);
        assert_eq!(t.rotation.y, 0.0);
        assert_eq!(t.rotation.z, 0.0);
        assert_eq!(t.rotation.w, 1.0);
        assert_eq!(t.scale.x, 1.0);
        assert_eq!(t.scale.y, 1.0);
        assert_eq!(t.scale.z, 1.0);
    }
}

mod decompose_matrix4_to_transform3d {
    use super::*;

    #[test]
    fn round_trips_a_shear_free_compose() {
        let mut source = create_transform3d();
        source.position = create_vector3(1.0, 2.0, 3.0);
        source.rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
        source.scale = create_vector3(2.0, 3.0, 4.0);
        let mut m = create_matrix4();
        compose_matrix4_from_transform3d(&mut m, &source);

        let mut out = create_transform3d();
        decompose_matrix4_to_transform3d(&mut out, &m);
        assert_eq!(out.position.x, 1.0);
        assert_eq!(out.position.y, 2.0);
        assert_eq!(out.position.z, 3.0);
        assert_close(out.scale.x, 2.0);
        assert_close(out.scale.y, 3.0);
        assert_close(out.scale.z, 4.0);
    }
}
