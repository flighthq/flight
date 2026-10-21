use crate::common::*;
use flight_textformat::{TextFormatAlign, TextFormatListMarker};
use flight_textlayout::contract::*;
use flight_textshaper::TextDirection;

fn base_format() -> TextFormat {
    let mut format = empty_text_format();
    format.size = Some(16.0);
    return format;
}

fn do_layout(params: TextLayoutParams) -> TextLayoutResult {
    let mut out = create_text_layout_result();
    compute_text_layout(&mut out, &params);
    return out;
}

fn params_with_format(text: &str, width: f32, format: TextFormat) -> TextLayoutParams {
    let mut params = single_range_params(text, width);
    params.format_ranges = vec![range(format, 0, text.encode_utf16().count())];
    return params;
}

fn placed_ascii_text(text: &str, layout: &TextLayoutResult) -> String {
    return layout
        .groups
        .iter()
        .filter(|group| group.start_index != group.end_index)
        .map(|group| &text[group.start_index..group.end_index])
        .collect();
}

mod compute_text_layout {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn appends_ellipsis_when_word_wrapped_text_overflows_max_lines() {
        let text = "word one word two word three word four";
        let mut params = single_range_params(text, 100.0);
        params.height = 200.0;
        params.max_lines = Some(2);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines <= 2);
        assert!(
            result
                .groups
                .iter()
                .any(|group| group.line_index == result.num_lines - 1)
        );
    }

    #[test]
    fn breaks_a_single_long_word_that_exceeds_the_wrap_width() {
        let mut params = single_range_params("abcdefghij", 50.0);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        assert!(do_layout(params).num_lines > 1);
    }

    #[test]
    fn centers_a_short_single_line_against_a_real_width_when_word_wrap_is_false() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Center);
        let mut params = params_with_format("hi", 200.0, format);
        params.multiline = Some(false);
        params.word_wrap = Some(false);
        let offset_x = do_layout(params).groups[0].offset_x;
        assert_eq!(offset_x, 90.0);
        assert!(offset_x < 200.0);
    }

    #[test]
    fn clips_a_long_word_spanning_the_max_lines_boundary() {
        let mut params = single_range_params("abcdefghijklmnop", 60.0);
        params.height = 200.0;
        params.max_lines = Some(1);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines <= 1);
        assert!(result.groups.iter().any(|group| group.line_index == 0));
    }

    #[test]
    fn clips_to_max_lines_and_appends_truncation_character() {
        let text = "line one\nline two\nline three";
        let mut params = single_range_params(text, 300.0);
        params.height = 200.0;
        params.max_lines = Some(2);
        params.multiline = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines <= 2);
        assert!(
            result
                .groups
                .iter()
                .any(|group| group.line_index == result.num_lines - 1)
        );
    }

    #[test]
    fn does_not_emit_a_bullet_group_when_list_marker_is_none() {
        let mut format = base_format();
        format.bullet = Some(true);
        format.list_marker = Some(TextFormatListMarker::None);
        let mut params = params_with_format("item", 200.0, format);
        params.multiline = Some(true);
        let result = do_layout(params);
        assert!(
            !result
                .groups
                .iter()
                .any(|group| group.start_index == group.end_index)
        );
    }

    #[test]
    fn does_not_justify_the_last_line_of_each_paragraph_in_multi_paragraph_text() {
        let text = "aa bb\ncc dd";
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Justify);
        let mut params = params_with_format(text, 100.0, format);
        params.height = 200.0;
        params.multiline = Some(true);
        let result = do_layout(params);
        assert_eq!(result.num_lines, 2);
        let first = result
            .groups
            .iter()
            .find(|group| group.line_index == 0)
            .unwrap();
        let second = result
            .groups
            .iter()
            .find(|group| group.line_index == 1)
            .unwrap();
        assert_eq!(first.offset_x, TEXT_LAYOUT_GUTTER);
        assert_eq!(second.offset_x, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn does_not_split_on_lf_when_multiline_is_false() {
        let mut params = single_range_params("ab\ncd", 1000.0);
        params.multiline = Some(false);
        assert_eq!(do_layout(params).num_lines, 1);
    }

    #[test]
    fn does_not_split_surrogate_pairs() {
        let text = "😀ab";
        let result = do_layout(single_range_params(text, 200.0));
        assert_eq!(result.groups[0].positions.len(), 3);
    }

    #[test]
    fn does_not_wrap_when_word_wrap_is_false_even_if_text_exceeds_width() {
        let mut params = single_range_params("hello world", 50.0);
        params.word_wrap = Some(false);
        assert_eq!(do_layout(params).num_lines, 1);
    }

    #[test]
    fn emits_a_bullet_glyph_group_for_a_bullet_format() {
        let mut format = base_format();
        format.bullet = Some(true);
        let mut params = params_with_format("item", 200.0, format);
        params.multiline = Some(true);
        let result = do_layout(params);
        let bullet = result
            .groups
            .iter()
            .find(|group| group.start_index == group.end_index)
            .unwrap();
        assert_eq!(bullet.line_index, 0);
    }

    #[test]
    fn emits_a_bullet_group_when_list_marker_is_absent() {
        let mut format = base_format();
        format.bullet = Some(true);
        let mut params = params_with_format("item", 200.0, format);
        params.multiline = Some(true);
        let result = do_layout(params);
        assert!(
            result
                .groups
                .iter()
                .any(|group| group.start_index == group.end_index)
        );
    }

    #[test]
    fn expands_space_character_advances_on_a_wrapped_mid_paragraph_line() {
        let text = "aa bb cc";
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Justify);
        let mut params = params_with_format(text, 80.0, format);
        params.height = 200.0;
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines >= 2);
        let mut expanded = false;
        for group in result.groups.iter().filter(|group| group.line_index == 0) {
            for (source_index, advance) in (group.start_index..).zip(group.positions.iter()) {
                if text.as_bytes().get(source_index) == Some(&b' ') && *advance > 10.0 {
                    expanded = true;
                }
            }
        }
        assert!(expanded);
    }

    #[test]
    fn expands_the_actual_space_advance_after_an_astral_codepoint() {
        let text = "😀 a bb";
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Justify);
        let mut params = params_with_format(text, 70.0, format);
        params.height = 200.0;
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines >= 2);
        let group = result
            .groups
            .iter()
            .find(|group| group.line_index == 0 && group.start_index == 0)
            .unwrap();
        assert_eq!(group.positions[0], 20.0);
        assert!(group.positions[1] > 10.0);
    }

    #[test]
    fn handles_multiple_consecutive_breaks() {
        let mut params = single_range_params("a\n\nb", 1000.0);
        params.multiline = Some(true);
        assert_eq!(do_layout(params).num_lines, 3);
    }

    #[test]
    fn is_inert_when_the_container_is_not_taller_than_its_content() {
        let mut top = single_range_params("hi", 100.0);
        top.height = 4.0;
        let top_y = do_layout(top.clone()).groups[0].offset_y;
        top.vertical_align = Some(TextVerticalAlign::Middle);
        assert_eq!(do_layout(top.clone()).groups[0].offset_y, top_y);
        top.vertical_align = Some(TextVerticalAlign::Bottom);
        assert_eq!(do_layout(top).groups[0].offset_y, top_y);
    }

    #[test]
    fn justifies_mid_paragraph_lines_but_not_paragraph_last_lines() {
        let text = "aa bb cc dd";
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Justify);
        let mut params = params_with_format(text, 56.0, format);
        params.height = 200.0;
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(result.num_lines >= 2);
        let last_line = result.num_lines - 1;
        let group = result
            .groups
            .iter()
            .find(|group| group.line_index == last_line)
            .unwrap();
        assert_eq!(group.offset_x, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn leaves_offset_y_unchanged_for_the_top_default() {
        let mut explicit = single_range_params("hi", 100.0);
        explicit.height = 200.0;
        let implicit = do_layout(explicit.clone()).groups[0].offset_y;
        explicit.vertical_align = Some(TextVerticalAlign::Top);
        assert_eq!(do_layout(explicit).groups[0].offset_y, implicit);
    }

    #[test]
    fn lets_an_explicit_positive_indent_win_over_the_bullet_width() {
        let mut format = base_format();
        format.bullet = Some(true);
        format.indent = Some(1.0);
        let mut params = params_with_format("item", 200.0, format);
        params.multiline = Some(true);
        let result = do_layout(params);
        let bullet = result
            .groups
            .iter()
            .find(|group| group.start_index == group.end_index)
            .unwrap();
        let text = result
            .groups
            .iter()
            .find(|group| group.start_index != group.end_index)
            .unwrap();
        assert_eq!(bullet.offset_x, TEXT_LAYOUT_GUTTER);
        assert_eq!(text.offset_x, TEXT_LAYOUT_GUTTER + 1.0);
        assert!(text.offset_x < bullet.offset_x + bullet.width);
    }

    #[test]
    fn places_a_20px_centered_text_at_offset_x_40() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Center);
        let result = do_layout(params_with_format("hi", 100.0, format));
        assert_eq!(result.groups[0].offset_x, 40.0);
    }

    #[test]
    fn places_a_20px_right_aligned_text_at_offset_x_78() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Right);
        let result = do_layout(params_with_format("hi", 100.0, format));
        assert_eq!(result.groups[0].offset_x, 78.0);
    }

    #[test]
    fn places_middle_at_exactly_half_the_bottom_shift() {
        let mut params = single_range_params("hi", 100.0);
        params.height = 200.0;
        let top_y = do_layout(params.clone()).groups[0].offset_y;
        params.vertical_align = Some(TextVerticalAlign::Middle);
        let middle_y = do_layout(params.clone()).groups[0].offset_y;
        params.vertical_align = Some(TextVerticalAlign::Bottom);
        let bottom_y = do_layout(params).groups[0].offset_y;
        assert_eq!(middle_y - top_y, (bottom_y - top_y) / 2.0);
    }

    #[test]
    fn measure_callback_can_reenter_layout_without_shared_scratch() {
        let entered = std::sync::Arc::new(AtomicBool::new(false));
        let callback_entered = entered.clone();
        let mut params = single_range_params("outer", 100.0);
        params.measure = std::sync::Arc::new(move |text, _| {
            if !callback_entered.swap(true, Ordering::SeqCst) {
                let inner = do_layout(single_range_params("inner", 100.0));
                assert_eq!(inner.num_lines, 1);
            }
            return text.encode_utf16().count() as f32 * 10.0;
        });
        let result = do_layout(params);
        assert!(entered.load(Ordering::SeqCst));
        assert_eq!(result.num_lines, 1);
    }

    #[test]
    fn positions_the_group_at_the_gutter_offset() {
        let result = do_layout(single_range_params("hi", 1000.0));
        assert_eq!(result.groups[0].offset_x, 2.0);
        assert_eq!(result.groups[0].offset_y, 2.0);
    }

    #[test]
    fn preserves_every_character_when_wrapping_across_word_boundaries() {
        let text = "aaa bbb ccc";
        let mut params = single_range_params(text, 60.0);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let placed = placed_ascii_text(text, &do_layout(params));
        assert_eq!(placed.replace(' ', ""), text.replace(' ', ""));
    }

    #[test]
    fn preserves_every_character_when_wrapping_multi_format_text() {
        let text = "aaa bbb ccc";
        let mut params = single_range_params(text, 60.0);
        params.format_ranges = vec![
            range(base_format(), 0, 4),
            range(base_format(), 4, text.len()),
        ];
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let placed = placed_ascii_text(text, &do_layout(params));
        assert_eq!(placed.replace(' ', ""), text.replace(' ', ""));
    }

    #[test]
    fn produces_one_group_for_a_simple_string() {
        let result = do_layout(single_range_params("hello", 1000.0));
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].start_index, 0);
        assert_eq!(result.groups[0].end_index, 5);
        assert_eq!(result.groups[0].line_index, 0);
    }

    #[test]
    fn produces_separate_groups_for_each_format_range() {
        let text = "helloworld";
        let mut large = base_format();
        large.size = Some(24.0);
        let mut params = single_range_params(text, 1000.0);
        params.format_ranges = vec![range(base_format(), 0, 5), range(large, 5, 10)];
        let result = do_layout(params);
        assert!(result.groups.len() >= 2);
        assert_eq!(result.groups[0].format.read().unwrap().size, Some(16.0));
        assert_eq!(result.groups[1].format.read().unwrap().size, Some(24.0));
    }

    #[test]
    fn reports_line_heights_for_each_line() {
        let mut params = single_range_params("ab\ncd", 1000.0);
        params.multiline = Some(true);
        let result = do_layout(params);
        assert_eq!(result.line_heights.len(), 2);
        assert!(result.line_heights.iter().all(|height| *height > 0.0));
    }

    #[test]
    fn reports_line_widths_for_each_line() {
        let mut params = single_range_params("ab\ncd", 1000.0);
        params.multiline = Some(true);
        assert_eq!(do_layout(params).line_widths.len(), 2);
    }

    #[test]
    fn reports_num_lines_as_1() {
        assert_eq!(do_layout(single_range_params("hello", 1000.0)).num_lines, 1);
    }

    #[test]
    fn reports_text_height_greater_than_0_for_non_empty_text() {
        assert!(do_layout(single_range_params("hello", 1000.0)).text_height > 0.0);
    }

    #[test]
    fn reports_text_width_greater_than_0_for_non_empty_text() {
        assert!(do_layout(single_range_params("hello", 1000.0)).text_width > 0.0);
    }

    #[test]
    fn returns_an_empty_result_for_empty_text() {
        let result = do_layout(single_range_params("", 1000.0));
        assert!(result.groups.is_empty());
        assert_eq!(result.num_lines, 1);
    }

    #[test]
    fn returns_an_empty_result_when_format_ranges_are_empty() {
        let mut params = single_range_params("hello", 200.0);
        params.format_ranges.clear();
        assert!(do_layout(params).groups.is_empty());
    }

    #[test]
    fn returns_groups_and_line_metrics_for_simple_text() {
        let result = do_layout(single_range_params("hi", 1000.0));
        assert!(!result.groups.is_empty());
        assert!(result.num_lines > 0);
    }

    #[test]
    fn sets_width_to_the_sum_of_character_advances() {
        let result = do_layout(single_range_params("abc", 1000.0));
        assert_eq!(result.groups[0].width, 30.0);
    }

    #[test]
    fn shifts_group_offset_x_to_center_within_container() {
        let unaligned = do_layout(single_range_params("hi", 100.0)).groups[0].offset_x;
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Center);
        let aligned = do_layout(params_with_format("hi", 100.0, format)).groups[0].offset_x;
        assert!(aligned > unaligned);
    }

    #[test]
    fn shifts_group_offset_x_to_right_align_within_container() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Right);
        assert!(do_layout(params_with_format("hi", 100.0, format)).groups[0].offset_x > 2.0);
    }

    #[test]
    fn shifts_group_offsets_for_justified_mid_lines() {
        let text = "a b\nc d";
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Justify);
        let mut params = params_with_format(text, 100.0, format);
        params.height = 200.0;
        params.multiline = Some(true);
        let result = do_layout(params);
        assert_eq!(result.num_lines, 2);
        assert!(result.groups.iter().any(|group| group.line_index == 0));
    }

    #[test]
    fn shifts_the_block_down_for_middle_and_further_for_bottom() {
        let mut params = single_range_params("hi", 100.0);
        params.height = 200.0;
        let top_y = do_layout(params.clone()).groups[0].offset_y;
        params.vertical_align = Some(TextVerticalAlign::Middle);
        let middle_y = do_layout(params.clone()).groups[0].offset_y;
        params.vertical_align = Some(TextVerticalAlign::Bottom);
        let bottom_y = do_layout(params).groups[0].offset_y;
        assert!(middle_y > top_y);
        assert!(bottom_y > middle_y);
    }

    #[test]
    fn shifts_the_bottom_block_by_the_full_vertical_slack() {
        let mut params = single_range_params("hi", 100.0);
        params.height = 200.0;
        let top = do_layout(params.clone());
        params.vertical_align = Some(TextVerticalAlign::Bottom);
        let bottom = do_layout(params);
        let slack = 200.0 - (top.text_height + TEXT_LAYOUT_GUTTER * 2.0);
        assert_eq!(bottom.groups[0].offset_y - top.groups[0].offset_y, slack);
    }

    #[test]
    fn skips_pair_measurement_when_kerning_is_false() {
        let mut enabled = base_format();
        enabled.kerning = Some(true);
        let mut disabled = base_format();
        disabled.kerning = Some(false);
        let with = do_layout(params_with_format("ab", 1000.0, enabled));
        let without = do_layout(params_with_format("ab", 1000.0, disabled));
        assert_eq!(with.groups[0].positions.len(), 2);
        assert_eq!(without.groups[0].positions.len(), 2);
    }

    #[test]
    fn splits_on_cr_as_well() {
        let mut params = single_range_params("ab\rcd", 1000.0);
        params.multiline = Some(true);
        assert_eq!(do_layout(params).num_lines, 2);
    }

    #[test]
    fn splits_on_lf_when_multiline_is_true() {
        let mut params = single_range_params("ab\ncd", 1000.0);
        params.multiline = Some(true);
        let result = do_layout(params);
        assert!(result.groups.iter().any(|group| group.line_index == 0));
        assert!(result.groups.iter().any(|group| group.line_index == 1));
        assert_eq!(result.num_lines, 2);
    }

    #[test]
    fn stores_per_character_positions() {
        assert_eq!(
            do_layout(single_range_params("ab", 1000.0)).groups[0]
                .positions
                .len(),
            2
        );
    }

    #[test]
    fn treats_end_as_right_in_ltr_direction() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::End);
        let mut params = params_with_format("hi", 100.0, format);
        params.direction = Some(TextDirection::LeftToRight);
        assert!(do_layout(params).groups[0].offset_x > TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn treats_start_as_left_in_ltr_direction() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Start);
        let mut params = params_with_format("hi", 100.0, format);
        params.direction = Some(TextDirection::LeftToRight);
        assert_eq!(do_layout(params).groups[0].offset_x, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn treats_start_as_right_in_rtl_direction() {
        let mut format = base_format();
        format.align = Some(TextFormatAlign::Start);
        let mut params = params_with_format("hi", 100.0, format);
        params.direction = Some(TextDirection::RightToLeft);
        assert!(do_layout(params).groups[0].offset_x > TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn truncates_a_single_long_word_across_both_truncation_paths() {
        let text = "go abcdefghijklmnopqrstuvwxyz";
        let mut params = single_range_params(text, 60.0);
        params.height = 200.0;
        params.max_lines = Some(2);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params.clone());
        assert!(result.num_lines <= 2);
        assert!(
            result
                .groups
                .iter()
                .any(|group| group.line_index == result.num_lines - 1)
        );
        assert!(is_text_layout_truncated(&result, &params));
    }

    #[test]
    fn wraps_at_word_boundary_when_line_exceeds_width() {
        let mut params = single_range_params("hello world", 50.0);
        params.multiline = Some(true);
        params.word_wrap = Some(true);
        let result = do_layout(params);
        assert!(
            result
                .groups
                .iter()
                .map(|group| group.line_index)
                .max()
                .unwrap()
                >= 1
        );
    }
}

mod create_text_layout_result {
    use super::*;

    #[test]
    fn returns_a_new_object_each_call() {
        let first = create_text_layout_result();
        let second = create_text_layout_result();
        assert!(!std::ptr::eq(&first, &second));
    }

    #[test]
    fn returns_default_zero_values() {
        let result = create_text_layout_result();
        assert!(result.groups.is_empty());
        assert!(result.line_ascents.is_empty());
        assert!(result.line_descents.is_empty());
        assert!(result.line_heights.is_empty());
        assert!(result.line_leadings.is_empty());
        assert!(result.line_widths.is_empty());
        assert_eq!(result.num_lines, 0);
        assert_eq!(result.text_height, 0.0);
        assert_eq!(result.text_width, 0.0);
    }
}

mod initialize_text_layout_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_layout_result() {
        let mut out = create_text_layout_result();
        out.line_widths.push(1.0);
        out.num_lines = 2;
        initialize_text_layout_result(&mut out);
        assert!(out.line_widths.is_empty());
        assert_eq!(out.num_lines, 0);
    }
}

mod is_text_layout_truncated {
    use super::*;

    #[test]
    fn returns_false_when_max_lines_is_minus_1() {
        let mut params = single_range_params("hello", 1000.0);
        params.max_lines = Some(-1);
        let result = do_layout(params.clone());
        assert!(!is_text_layout_truncated(&result, &params));
    }

    #[test]
    fn returns_false_when_max_lines_is_unlimited() {
        let params = single_range_params("one line", 1000.0);
        let result = do_layout(params.clone());
        assert!(!is_text_layout_truncated(&result, &params));
    }

    #[test]
    fn returns_true_when_max_lines_clips_the_layout() {
        let text = "line one\nline two\nline three";
        let mut params = single_range_params(text, 300.0);
        params.height = 200.0;
        params.max_lines = Some(2);
        params.multiline = Some(true);
        let result = do_layout(params.clone());
        assert!(is_text_layout_truncated(&result, &params));
    }
}

mod text_layout_gutter {
    use super::*;

    #[test]
    fn is_a_positive_number() {
        assert!(std::hint::black_box(TEXT_LAYOUT_GUTTER) > 0.0);
    }
}
