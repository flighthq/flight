use crate::common::empty_text_format;
use flight_textlayout::contract::*;

mod get_text_format_ascent {
    use super::*;

    #[test]
    fn returns_12_when_size_is_absent() {
        assert_eq!(get_text_format_ascent(&empty_text_format()), 12.0);
    }

    #[test]
    fn returns_size_when_specified() {
        let mut format = empty_text_format();
        format.size = Some(24.0);
        assert_eq!(get_text_format_ascent(&format), 24.0);
    }
}

mod get_text_format_descent {
    use super::*;

    #[test]
    fn returns_18_5_percent_of_size() {
        let mut format = empty_text_format();
        format.size = Some(100.0);
        assert_eq!(get_text_format_descent(&format), 18.5);
    }

    #[test]
    fn uses_default_size_of_12_when_absent() {
        assert_eq!(get_text_format_descent(&empty_text_format()), 12.0 * 0.185);
    }
}

mod get_text_format_height {
    use super::*;

    #[test]
    fn sums_ascent_descent_and_leading() {
        let mut format = empty_text_format();
        format.size = Some(10.0);
        format.leading = Some(4.0);
        assert_eq!(get_text_format_height(&format), 10.0 + 10.0 * 0.185 + 4.0);
    }

    #[test]
    fn treats_absent_leading_as_zero() {
        let mut format = empty_text_format();
        format.size = Some(10.0);
        assert_eq!(get_text_format_height(&format), 10.0 + 10.0 * 0.185);
    }
}

mod get_text_format_leading {
    use super::*;

    #[test]
    fn returns_0_when_absent() {
        assert_eq!(get_text_format_leading(&empty_text_format()), 0.0);
    }

    #[test]
    fn returns_leading_when_specified() {
        let mut format = empty_text_format();
        format.leading = Some(6.0);
        assert_eq!(get_text_format_leading(&format), 6.0);
    }
}

mod merge_text_format {
    use super::*;

    #[test]
    fn applies_non_null_override_fields_onto_base() {
        let mut base = empty_text_format();
        base.size = Some(12.0);
        base.bold = Some(false);
        let mut overrides = empty_text_format();
        overrides.bold = Some(true);
        overrides.color = Some(0xff0000ff);
        let result = merge_text_format(&base, &overrides);
        assert_eq!(result.size, Some(12.0));
        assert_eq!(result.bold, Some(true));
        assert_eq!(result.color, Some(0xff0000ff));
    }

    #[test]
    fn does_not_mutate_the_base_object() {
        let mut base = empty_text_format();
        base.size = Some(12.0);
        let mut overrides = empty_text_format();
        overrides.size = Some(24.0);
        let _ = merge_text_format(&base, &overrides);
        assert_eq!(base.size, Some(12.0));
    }

    #[test]
    fn skips_absent_override_fields() {
        let mut base = empty_text_format();
        base.size = Some(12.0);
        let result = merge_text_format(&base, &empty_text_format());
        assert_eq!(result.size, Some(12.0));
        assert_eq!(result.bold, None);
    }
}
