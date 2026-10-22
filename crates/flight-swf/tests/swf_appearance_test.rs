use std::sync::{Arc, RwLock};

use flight_adjustments::contract::create_color_scale_bias_adjustment;
use flight_effects::contract::{
    ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_OVERLAY,
};
use flight_materials::contract::{
    BLEND_MODE_ADD, BLEND_MODE_DARKEN, BLEND_MODE_LIGHTEN, BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL,
    BLEND_MODE_SCREEN, create_color_scale_bias,
};
use flight_swf::contract::*;

use crate::support::{SwfBitWriter, reader};

mod empty_adjustments {
    use super::*;

    #[test]
    fn is_the_one_empty_array_every_untinted_placement_shares() {
        assert!(EMPTY_ADJUSTMENTS.is_empty());
    }
}

mod empty_effects {
    use super::*;

    #[test]
    fn is_the_one_empty_array_every_unfiltered_placement_shares() {
        assert!(EMPTY_EFFECTS.is_empty());
    }
}

mod join_swf_color_adjustments {
    use super::*;

    #[test]
    fn concatenates_the_color_transform_before_filter_adjustments() {
        let color_transform = Arc::new(vec![scale_bias(0.5)]);
        let filters = Arc::new(vec![scale_bias(0.25)]);
        let joined = join_swf_color_adjustments(Some(&color_transform), &filters).unwrap();
        assert_eq!(joined.len(), 2);
        assert!(Arc::ptr_eq(&joined[0], &color_transform[0]));
        assert!(Arc::ptr_eq(&joined[1], &filters[0]));
    }

    #[test]
    fn returns_filter_adjustments_by_identity_when_the_record_has_no_tint() {
        let filters = Arc::new(vec![scale_bias(0.25)]);
        let joined = join_swf_color_adjustments(None, &filters).unwrap();
        assert!(Arc::ptr_eq(&joined, &filters));
    }

    #[test]
    fn returns_null_when_both_channels_are_empty() {
        assert!(join_swf_color_adjustments(None, &EMPTY_ADJUSTMENTS).is_none());
        assert!(EMPTY_EFFECTS.is_empty());
    }

    #[test]
    fn returns_the_color_transform_by_identity_when_filters_are_empty() {
        let color_transform = Arc::new(vec![scale_bias(0.5)]);
        let joined =
            join_swf_color_adjustments(Some(&color_transform), &EMPTY_ADJUSTMENTS).unwrap();
        assert!(Arc::ptr_eq(&joined, &color_transform));
    }
}

mod read_swf_color_transform {
    use super::*;

    #[test]
    fn reads_a_color_multiplier_into_a_scale_bias_adjustment() {
        let mut source = reader(multiply_terms(&[128, 256, 256, 256]));
        let result = read_swf_color_transform(&mut source, 4);
        assert_eq!(result.alpha, 1.0);
        let matrix = result.color_adjustments.unwrap()[0]
            .read()
            .unwrap()
            .adjustment_fields()
            .color_matrix
            .unwrap();
        assert_close(matrix[0], 0.5, 0.0);
    }

    #[test]
    fn reads_a_pure_alpha_multiplier_onto_alpha() {
        let mut source = reader(multiply_terms(&[256, 256, 256, 128]));
        let result = read_swf_color_transform(&mut source, 4);
        assert_close(result.alpha, 0.5, 0.0);
        assert!(result.color_adjustments.is_none());
    }

    #[test]
    fn reads_a_three_channel_record_as_opaque() {
        let mut source = reader(multiply_terms(&[128, 256, 256]));
        let result = read_swf_color_transform(&mut source, 3);
        assert_eq!(result.alpha, 1.0);
        assert!(result.color_adjustments.is_some());
    }

    #[test]
    fn reads_a_truncated_record_as_the_identity_transform() {
        let mut source = reader(Vec::new());
        let result = read_swf_color_transform(&mut source, 4);
        assert_eq!(result.alpha, 1.0);
        assert!(result.color_adjustments.is_none());
    }
}

mod resolve_swf_advanced_blend_mode {
    use super::*;

    #[test]
    fn names_the_destination_reading_modes() {
        assert_eq!(
            resolve_swf_advanced_blend_mode(7).as_deref(),
            Some(ADVANCED_BLEND_MODE_DIFFERENCE)
        );
        assert_eq!(
            resolve_swf_advanced_blend_mode(13).as_deref(),
            Some(ADVANCED_BLEND_MODE_OVERLAY)
        );
        assert_eq!(
            resolve_swf_advanced_blend_mode(14).as_deref(),
            Some(ADVANCED_BLEND_MODE_HARD_LIGHT)
        );
    }

    #[test]
    fn returns_the_sentinel_for_fixed_function_modes() {
        assert!(resolve_swf_advanced_blend_mode(3).is_none());
        assert!(resolve_swf_advanced_blend_mode(0).is_none());
    }
}

mod resolve_swf_blend_mode {
    use super::*;

    #[test]
    fn leaves_advanced_modes_as_normal() {
        assert_eq!(resolve_swf_blend_mode(7), BLEND_MODE_NORMAL);
        assert_eq!(resolve_swf_blend_mode(13), BLEND_MODE_NORMAL);
    }

    #[test]
    fn maps_each_fixed_function_mode() {
        assert_eq!(resolve_swf_blend_mode(3), BLEND_MODE_MULTIPLY);
        assert_eq!(resolve_swf_blend_mode(4), BLEND_MODE_SCREEN);
        assert_eq!(resolve_swf_blend_mode(5), BLEND_MODE_LIGHTEN);
        assert_eq!(resolve_swf_blend_mode(6), BLEND_MODE_DARKEN);
        assert_eq!(resolve_swf_blend_mode(8), BLEND_MODE_ADD);
    }

    #[test]
    fn treats_normal_encodings_and_the_layer_hint_as_normal() {
        assert_eq!(resolve_swf_blend_mode(0), BLEND_MODE_NORMAL);
        assert_eq!(resolve_swf_blend_mode(1), BLEND_MODE_NORMAL);
        assert_eq!(resolve_swf_blend_mode(2), BLEND_MODE_NORMAL);
    }
}

fn assert_close(actual: f32, expected: f32, source_bound: f32) {
    let roundoff = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    let bound = source_bound.max(roundoff);
    assert!(
        (actual - expected).abs() <= bound,
        "actual={actual}, expected={expected}, bound={bound}"
    );
}

fn multiply_terms(terms: &[i32]) -> Vec<u8> {
    let mut writer = SwfBitWriter::new();
    writer.write_unsigned(0, 1);
    writer.write_unsigned(1, 1);
    writer.write_unsigned(10, 4);
    for term in terms {
        writer.write_signed(*term, 10);
    }
    return writer.to_bytes();
}

fn scale_bias(red_scale: f32) -> SwfAdjustmentRef {
    let mut value = create_color_scale_bias();
    value.red_scale = red_scale;
    return Arc::new(RwLock::new(create_color_scale_bias_adjustment(&value)));
}
