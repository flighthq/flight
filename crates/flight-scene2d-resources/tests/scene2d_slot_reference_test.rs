use std::sync::Arc;

use flight_node::{NodeRef, add_node_child, get_node_child_at, get_node_parent};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_resources::contract::*;

mod set_scene2d_slot_reference_content {
    use super::*;

    #[test]
    fn keeps_child_order_stable_when_a_pass_retains_the_same_content() {
        let target = create_display_object(None);
        let content = create_display_object(None);
        let overlay = create_display_object(None);
        let reference = create_scene2d_slot_reference();
        reference.write().unwrap().target = target.clone();
        set_scene2d_slot_reference_content(&mut reference.write().unwrap(), Some(content.clone()));
        let target_node: NodeRef = target;
        let overlay_node: NodeRef = overlay.clone();
        add_node_child(&target_node, &overlay_node);
        set_scene2d_slot_reference_content(&mut reference.write().unwrap(), Some(content.clone()));
        let content_node: NodeRef = content;
        assert!(Arc::ptr_eq(
            &get_node_child_at(&target_node, 0).unwrap(),
            &content_node
        ));
        assert!(Arc::ptr_eq(
            &get_node_child_at(&target_node, 1).unwrap(),
            &overlay_node
        ));
    }

    #[test]
    fn replaces_only_the_content_retained_by_the_manifest_reference() {
        let target = create_display_object(None);
        let authored = create_display_object(None);
        let first = create_display_object(None);
        let second: Node2DRef = create_display_object(None);
        let target_node: NodeRef = target.clone();
        let authored_node: NodeRef = authored.clone();
        add_node_child(&target_node, &authored_node);
        let reference = create_scene2d_slot_reference();
        reference.write().unwrap().target = target;
        set_scene2d_slot_reference_content(&mut reference.write().unwrap(), Some(first.clone()));
        set_scene2d_slot_reference_content(&mut reference.write().unwrap(), Some(second.clone()));
        assert!(Arc::ptr_eq(
            reference.read().unwrap().content.as_ref().unwrap(),
            &second
        ));
        assert!(Arc::ptr_eq(
            &get_node_parent(&authored_node).unwrap(),
            &target_node
        ));
        let first_node: NodeRef = first;
        let second_node: NodeRef = second;
        assert!(get_node_parent(&first_node).is_none());
        assert!(Arc::ptr_eq(
            &get_node_parent(&second_node).unwrap(),
            &target_node
        ));
    }
}
