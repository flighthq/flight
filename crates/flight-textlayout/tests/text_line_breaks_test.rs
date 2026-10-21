use flight_textlayout::contract::*;

mod get_text_line_break_index {
    use super::*;

    #[test]
    fn correctly_finds_the_first_break_in_a_large_sorted_array() {
        let breaks: Vec<usize> = (0..100).map(|index| index * 10).collect();
        assert_eq!(get_text_line_break_index(&breaks, Some(55)), 60);
        assert_eq!(get_text_line_break_index(&breaks, Some(60)), 60);
        assert_eq!(get_text_line_break_index(&breaks, Some(0)), 0);
        assert_eq!(get_text_line_break_index(&breaks, Some(999)), -1);
    }

    #[test]
    fn returns_an_exact_match_when_start_index_equals_a_break() {
        assert_eq!(get_text_line_break_index(&[3, 7, 12], Some(7)), 7);
    }

    #[test]
    fn returns_minus_one_for_empty_break_list() {
        assert_eq!(get_text_line_break_index(&[], Some(0)), -1);
    }

    #[test]
    fn returns_minus_one_when_no_break_is_at_or_after_start_index() {
        assert_eq!(get_text_line_break_index(&[3, 7], Some(10)), -1);
    }

    #[test]
    fn returns_the_first_break_at_or_after_start_index() {
        assert_eq!(get_text_line_break_index(&[3, 7, 12], Some(5)), 7);
    }

    #[test]
    fn returns_the_first_break_when_start_index_is_0() {
        assert_eq!(get_text_line_break_index(&[3, 7], None), 3);
    }

    #[test]
    fn works_correctly_with_a_single_element_array() {
        assert_eq!(get_text_line_break_index(&[5], Some(3)), 5);
        assert_eq!(get_text_line_break_index(&[5], Some(5)), 5);
        assert_eq!(get_text_line_break_index(&[5], Some(6)), -1);
    }
}

mod get_text_line_breaks {
    use super::*;

    #[test]
    fn finds_cr_positions() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "a\rb\rc");
        assert_eq!(out, vec![1, 3]);
    }

    #[test]
    fn finds_lf_positions() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "a\nb\nc");
        assert_eq!(out, vec![1, 3]);
    }

    #[test]
    fn handles_trailing_newline() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "ab\n");
        assert_eq!(out, vec![2]);
    }

    #[test]
    fn prefers_the_earlier_of_cr_and_lf_when_both_are_present() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "a\nb\rc");
        assert_eq!(out, vec![1, 3]);
        get_text_line_breaks(&mut out, "a\rb\nc");
        assert_eq!(out, vec![1, 3]);
    }

    #[test]
    fn returns_empty_array_for_empty_text() {
        let mut out = vec![1];
        get_text_line_breaks(&mut out, "");
        assert!(out.is_empty());
    }

    #[test]
    fn returns_empty_array_for_text_with_no_line_breaks() {
        let mut out = vec![1];
        get_text_line_breaks(&mut out, "hello world");
        assert!(out.is_empty());
    }
}
