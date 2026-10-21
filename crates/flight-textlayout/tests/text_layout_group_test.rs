use std::sync::Arc;

use crate::common::{empty_text_format, format_ref};
use flight_textlayout::contract::*;

mod create_text_layout_group {
    use super::*;

    #[test]
    fn initializes_with_zero_metrics() {
        let group = create_text_layout_group(format_ref(empty_text_format()), 0, 5);
        assert_eq!(group.ascent, 0.0);
        assert_eq!(group.descent, 0.0);
        assert_eq!(group.height, 0.0);
        assert_eq!(group.leading, 0.0);
        assert_eq!(group.line_index, 0);
        assert_eq!(group.offset_x, 0.0);
        assert_eq!(group.offset_y, 0.0);
        assert_eq!(group.width, 0.0);
        assert!(group.positions.is_empty());
    }

    #[test]
    fn returns_a_new_object_each_call() {
        let format = format_ref(empty_text_format());
        let first = create_text_layout_group(format.clone(), 0, 1);
        let second = create_text_layout_group(format, 0, 1);
        assert!(!std::ptr::eq(&first, &second));
    }

    #[test]
    fn stores_the_provided_format_start_index_and_end_index() {
        let format = format_ref(empty_text_format());
        let group = create_text_layout_group(format.clone(), 3, 10);
        assert!(Arc::ptr_eq(&group.format, &format));
        assert_eq!(group.start_index, 3);
        assert_eq!(group.end_index, 10);
    }
}

mod initialize_text_layout_group {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_layout_group() {
        let first = format_ref(empty_text_format());
        let second = format_ref(empty_text_format());
        let mut out = create_text_layout_group(first, 0, 0);
        out.positions.push(3.0);
        initialize_text_layout_group(&mut out, second.clone(), 4, 9);
        assert_eq!((out.start_index, out.end_index), (4, 9));
        assert!(Arc::ptr_eq(&out.format, &second));
        assert!(out.positions.is_empty());
    }
}
