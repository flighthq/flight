use std::sync::Arc;

use crate::common::{empty_text_format, format_ref};
use flight_entity::{
    allocate_entity, get_entity_id, get_entity_runtime, get_entity_uid, has_entity_runtime,
    set_entity_uid,
};
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
        let second = create_text_layout_group(format);
        assert!(!std::ptr::eq(&first, &second));
        assert_ne!(get_entity_id(&first), get_entity_id(&second));
        assert!(!has_entity_runtime(&first));
        assert!(!has_entity_runtime(&second));
    }

    #[test]
    fn retains_the_required_format_and_accepts_assigned_indices_without_replacing_identity() {
        let format = format_ref(empty_text_format());
        let mut group = create_text_layout_group(format.clone());
        let id = get_entity_id(&group);
        set_entity_uid(&mut group, "layout-group".to_string());
        let runtime = get_entity_runtime(&group).unwrap() as *const _;
        group.start_index = 3;
        group.end_index = 10;
        assert!(Arc::ptr_eq(&group.format, &format));
        assert_eq!(group.start_index, 3);
        assert_eq!(group.end_index, 10);
        assert_eq!(get_entity_id(&group), id);
        assert_eq!(get_entity_uid(&mut group), "layout-group");
        assert_eq!(get_entity_runtime(&group).unwrap() as *const _, runtime);
    }
}

mod initialize_text_layout_group {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_text_layout_group() {
        let second = format_ref(empty_text_format());
        let mut out: TextLayoutGroup = allocate_entity();
        let id = get_entity_id(&out);
        set_entity_uid(&mut out, "preallocated-group".to_string());
        let runtime = get_entity_runtime(&out).unwrap() as *const _;
        out.positions.push(3.0);
        initialize_text_layout_group(&mut out, second.clone());
        assert_eq!((out.start_index, out.end_index), (0, 0));
        out.start_index = 4;
        out.end_index = 9;
        assert_eq!((out.start_index, out.end_index), (4, 9));
        assert!(Arc::ptr_eq(&out.format, &second));
        assert!(out.positions.is_empty());
        assert_eq!(get_entity_id(&out), id);
        assert_eq!(get_entity_uid(&mut out), "preallocated-group");
        assert_eq!(get_entity_runtime(&out).unwrap() as *const _, runtime);
    }
}
