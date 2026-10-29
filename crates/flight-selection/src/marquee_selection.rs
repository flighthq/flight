use flight_entity::allocate_entity;
use flight_geometry::{Rectangle, create_rectangle, encloses_rectangle, intersects_rectangle};
use flight_node::{NodeRef, get_node_local_bounds_rectangle};

use crate::types::*;

#[cfg(test)]
/// flight-compiler: rust-only — Rust-only extension-method parity tests.
mod sugar_tests {
    use super::*;
    use crate::marquee_mode_native::get_marquee_selection_mode_string;

    #[test]
    fn marquee_selection_begin_matches_begin_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection_core();
        a.begin(4.0, 5.0);
        begin_marquee_selection_core(&mut b, 4.0, 5.0);
        assert_eq!(a.rectangle(), get_marquee_rectangle_core(&b));
    }

    #[test]
    fn marquee_selection_end_matches_end_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection_core();
        a.begin(1.0, 2.0);
        begin_marquee_selection_core(&mut b, 1.0, 2.0);
        let method = a.end().clone();
        let free = end_marquee_selection_core(&mut b).clone();
        assert_eq!(method, free);
    }

    #[test]
    fn marquee_selection_find_nodes_matches_find_nodes_in_marquee_selection() {
        let selection = MarqueeSelection::new();
        let (mut method, mut free) = (Vec::new(), Vec::new());
        selection.find_nodes(&mut method, &[], None);
        find_nodes_in_marquee_selection_into(&mut free, &selection, &[], None);
        assert!(method.is_empty() && free.is_empty());
    }

    #[test]
    fn marquee_selection_mode_as_str_matches_get_marquee_selection_mode_string() {
        let mode = MarqueeSelectionModeRaw::Contain;
        assert_eq!(mode.as_str(), get_marquee_selection_mode_string(mode));
    }

    #[test]
    fn marquee_selection_new_matches_create_marquee_selection() {
        let a = MarqueeSelection::new();
        let b = create_marquee_selection_core();
        assert_eq!(a.rectangle(), get_marquee_rectangle_core(&b));
    }

    #[test]
    fn marquee_selection_rectangle_matches_get_marquee_rectangle() {
        let selection = MarqueeSelection::new();
        assert_eq!(
            selection.rectangle(),
            get_marquee_rectangle_core(&selection)
        );
    }

    #[test]
    fn marquee_selection_update_matches_update_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection_core();
        a.begin(10.0, 20.0);
        begin_marquee_selection_core(&mut b, 10.0, 20.0);
        a.update(2.0, 5.0);
        update_marquee_selection_core(&mut b, 2.0, 5.0);
        assert_eq!(a.rectangle(), get_marquee_rectangle_core(&b));
    }
}

pub fn create_marquee_selection_core() -> MarqueeSelection {
    let mut out: MarqueeSelection = allocate_entity();
    initialize_marquee_selection_core(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction initializer required by the Rust IR
pub fn initialize_marquee_selection_core(out: &mut MarqueeSelection) {
    out.state = MarqueeSelectionRuntime {
        active: false,
        rectangle: create_rectangle(0.0, 0.0, 0.0, 0.0),
        start_x: 0.0,
        start_y: 0.0,
    };
}

pub fn begin_marquee_selection_core(selection: &mut MarqueeSelection, start_x: f32, start_y: f32) {
    selection.state.active = true;
    selection.state.start_x = start_x;
    selection.state.start_y = start_y;
    set_marquee_rectangle(
        &mut selection.state.rectangle,
        start_x,
        start_y,
        start_x,
        start_y,
    );
}

pub fn end_marquee_selection_core(selection: &mut MarqueeSelection) -> &Rectangle {
    selection.state.active = false;
    return &selection.state.rectangle;
}

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the matches fill a caller-owned out, cleared first
pub fn find_nodes_in_marquee_selection_into(
    out: &mut Vec<NodeRef>,
    selection: &MarqueeSelection,
    candidates: &[NodeRef],
    mode: Option<MarqueeSelectionModeRaw>,
) {
    let mode = mode.unwrap_or(MarqueeSelectionModeRaw::Intersect);
    out.clear();
    for candidate in candidates {
        let bounds = get_node_local_bounds_rectangle(candidate);
        let is_match = match mode {
            MarqueeSelectionModeRaw::Contain => {
                encloses_rectangle(&selection.state.rectangle, &bounds)
            }
            MarqueeSelectionModeRaw::Intersect => {
                intersects_rectangle(&selection.state.rectangle, &bounds)
            }
        };
        if is_match {
            out.push(candidate.clone());
        }
    }
}

pub fn get_marquee_rectangle_core(selection: &MarqueeSelection) -> &Rectangle {
    return &selection.state.rectangle;
}

fn set_marquee_rectangle(
    rectangle: &mut Rectangle,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) {
    rectangle.x = start_x.min(end_x);
    rectangle.y = start_y.min(end_y);
    rectangle.width = (end_x - start_x).abs();
    rectangle.height = (end_y - start_y).abs();
}

pub fn update_marquee_selection_core(
    selection: &mut MarqueeSelection,
    current_x: f32,
    current_y: f32,
) {
    if !selection.state.active {
        return;
    }
    set_marquee_rectangle(
        &mut selection.state.rectangle,
        selection.state.start_x,
        selection.state.start_y,
        current_x,
        current_y,
    );
}

impl MarqueeSelection {
    pub fn new() -> Self {
        return create_marquee_selection_core();
    }

    pub fn begin(&mut self, start_x: f32, start_y: f32) {
        begin_marquee_selection_core(self, start_x, start_y);
    }

    pub fn end(&mut self) -> &Rectangle {
        return end_marquee_selection_core(self);
    }

    pub fn find_nodes(
        &self,
        out: &mut Vec<NodeRef>,
        candidates: &[NodeRef],
        mode: Option<MarqueeSelectionModeRaw>,
    ) {
        find_nodes_in_marquee_selection_into(out, self, candidates, mode);
    }

    pub fn rectangle(&self) -> &Rectangle {
        return get_marquee_rectangle_core(self);
    }

    pub fn update(&mut self, current_x: f32, current_y: f32) {
        update_marquee_selection_core(self, current_x, current_y);
    }
}
