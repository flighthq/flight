use super::*;
use std::ffi::{CStr, CString};

#[test]
fn node_carriers_preserve_identity_hierarchy_and_free_order() {
    unsafe {
        let parent = flight_create_display_object();
        let sprite = flight_create_sprite();
        let shape = flight_create_shape();
        let bitmap_text = flight_create_bitmap_text(std::ptr::null());
        let text_label = flight_create_text_label(std::ptr::null());
        assert!(!parent.is_null());
        assert!(!sprite.is_null());
        assert!(!shape.is_null());
        assert!(!bitmap_text.is_null());
        assert!(!text_label.is_null());

        let input = flight_node_array_create();
        for node in [sprite, shape, bitmap_text, text_label] {
            assert!(flight_node_array_push(input, node));
        }
        flight_add_node_children(parent, input);
        flight_free_node_array(input);
        assert_eq!(flight_get_node_child_count(parent), 4);

        let output = flight_node_array_create();
        flight_get_node_children(output, parent);
        assert_eq!(flight_node_array_len(output), 4);
        let first = flight_node_array_get(output, 0);
        assert!(flight_node_equals(first, sprite));
        assert!(!flight_node_equals(first, shape));
        flight_free_node(first);

        flight_set_node_child_index(parent, text_label, 0);
        flight_node_array_clear(output);
        flight_get_node_children(output, parent);
        let reordered = flight_node_array_get(output, 0);
        assert!(flight_node_equals(reordered, text_label));
        flight_free_node(reordered);

        let removed = flight_remove_node_child(parent, shape);
        assert!(flight_node_equals(removed, shape));
        assert_eq!(flight_get_node_child_count(parent), 3);
        flight_free_node(removed);

        flight_free_node_array(output);
        flight_free_node(parent);
        flight_free_node(sprite);
        flight_free_node(shape);
        flight_free_node(bitmap_text);
        flight_free_node(text_label);
        flight_free_node(std::ptr::null_mut());
        assert!(!flight_node_equals(std::ptr::null(), std::ptr::null()));
    }
}

#[test]
fn node_field_mutation_is_locked_explicit_and_kind_safe() {
    unsafe {
        let sprite = flight_create_sprite();
        let before = flight_get_node_local_transform_revision(sprite);
        assert_eq!(flight_set_node2_dfields_x(sprite, 12.5), 12.5);
        assert_eq!(flight_get_node2_dfields_x(sprite), 12.5);
        assert_eq!(flight_get_node_local_transform_revision(sprite), before);
        flight_invalidate_node_local_transform(sprite);
        assert_eq!(
            flight_get_node_local_transform_revision(sprite),
            before.wrapping_add(1)
        );

        let name = CString::new("sprite-name").unwrap();
        assert!(flight_set_node_fields_name(sprite, name.as_ptr()));
        let copied_name = flight_get_node_fields_name(sprite);
        assert!(!copied_name.is_null());
        assert_eq!(CStr::from_ptr(copied_name).to_bytes(), b"sprite-name");
        flight_free_string(copied_name);
        assert!(flight_set_node_fields_name(sprite, std::ptr::null()));
        assert!(flight_get_node_fields_name(sprite).is_null());

        let kind = CString::new("ffi-test-kind").unwrap();
        assert!(flight_set_node_fields_kind(sprite, kind.as_ptr()));
        let copied_kind = flight_get_node_fields_kind(sprite);
        assert_eq!(CStr::from_ptr(copied_kind).to_bytes(), b"ffi-test-kind");
        flight_free_string(copied_kind);

        assert!(!flight_has_node2_dfields_blend_mode(sprite));
        assert_eq!(flight_get_node2_dfields_blend_mode(sprite), -1);
        assert!(flight_set_node2_dfields_blend_mode(sprite, 5, true));
        assert!(flight_has_node2_dfields_blend_mode(sprite));
        assert_eq!(flight_get_node2_dfields_blend_mode(sprite), 5);
        assert!(!flight_set_node2_dfields_blend_mode(sprite, 99, true));
        assert_eq!(flight_get_node2_dfields_blend_mode(sprite), 5);
        assert!(flight_set_node2_dfields_blend_mode(sprite, 99, false));
        assert!(!flight_has_node2_dfields_blend_mode(sprite));

        assert!(flight_get_text_label_string(sprite).is_null());
        assert_eq!(flight_get_node3_dfields_position_x(sprite), 0.0);
        assert_eq!(flight_set_node3_dfields_position_x(sprite, 7.0), 0.0);
        assert_eq!(flight_get_node2_dfields_x(sprite), 12.5);

        let node3d = flight_create_particle_emitter_3d();
        assert_eq!(flight_set_node3_dfields_position_x(node3d, 7.0), 7.0);
        assert_eq!(flight_get_node3_dfields_position_x(node3d), 7.0);
        assert_eq!(flight_get_node2_dfields_x(node3d), 0.0);
        assert_eq!(flight_set_node2_dfields_x(node3d, 3.0), 0.0);

        flight_free_node(node3d);
        flight_free_node(sprite);
    }
}

#[test]
fn ref_only_struct_accessors_borrow_the_ref_handle() {
    unsafe {
        let clock = flight_create_clock();
        assert!(!clock.is_null());
        assert_eq!(flight_set_clock_elapsed(clock, 4.25), 4.25);
        assert_eq!(flight_get_clock_elapsed(clock), 4.25);
        assert!(flight_get_clock_parent(clock).is_null());
        flight_free_clock_ref(clock);
    }
}
