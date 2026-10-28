use flight_geometry::*;
use flight_velocity::contract::*;

mod create_velocity_sample {
    use super::*;

    #[test]
    fn starts_with_zero_velocity_no_previous_transform_and_untouched_frame_ids() {
        let sample = create_velocity_sample();
        assert!(sample.previous_world_transform.is_none());
        assert_eq!(sample.velocity.x, 0.0);
        assert_eq!(sample.velocity.y, 0.0);
        assert_eq!(sample.last_frame_id, -1);
        assert_eq!(sample.explicit_frame_id, -1);
    }
}

mod explain_velocity_sample {
    use super::*;

    #[test]
    fn reports_no_sample_when_the_sample_is_missing() {
        let result = explain_velocity_sample(None, 3);
        assert_eq!(result.reason, VelocityReason::NoSample);
        assert_eq!(result.current_frame_id, 3);
        assert_eq!(result.explicit, false);
        assert_eq!(result.last_frame_id, -1);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
    }

    #[test]
    fn reports_stale_with_zero_velocity_when_not_touched_this_frame() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 2, 5.0, 5.0);
        let result = explain_velocity_sample(Some(&sample), 3);
        assert_eq!(result.reason, VelocityReason::Stale);
        assert_eq!(result.current_frame_id, 3);
        assert_eq!(result.explicit, false);
        assert_eq!(result.last_frame_id, 2);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
    }

    #[test]
    fn reports_explicit_zero_for_an_explicit_zero_write() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 4, 0.0, 0.0);
        let result = explain_velocity_sample(Some(&sample), 4);
        assert_eq!(result.reason, VelocityReason::ExplicitZero);
        assert_eq!(result.explicit, true);
        assert_eq!(result.last_frame_id, 4);
    }

    #[test]
    fn reports_derived_zero_for_a_derived_zero_velocity() {
        let mut sample = create_velocity_sample();
        sample.last_frame_id = 4;
        let result = explain_velocity_sample(Some(&sample), 4);
        assert_eq!(result.reason, VelocityReason::DerivedZero);
        assert_eq!(result.explicit, false);
        assert_eq!(result.last_frame_id, 4);
    }

    #[test]
    fn reports_ok_with_explicit_true_for_an_explicit_nonzero_write() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 1, 3.0, -4.0);
        let result = explain_velocity_sample(Some(&sample), 1);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.current_frame_id, 1);
        assert_eq!(result.explicit, true);
        assert_eq!(result.last_frame_id, 1);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, -4.0);
    }

    #[test]
    fn reports_ok_with_explicit_false_for_a_derived_nonzero_velocity() {
        let mut sample = create_velocity_sample();
        sample.velocity.x = 7.0;
        sample.velocity.y = -2.0;
        sample.last_frame_id = 1;
        sample.explicit_frame_id = 0;
        let result = explain_velocity_sample(Some(&sample), 1);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.explicit, false);
        assert_eq!(result.x, 7.0);
        assert_eq!(result.y, -2.0);
    }
}

mod get_velocity_sample_at {
    use super::*;

    #[test]
    fn returns_zero_when_the_sample_has_no_previous_world_transform() {
        let sample = create_velocity_sample();
        let identity = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let mut out = Velocity2D { x: 99.0, y: 99.0 };
        get_velocity_sample_at(&sample, &identity, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn returns_translation_delta_at_the_origin_when_transform_is_translation_only() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 8.0, 9.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(&sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 5.0);
        assert_eq!(out.y, 5.0);
    }

    #[test]
    fn computes_affine_reprojection_for_a_non_origin_point() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(&sample, &current, 1.0, 0.0, &mut out);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn computes_correct_velocity_for_a_rotating_transform_at_a_non_origin_point() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let rotated_90 = create_matrix(0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(&sample, &rotated_90, 1.0, 0.0, &mut out);
        assert!((out.x - (-1.0)).abs() < 1e-4);
        assert!((out.y - 1.0).abs() < 1e-4);
    }

    #[test]
    fn computes_the_translation_delta_for_a_pair_of_translated_transforms() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 1.0, 2.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 4.0, 6.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(&sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    #[test]
    fn reprojects_transforms_independently_of_explicit_velocity_writes() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 7.0, 3.0);
        write_velocity_sample(&mut sample, 0, 0.0, 0.0);
        write_velocity_sample(&mut sample, 0, 0.0, 0.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(&sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 3.0);
    }
}

mod is_velocity_sample_nonzero {
    use super::*;

    #[test]
    fn is_false_for_a_missing_sample() {
        assert_eq!(is_velocity_sample_nonzero(None, 0), false);
    }

    #[test]
    fn is_true_for_a_nonzero_sample_touched_this_frame() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 2, 1.0, 0.0);
        assert_eq!(is_velocity_sample_nonzero(Some(&sample), 2), true);
    }

    #[test]
    fn is_true_when_only_the_y_component_is_nonzero() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 2, 0.0, -1.0);
        assert_eq!(is_velocity_sample_nonzero(Some(&sample), 2), true);
    }

    #[test]
    fn is_false_for_a_zero_sample_touched_this_frame() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 2, 0.0, 0.0);
        assert_eq!(is_velocity_sample_nonzero(Some(&sample), 2), false);
    }

    #[test]
    fn is_false_for_a_stale_nonzero_sample() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 2, 1.0, 1.0);
        assert_eq!(is_velocity_sample_nonzero(Some(&sample), 3), false);
    }
}

mod read_velocity_sample {
    use super::*;

    #[test]
    fn writes_zero_for_a_missing_sample() {
        let mut out = Velocity2D { x: 9.0, y: 9.0 };
        read_velocity_sample(None, 0, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn writes_the_velocity_of_a_sample_touched_this_frame() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 5, 3.0, -4.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        read_velocity_sample(Some(&sample), 5, &mut out);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, -4.0);
    }

    #[test]
    fn writes_zero_for_a_stale_sample() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 5, 3.0, -4.0);
        let mut out = Velocity2D { x: 9.0, y: 9.0 };
        read_velocity_sample(Some(&sample), 6, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }

    #[test]
    fn writes_the_velocity_of_a_derived_sample_touched_this_frame() {
        let mut sample = create_velocity_sample();
        sample.velocity.x = 2.0;
        sample.velocity.y = 1.0;
        sample.last_frame_id = 5;
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        read_velocity_sample(Some(&sample), 5, &mut out);
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 1.0);
    }
}

mod write_velocity_sample {
    use super::*;

    #[test]
    fn records_the_velocity_and_both_frame_ids() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 3, 1.5, -2.5);
        assert_eq!(sample.velocity.x, 1.5);
        assert_eq!(sample.velocity.y, -2.5);
        assert_eq!(sample.last_frame_id, 3);
        assert_eq!(sample.explicit_frame_id, 3);
    }

    #[test]
    fn overwrites_a_previous_write() {
        let mut sample = create_velocity_sample();
        write_velocity_sample(&mut sample, 3, 9.0, 9.0);
        write_velocity_sample(&mut sample, 4, 0.0, 0.0);
        assert_eq!(sample.velocity.x, 0.0);
        assert_eq!(sample.velocity.y, 0.0);
        assert_eq!(sample.last_frame_id, 4);
        assert_eq!(sample.explicit_frame_id, 4);
    }

    #[test]
    fn leaves_the_previous_world_transform_untouched() {
        let mut sample = create_velocity_sample();
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 4.0, 5.0));
        write_velocity_sample(&mut sample, 1, 2.0, 2.0);
        assert_eq!(sample.previous_world_transform.unwrap().tx, 4.0);
    }
}
