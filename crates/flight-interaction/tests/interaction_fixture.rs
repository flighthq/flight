#![allow(dead_code)]

use std::sync::{Arc, RwLock};

use flight_node::{NodeRef, add_node_child};
use flight_scene2d::create_display_object;

use flight_interaction::contract::register_default_hit_tests;
use flight_interaction::contract::{
    InteractionManager, InteractionSignals, create_interaction_manager_options,
};
use flight_interaction::contract::{create_interaction_manager, enable_interaction_signals};
use flight_interaction::contract::{
    enable_node_interaction_state, set_node_focusable, set_node_hit_test_enabled,
    set_node_tab_index,
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

// Most tests drive a manager they own outright, so the fixture takes the single shared handle the
// factory returns apart; tests of the shared handle itself call the factory directly.
pub fn manager_for(root: &NodeRef) -> InteractionManager {
    let manager =
        create_interaction_manager(root.clone(), Some(&create_interaction_manager_options()));
    return std::sync::Arc::try_unwrap(manager)
        .ok()
        .expect("a fresh manager has one handle")
        .into_inner()
        .unwrap();
}

pub fn manager_with_hit_tests(root: &NodeRef) -> InteractionManager {
    let mut mgr = manager_for(root);
    register_default_hit_tests(&mut mgr.hit_test_ctx);
    return mgr;
}

pub fn signals_for(node: &NodeRef) -> Arc<RwLock<InteractionSignals>> {
    return enable_interaction_signals(node);
}

pub fn empty_document_fields() -> flight_scene_document::FlightDocumentFields {
    return Default::default();
}
