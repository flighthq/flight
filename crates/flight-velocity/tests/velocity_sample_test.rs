use flight_geometry::*;
use flight_velocity::*;

mod get_velocity_sample_at {
    use super::*;

    #[test]
    fn returns_zero_when_the_sample_has_no_previous_world_transform() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = None;
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = create_velocity2d(99.0, 99.0);
        get_velocity_sample_at(&sample, &identity, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn returns_translation_delta_at_the_origin_when_transform_is_translation_only() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 8.0, 9.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity_sample_at(&sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn computes_affine_reprojection_for_a_non_origin_point() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity_sample_at(&sample, &current, 1.0, 0.0, &mut out);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn computes_correct_velocity_for_a_rotating_transform_at_a_non_origin_point() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let rotated_90 = create_matrix(0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity_sample_at(&sample, &rotated_90, 1.0, 0.0, &mut out);
        assert!((out.x - (-1.0)).abs() < 1e-4);
        assert!((out.y - 1.0).abs() < 1e-4);
    }

    #[test]
    fn computes_the_translation_delta_for_a_pair_of_translated_transforms() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 1.0, 2.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 4.0, 6.0);
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity_sample_at(&sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    #[test]
    fn reprojects_transforms_independently_of_contribute_velocity_and_suppress_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        {
            let sample = ensure_velocity_sample(&mut field, source_id);
            sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        }
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 7.0, 3.0);
        contribute_velocity(&mut field, source_id, 0.0, 0.0);
        suppress_velocity(&mut field, source_id);
        let sample = field.samples.get(&source_id).unwrap();
        let mut out = create_velocity2d(0.0, 0.0);
        get_velocity_sample_at(sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 3.0);
    }
}
