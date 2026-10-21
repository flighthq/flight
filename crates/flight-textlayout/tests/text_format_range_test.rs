use std::sync::Arc;

use crate::common::{empty_text_format, format_ref};
use flight_textlayout::contract::*;

mod create_text_format_range {
    use super::*;

    #[test]
    fn creates_a_range_with_the_given_fields() {
        let mut value = empty_text_format();
        value.size = Some(16.0);
        value.bold = Some(true);
        let format = format_ref(value);
        let range = create_text_format_range(format.clone(), 0, 10);
        assert_eq!((range.start, range.end), (0, 10));
        assert!(Arc::ptr_eq(&range.format, &format));
    }
}

mod initialize_text_format_range {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_format_range() {
        let format = format_ref(empty_text_format());
        let mut out = create_text_format_range(format.clone(), 0, 0);
        initialize_text_format_range(&mut out, format.clone(), 2, 7);
        assert_eq!((out.start, out.end), (2, 7));
        assert!(Arc::ptr_eq(&out.format, &format));
    }
}
