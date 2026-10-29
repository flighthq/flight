//! flight-compiler: target-native
//! flight-compiler: contract LassoSelection MarqueeSelection MarqueeSelectionMode SelectionModifierState
//! flight-compiler: contract SelectionSignals SelectionState addNodeToSelection applyPointerSelectionPolicy
//! flight-compiler: contract applyPointerUpSelectionPolicy clearSelection createSelectionState
//! flight-compiler: contract addLassoSelectionPoint beginLassoSelection createLassoSelection
//! flight-compiler: contract endLassoSelection getLassoSelectionPath initializeLassoSelection
//! flight-compiler: contract beginMarqueeSelection createMarqueeSelection endMarqueeSelection getMarqueeRectangle
//! flight-compiler: contract findNodesInLassoSelection findNodesInMarqueeSelection getActiveNode
//! flight-compiler: contract getSelectedNodes getSelectionCount getSelectionSignals hasSelection
//! flight-compiler: contract isNodeSelected removeNodeFromSelection selectAllNodes selectNode toggleNodeSelection
//! flight-compiler: contract updateMarqueeSelection

use flight_geometry::Rectangle;
use flight_node::NodeRef;
use flight_path::Path;
use flight_signals::{Signal, create_signal};

use crate::lasso_selection::{
    add_lasso_selection_point_core, begin_lasso_selection_core, create_lasso_selection_core,
    end_lasso_selection_core, find_nodes_in_lasso_selection_into, get_lasso_selection_path_core,
    initialize_lasso_selection_core,
};
use crate::marquee_selection::{
    begin_marquee_selection_core, create_marquee_selection_core, end_marquee_selection_core,
    find_nodes_in_marquee_selection_into, get_marquee_rectangle_core,
    initialize_marquee_selection_core, update_marquee_selection_core,
};
use crate::pointer_selection_policy::{
    apply_pointer_selection_policy_core, apply_pointer_up_selection_policy_core,
};
use crate::selection_state::{
    add_node_to_selection_core, clear_selection_core, create_selection_state_core,
    get_active_node_core, get_selected_nodes_core, get_selection_count_core,
    get_selection_signals_core, has_selection_core, initialize_selection_state_core,
    is_node_selected_core, remove_node_from_selection_core, select_all_nodes_core,
    select_node_core, toggle_node_selection_core,
};
use crate::types::{
    LassoSelection as LassoSelectionRaw, MarqueeSelection as MarqueeSelectionRaw,
    MarqueeSelectionModeRaw, SelectionModifierStateRaw, SelectionState as SelectionStateRaw,
};

pub type LassoSelection = LassoSelectionRaw;
pub type MarqueeSelection = MarqueeSelectionRaw;
pub type MarqueeSelectionMode = MarqueeSelectionModeRaw;
pub type SelectionModifierState = SelectionModifierStateRaw;
pub type SelectionState = SelectionStateRaw;

/// The two signals exposed by an ordered selection state.
#[derive(Clone)]
pub struct SelectionSignals {
    pub on_active_change: Signal<Option<NodeRef>>,
    pub on_change: Signal<Vec<NodeRef>>,
}

impl Default for SelectionSignals {
    fn default() -> Self {
        return SelectionSignals {
            on_active_change: create_signal(),
            on_change: create_signal(),
        };
    }
}

pub fn create_lasso_selection() -> LassoSelection {
    return create_lasso_selection_core();
}

pub fn initialize_lasso_selection(out: &mut LassoSelection) {
    initialize_lasso_selection_core(out);
}

pub fn add_lasso_selection_point(selection: &mut LassoSelection, x: f64, y: f64) {
    add_lasso_selection_point_core(selection, x, y);
}

pub fn begin_lasso_selection(selection: &mut LassoSelection, start_x: f64, start_y: f64) {
    begin_lasso_selection_core(selection, start_x, start_y);
}

pub fn end_lasso_selection(selection: &mut LassoSelection) -> &Path {
    return end_lasso_selection_core(selection);
}

pub fn get_lasso_selection_path(selection: &LassoSelection) -> &Path {
    return get_lasso_selection_path_core(selection);
}

pub fn find_nodes_in_lasso_selection(
    out: &mut Vec<NodeRef>,
    selection: &LassoSelection,
    candidates: &[NodeRef],
) {
    find_nodes_in_lasso_selection_into(out, selection, candidates);
}

pub fn find_nodes_in_marquee_selection(
    out: &mut Vec<NodeRef>,
    selection: &MarqueeSelection,
    candidates: &[NodeRef],
    mode: Option<MarqueeSelectionMode>,
) {
    find_nodes_in_marquee_selection_into(out, selection, candidates, mode);
}

pub fn create_marquee_selection() -> MarqueeSelection {
    return create_marquee_selection_core();
}

pub fn initialize_marquee_selection(out: &mut MarqueeSelection) {
    initialize_marquee_selection_core(out);
}

pub fn begin_marquee_selection(selection: &mut MarqueeSelection, start_x: f32, start_y: f32) {
    begin_marquee_selection_core(selection, start_x, start_y);
}

pub fn end_marquee_selection(selection: &mut MarqueeSelection) -> &Rectangle {
    return end_marquee_selection_core(selection);
}

pub fn get_marquee_rectangle(selection: &MarqueeSelection) -> &Rectangle {
    return get_marquee_rectangle_core(selection);
}

pub fn update_marquee_selection(selection: &mut MarqueeSelection, current_x: f32, current_y: f32) {
    update_marquee_selection_core(selection, current_x, current_y);
}

pub fn create_selection_state() -> SelectionState {
    return create_selection_state_core();
}

pub fn initialize_selection_state(out: &mut SelectionState) {
    initialize_selection_state_core(out);
}

pub fn add_node_to_selection(state: &SelectionState, node: &NodeRef) {
    add_node_to_selection_core(state, node);
}

pub fn clear_selection(state: &SelectionState) {
    clear_selection_core(state);
}

pub fn get_active_node(state: &SelectionState) -> Option<NodeRef> {
    return get_active_node_core(state);
}

pub fn get_selected_nodes(out: &mut Vec<NodeRef>, state: &SelectionState) {
    get_selected_nodes_core(out, state);
}

pub fn get_selection_count(state: &SelectionState) -> usize {
    return get_selection_count_core(state);
}

pub fn get_selection_signals(state: &SelectionState) -> SelectionSignals {
    return get_selection_signals_core(state);
}

pub fn has_selection(state: &SelectionState) -> bool {
    return has_selection_core(state);
}

pub fn is_node_selected(state: &SelectionState, node: &NodeRef) -> bool {
    return is_node_selected_core(state, node);
}

pub fn remove_node_from_selection(state: &SelectionState, node: &NodeRef) {
    remove_node_from_selection_core(state, node);
}

pub fn select_all_nodes(state: &SelectionState, candidates: &[NodeRef]) {
    select_all_nodes_core(state, candidates);
}

pub fn select_node(state: &SelectionState, node: &NodeRef) {
    select_node_core(state, node);
}

pub fn toggle_node_selection(state: &SelectionState, node: &NodeRef) {
    toggle_node_selection_core(state, node);
}

pub fn apply_pointer_selection_policy(
    state: &SelectionState,
    hit: Option<&NodeRef>,
    modifiers: &SelectionModifierState,
) {
    apply_pointer_selection_policy_core(state, hit, modifiers);
}

pub fn apply_pointer_up_selection_policy(
    state: &SelectionState,
    hit: Option<&NodeRef>,
    modifiers: &SelectionModifierState,
    did_drag: bool,
) {
    apply_pointer_up_selection_policy_core(state, hit, modifiers, did_drag);
}
