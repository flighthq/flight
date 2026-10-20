use flight_textbidi::*;

mod reorder_bidi_line_test {
    use super::*;

    #[test]
    fn reverses_a_pure_rtl_run_to_visual_order() {
        let levels: Vec<u8> = vec![1, 1, 1];
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 0, 3, &mut out);
        assert_eq!(out, vec![2, 1, 0]);
    }

    #[test]
    fn leaves_a_pure_ltr_line_in_logical_order() {
        let levels: Vec<u8> = vec![0, 0, 0, 0];
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 0, 4, &mut out);
        assert_eq!(out, vec![0, 1, 2, 3]);
    }

    #[test]
    fn reorders_only_the_rtl_run_of_a_mixed_line() {
        let levels: Vec<u8> = vec![0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 0, levels.len(), &mut out);
        assert_eq!(out, vec![0, 1, 2, 3, 4, 5, 9, 8, 7, 6, 10, 11, 12, 13, 14, 15]);
    }

    #[test]
    fn reorders_numbers_nested_in_rtl_text_correctly() {
        let levels: Vec<u8> = vec![1, 1, 1, 1, 1, 2, 2, 2];
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 0, 8, &mut out);
        assert_eq!(out, vec![5, 6, 7, 4, 3, 2, 1, 0]);
    }

    #[test]
    fn writes_into_a_distinct_out_array_and_can_reuse_one_across_calls() {
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&[1, 1], 0, 2, &mut out);
        assert_eq!(out, vec![1, 0]);
        reorder_bidi_line(&[0], 0, 1, &mut out);
        assert_eq!(out, vec![0]);
    }

    #[test]
    fn reorders_a_sub_range_within_a_larger_level_buffer() {
        let levels: Vec<u8> = vec![0, 1, 1, 1, 0];
        let mut out: Vec<usize> = Vec::new();
        reorder_bidi_line(&levels, 1, 4, &mut out);
        assert_eq!(out, vec![3, 2, 1]);
    }
}
