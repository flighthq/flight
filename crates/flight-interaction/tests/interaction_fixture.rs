#![allow(dead_code)]

use std::sync::{Arc, RwLock};

use flight_node::contract::NodeRevisionState;
use flight_node::{add_node_child, NodeRef};
use flight_scene2d::create_display_object;

use flight_interaction::interaction_manager::{
    create_interaction_manager, enable_interaction_signals,
};
use flight_interaction::node_interaction_state::{
    enable_node_interaction_state, set_node_focusable, set_node_hit_test_enabled,
    set_node_tab_index,
};
use flight_interaction::register_default_hit_tests::register_default_hit_tests;
use flight_interaction::types::{
    InteractionManager, InteractionSignals, create_interaction_manager_options,
};

pub fn node() -> NodeRef {
    return create_display_object();
}

pub fn sprite_node() -> NodeRef {
    return create_display_object();
}

pub fn interactive_node() -> NodeRef {
    let n = node();
    enable_node_interaction_state(&n);
    set_node_hit_test_enabled(&n, true);
    return n;
}

pub fn focusable_node(tab_index: i32) -> NodeRef {
    let n = interactive_node();
    set_node_focusable(&n, true);
    set_node_tab_index(&n, tab_index);
    return n;
}

pub fn tree_with_children(count: usize) -> (NodeRef, Vec<NodeRef>) {
    let root = node();
    let mut children = Vec::new();
    for _ in 0..count {
        let child = interactive_node();
        add_node_child(&root, &child);
        children.push(child);
    }
    return (root, children);
}

pub fn manager_for(root: &NodeRef) -> InteractionManager {
    return create_interaction_manager(root.clone(), &create_interaction_manager_options());
}

pub fn manager_with_hit_tests(root: &NodeRef) -> InteractionManager {
    let mut mgr = manager_for(root);
    register_default_hit_tests(&mut mgr.hit_test_ctx);
    return mgr;
}

pub fn signals_for(node: &NodeRef) -> Arc<RwLock<InteractionSignals>> {
    return enable_interaction_signals(node);
}

pub fn revisions() -> NodeRevisionState {
    return NodeRevisionState {
        world_transform_revision: 0,
    };
}

pub fn empty_document_fields() -> flight_scene_document::FlightDocumentFields {
    return Default::default();
}
