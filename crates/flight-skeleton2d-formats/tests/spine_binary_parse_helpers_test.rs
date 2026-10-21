use std::collections::HashMap;

use flight_skeleton2d_formats::contract::*;

mod clamp_spine_binary_unit {
    use super::*;
    #[test]
    fn clamps_both_bounds() {
        assert_eq!(clamp_spine_binary_unit(-1.0), 0.0);
        assert_eq!(clamp_spine_binary_unit(2.0), 1.0);
    }
}

mod read_spine_binary_string_reference {
    use super::*;
    #[test]
    fn uses_one_based_indices_and_a_zero_null_sentinel() {
        let strings = vec![Some("a".to_string()), None];
        let mut reader = create_spine_binary_reader(&[1, 0, 3]);
        assert_eq!(
            read_spine_binary_string_reference(&mut reader, &strings).as_deref(),
            Some("a")
        );
        assert_eq!(
            read_spine_binary_string_reference(&mut reader, &strings),
            None
        );
        assert_eq!(
            read_spine_binary_string_reference(&mut reader, &strings),
            None
        );
    }
}

mod report_spine_binary_crumb {
    use super::*;
    #[test]
    fn reports_only_nonzero_counts() {
        let mut diagnostics = Vec::new();
        report_spine_binary_crumb(Some(&mut diagnostics), 0, "zero", "origin", "items");
        report_spine_binary_crumb(Some(&mut diagnostics), 2, "two", "origin", "items");
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "two");
    }
}

mod skip_spine_binary_curve_frames {
    use super::*;
    #[test]
    fn consumes_initial_payloads_and_following_curve_tags() {
        let mut bytes = vec![0_u8; 16];
        bytes.push(0);
        let mut reader = create_spine_binary_reader(&bytes);
        skip_spine_binary_curve_frames(&mut reader, 2, 4, 1);
        assert_eq!(reader.offset, 17);
    }
}

mod skip_spine_binary_curve_tag {
    use super::*;
    #[test]
    fn consumes_bezier_control_values_only_for_tag_two() {
        let mut bytes = vec![SPINE_BINARY_CURVE_BEZIER];
        bytes.extend([0_u8; 16]);
        let mut reader = create_spine_binary_reader(&bytes);
        skip_spine_binary_curve_tag(&mut reader, 1);
        assert_eq!(reader.offset, 17);
    }
}

mod tally {
    use super::*;
    #[test]
    fn increments_named_counts() {
        let mut counts = HashMap::new();
        tally(&mut counts, "bone");
        tally(&mut counts, "bone");
        assert_eq!(counts.get("bone"), Some(&2));
    }
}
