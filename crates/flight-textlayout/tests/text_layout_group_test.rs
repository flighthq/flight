use std::sync::Arc;

use crate::common::{empty_text_format, format_ref};
use flight_textlayout::contract::*;

mod create_text_layout_group {
    use super::*;

    #[test]
    fn initializes_with_zero_metrics() {
        let group = create_text_layout_group(format_ref(empty_text_format()));
        assert_eq!((group.start_index, group.end_index), (0, 0));
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
        let first = create_text_layout_group(format.clone());
        let mut second = create_text_layout_group(format);
        second.width = 1.0;
        assert_eq!(first.width, 0.0);
        assert_eq!(second.width, 1.0);
    }

    #[test]
    fn retains_the_required_format_and_accepts_assigned_indices_without_replacing_identity() {
        let format = format_ref(empty_text_format());
        let mut group = create_text_layout_group(format.clone());
        group.start_index = 3;
        group.end_index = 10;
        assert!(Arc::ptr_eq(&group.format, &format));
        assert_eq!(group.start_index, 3);
        assert_eq!(group.end_index, 10);
    }
}

mod initialize_text_layout_group {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_layout_group() {
        let second = format_ref(empty_text_format());
        let mut out = create_text_layout_group(format_ref(empty_text_format()));
        out.positions.push(3.0);
        initialize_text_layout_group(&mut out, second.clone());
        assert_eq!((out.start_index, out.end_index), (0, 0));
        out.start_index = 4;
        out.end_index = 9;
        assert_eq!((out.start_index, out.end_index), (4, 9));
        assert!(Arc::ptr_eq(&out.format, &second));
        assert!(out.positions.is_empty());
    }
}
