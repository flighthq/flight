use std::sync::Arc;

use flight_node::{NodeRef, add_node_child, get_node_parent, remove_node_child};
use flight_scene2d::{Node2DRef, Scene2DSlotReference};

pub fn set_scene2d_slot_reference_content(
    reference: &mut Scene2DSlotReference,
    content: Option<Node2DRef>,
) {
    let same_content = match (&reference.content, &content) {
        (Some(previous), Some(content)) => Arc::ptr_eq(previous, content),
        (None, None) => true,
        _ => false,
    };
    let target: NodeRef = reference.target.clone();
    let correctly_parented = content
        .as_ref()
        .map(|content| {
            let content: NodeRef = content.clone();
            get_node_parent(&content)
                .map(|parent| Arc::ptr_eq(&parent, &target))
                .unwrap_or(false)
        })
        .unwrap_or(true);
    if same_content && correctly_parented {
        return;
    }
    if let Some(previous) = &reference.content {
        let previous: NodeRef = previous.clone();
        let parent_is_target = get_node_parent(&previous)
            .map(|parent| Arc::ptr_eq(&parent, &target))
            .unwrap_or(false);
        if parent_is_target {
            remove_node_child(&target, &previous);
        }
    }
    reference.content = content.clone();
    if let Some(content) = content {
        let content: NodeRef = content;
        add_node_child(&target, &content);
    }
}
