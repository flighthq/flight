//! flight-compiler: target-native

use flight_entity::get_entity_id;
use flight_geometry::create_matrix;
use flight_node::NodeRef;
use flight_scene2d::create_display_object;
use flight_velocity::contract::*;

mod begin_velocity_frame {
    use super::*;

    #[test]
    fn advances_the_frame_id() {
        let mut field = create_velocity_field();
        let before = field.frame_id;
        begin_velocity_frame(&mut field);
        assert_eq!(field.frame_id, before + 1);
    }
}

mod contribute_velocity {
    use super::*;

    #[test]
    fn records_an_explicit_velocity_readable_this_frame() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 3.0, -4.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, -4.0);
    }

    #[test]
    fn accepts_any_source_id() {
        let mut field = create_velocity_field();
        let source_id: u64 = 42;
        contribute_velocity(&mut field, source_id, 1.0, 2.0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
    }
}

mod create_velocity_field {
    use super::*;

    #[test]
    fn starts_at_frame_zero_and_returns_zero_for_unknown_sources() {
        let field = create_velocity_field();
        assert_eq!(field.frame_id, 0);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(&field, 999, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod ensure_node_velocity_sample {
    use super::*;

    #[test]
    fn keys_the_sample_by_the_node_entity_id() {
        let mut field = create_velocity_field();
        let node: NodeRef = create_display_object();
        let source = get_entity_id(&*node.read().unwrap());
        ensure_node_velocity_sample(&mut field, &node).velocity.x = 6.0;
        assert_eq!(
            find_velocity_sample(&field, source).unwrap().velocity.x,
            6.0
        );
    }

    #[test]
    fn gives_distinct_nodes_distinct_samples() {
        let mut field = create_velocity_field();
        let a: NodeRef = create_display_object();
        let b: NodeRef = create_display_object();
        ensure_node_velocity_sample(&mut field, &a).velocity.x = 1.0;
        ensure_node_velocity_sample(&mut field, &b).velocity.x = 2.0;
        assert_eq!(ensure_node_velocity_sample(&mut field, &a).velocity.x, 1.0);
        assert_eq!(ensure_node_velocity_sample(&mut field, &b).velocity.x, 2.0);
    }
}

mod ensure_velocity_sample {
    use super::*;

    #[test]
    fn creates_the_default_sample_for_a_new_source() {
        let mut field = create_velocity_field();
        let sample = ensure_velocity_sample(&mut field, 1);
        assert_eq!(*sample, create_velocity_sample());
    }

    #[test]
    fn returns_the_same_sample_on_repeat_calls() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        ensure_velocity_sample(&mut field, source_id).velocity.x = 42.0;
        assert_eq!(
            ensure_velocity_sample(&mut field, source_id).velocity.x,
            42.0
        );
        assert_eq!(field.samples.len(), 1);
    }
}

mod explain_velocity {
    use super::*;

    #[test]
    fn reports_no_sample_for_an_unknown_source() {
        let field = create_velocity_field();
        let result = explain_velocity(&field, 999);
        assert_eq!(result.reason, VelocityReason::NoSample);
    }

    #[test]
    fn reports_stale_when_the_sample_was_not_touched_this_frame() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 5.0, 5.0);
        begin_velocity_frame(&mut field);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Stale);
    }

    #[test]
    fn reports_explicit_zero_for_a_suppressed_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        suppress_velocity(&mut field, source_id);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::ExplicitZero);
        assert_eq!(result.explicit, true);
    }

    #[test]
    fn reports_derived_zero_when_the_transform_baseline_produces_zero() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        let frame_id = field.frame_id;
        let sample = ensure_velocity_sample(&mut field, source_id);
        sample.velocity.x = 0.0;
        sample.velocity.y = 0.0;
        sample.last_frame_id = frame_id;
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::DerivedZero);
        assert_eq!(result.explicit, false);
    }

    #[test]
    fn reports_ok_with_velocity_values_for_a_contributing_source() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 3.0, -4.0);
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.x, 3.0);
        assert_eq!(result.y, -4.0);
        assert_eq!(result.explicit, true);
    }

    #[test]
    fn reports_ok_with_explicit_false_for_a_derived_nonzero_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        let frame_id = field.frame_id;
        let sample = ensure_velocity_sample(&mut field, source_id);
        sample.velocity.x = 7.0;
        sample.velocity.y = -2.0;
        sample.last_frame_id = frame_id;
        let result = explain_velocity(&field, source_id);
        assert_eq!(result.reason, VelocityReason::Ok);
        assert_eq!(result.x, 7.0);
        assert_eq!(result.y, -2.0);
        assert_eq!(result.explicit, false);
    }
}

mod find_velocity_sample {
    use super::*;

    #[test]
    fn returns_none_for_an_unknown_source_without_creating_one() {
        let field = create_velocity_field();
        assert!(find_velocity_sample(&field, 7).is_none());
        assert_eq!(field.samples.len(), 0);
    }

    #[test]
    fn returns_the_stored_sample_for_a_known_source() {
        let mut field = create_velocity_field();
        contribute_velocity(&mut field, 7, 1.0, 2.0);
        let sample = find_velocity_sample(&field, 7).unwrap();
        assert_eq!(sample.velocity.x, 1.0);
        assert_eq!(sample.velocity.y, 2.0);
    }
}

mod get_velocity {
    use super::*;

    #[test]
    fn returns_zero_once_the_sample_is_stale_after_the_frame_advances() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 5.0, 5.0);
        begin_velocity_frame(&mut field);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}

mod has_velocity {
    use super::*;

    #[test]
    fn is_true_for_nonzero_velocity_and_false_for_suppressed() {
        let mut field = create_velocity_field();
        let moving_id: u64 = 1;
        let still_id: u64 = 2;
        contribute_velocity(&mut field, moving_id, 1.0, 0.0);
        suppress_velocity(&mut field, still_id);
        assert_eq!(has_velocity(&field, moving_id), true);
        assert_eq!(has_velocity(&field, still_id), false);
    }
}

mod initialize_velocity_field {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_velocity_field() {
        let mut field = create_velocity_field();
        initialize_velocity_field(&mut field);
        assert_eq!(field.frame_id, 0);
    }
}

mod suppress_velocity {
    use super::*;

    #[test]
    fn keeps_the_previous_world_transform_for_reprojection() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        ensure_velocity_sample(&mut field, source_id).previous_world_transform =
            Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
        let current = create_matrix(1.0, 0.0, 0.0, 1.0, 7.0, 3.0);
        contribute_velocity(&mut field, source_id, 0.0, 0.0);
        suppress_velocity(&mut field, source_id);
        let sample = find_velocity_sample(&field, source_id).unwrap();
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity_sample_at(sample, &current, 0.0, 0.0, &mut out);
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 3.0);
    }

    #[test]
    fn zeroes_a_previously_set_velocity() {
        let mut field = create_velocity_field();
        let source_id: u64 = 1;
        contribute_velocity(&mut field, source_id, 9.0, 9.0);
        suppress_velocity(&mut field, source_id);
        let mut out = Velocity2D { x: 0.0, y: 0.0 };
        get_velocity(&field, source_id, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
    }
}
