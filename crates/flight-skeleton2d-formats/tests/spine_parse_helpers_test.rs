use flight_entity::allocate_entity;
use flight_skeleton2d::contract::{Bone2D, Slot2D};
use flight_skeleton2d_formats::contract::*;
use serde_json::{Value, json};

mod build_spine_segment_easings {
    use super::*;

    #[test]
    fn chooses_the_dominant_component_and_reports_divergence() {
        let key = json!({"curve":[0.25,2.5,0.75,7.5,0.2,20.0,0.8,80.0]});
        let keys = vec![
            JsonRecord::from(key.as_object().unwrap().clone()),
            JsonRecord::new(),
        ];
        let times = vec![0.0, 1.0];
        let values = vec![0.0, 0.0, 10.0, 100.0];
        let mut diagnostics = Vec::new();
        let actual =
            build_spine_segment_easings(&keys, &times, &values, 2, Some(&mut diagnostics)).unwrap();
        let expected = flight_easing::contract::ease_cubic_bezier(0.2, 0.2, 0.8, 0.8);
        let actual = actual[0].as_ref().unwrap();
        for alpha in [0.2, 0.5, 0.8] {
            assert!((actual(alpha) - expected(alpha)).abs() < 1e-6);
        }
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].kind,
            "spine.per-component-curve-easing-unsupported"
        );
    }

    #[test]
    fn clamps_time_overshoot_but_not_value_overshoot() {
        let key = json!({"curve":[-1.0,-0.5,2.0,1.5]});
        let keys = vec![
            JsonRecord::from(key.as_object().unwrap().clone()),
            JsonRecord::new(),
        ];
        let times = vec![0.0, 1.0];
        let values = vec![0.0, 1.0];
        let mut diagnostics = Vec::new();
        let actual =
            build_spine_segment_easings(&keys, &times, &values, 1, Some(&mut diagnostics)).unwrap();
        let expected = flight_easing::contract::ease_cubic_bezier(0.0, -0.5, 1.0, 1.5);
        let actual = actual[0].as_ref().unwrap();
        assert!((actual(0.25) - expected(0.25)).abs() < 1e-6);
        assert_eq!(diagnostics[0].kind, "spine.curve-time-overshoot-clamped");
    }

    #[test]
    fn preserves_absence_for_an_uncurved_timeline() {
        let key = json!({});
        let keys = vec![JsonRecord::from(key.as_object().unwrap().clone())];
        let times = vec![0.0];
        let values = vec![0.0];
        assert!(build_spine_segment_easings(&keys, &times, &values, 1, None).is_none());
    }
}

mod clamp_unit {
    use super::*;
    #[test]
    fn clamps_both_bounds() {
        assert_eq!(clamp_unit(-1.0), 0.0);
        assert_eq!(clamp_unit(2.0), 1.0);
    }
}

mod index_of_bone {
    use super::*;
    #[test]
    fn resolves_by_name_with_a_negative_sentinel() {
        let mut bone: Bone2D = allocate_entity();
        bone.name = Some("root".to_string());
        assert_eq!(index_of_bone(&[bone], "root"), 0);
        assert_eq!(index_of_bone(&[], "root"), -1);
    }
}

mod index_of_spine_slot {
    use super::*;
    #[test]
    fn resolves_by_name_with_a_negative_sentinel() {
        let mut slot: Slot2D = allocate_entity();
        slot.name = Some("slot".to_string());
        assert_eq!(index_of_spine_slot(&[slot], "slot"), 0);
        assert_eq!(index_of_spine_slot(&[], "slot"), -1);
    }
}

mod number_or {
    use super::*;
    #[test]
    fn accepts_numbers_and_rejects_other_types() {
        assert_eq!(number_or(Some(&Value::from(3.5)), 7.0), 3.5);
        assert_eq!(number_or(Some(&Value::from("3.5")), 7.0), 7.0);
    }
}

mod parse_spine_color {
    use super::*;
    #[test]
    fn parses_rgba_hex_and_defaults_invalid_values() {
        assert_eq!(
            parse_spine_color(Some(&Value::from("11223344"))),
            0x1122_3344
        );
        assert_eq!(parse_spine_color(Some(&Value::from("bad"))), u32::MAX);
    }
}

mod skip_crumb_spine_timeline_group {
    use super::*;
    #[test]
    fn reports_only_nonempty_groups() {
        let mut diagnostics = Vec::new();
        skip_crumb_spine_timeline_group(Some(&mut diagnostics), Some(&json!([{}])), "test.kind");
        assert_eq!(diagnostics[0].kind, "test.kind");
    }
}
