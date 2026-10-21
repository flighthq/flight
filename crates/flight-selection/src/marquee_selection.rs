use flight_entity::allocate_entity;
use flight_geometry::{Rectangle, create_rectangle, encloses_rectangle, intersects_rectangle};
use flight_node::{NodeRef, get_node_local_bounds_rectangle};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn marquee_selection_begin_matches_begin_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection();
        a.begin(4.0, 5.0);
        begin_marquee_selection(&mut b, 4.0, 5.0);
        assert_eq!(a.rectangle(), get_marquee_rectangle(&b));
    }

    #[test]
    fn marquee_selection_end_matches_end_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection();
        a.begin(1.0, 2.0);
        begin_marquee_selection(&mut b, 1.0, 2.0);
        let method = a.end().clone();
        let free = end_marquee_selection(&mut b).clone();
        assert_eq!(method, free);
    }

    #[test]
    fn marquee_selection_find_nodes_matches_find_nodes_in_marquee_selection() {
        let selection = MarqueeSelection::new();
        assert!(selection.find_nodes(&[], None).is_empty());
        assert!(find_nodes_in_marquee_selection(&selection, &[], None).is_empty());
    }

    #[test]
    fn marquee_selection_mode_as_str_matches_get_marquee_selection_mode_string() {
        let mode = MarqueeSelectionMode::Contain;
        assert_eq!(mode.as_str(), get_marquee_selection_mode_string(mode));
    }

    #[test]
    fn marquee_selection_new_matches_create_marquee_selection() {
        let a = MarqueeSelection::new();
        let b = create_marquee_selection();
        assert_eq!(a.rectangle(), get_marquee_rectangle(&b));
    }

    #[test]
    fn marquee_selection_rectangle_matches_get_marquee_rectangle() {
        let selection = MarqueeSelection::new();
        assert_eq!(selection.rectangle(), get_marquee_rectangle(&selection));
    }

    #[test]
    fn marquee_selection_update_matches_update_marquee_selection() {
        let mut a = MarqueeSelection::new();
        let mut b = create_marquee_selection();
        a.begin(10.0, 20.0);
        begin_marquee_selection(&mut b, 10.0, 20.0);
        a.update(2.0, 5.0);
        update_marquee_selection(&mut b, 2.0, 5.0);
        assert_eq!(a.rectangle(), get_marquee_rectangle(&b));
    }
}

pub fn create_marquee_selection() -> MarqueeSelection {
    let mut out: MarqueeSelection = allocate_entity();
    initialize_marquee_selection(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction initializer required by the Rust IR
pub fn initialize_marquee_selection(out: &mut MarqueeSelection) {
    out.state = MarqueeSelectionRuntime {
        active: false,
        rectangle: create_rectangle(0.0, 0.0, 0.0, 0.0),
        start_x: 0.0,
        start_y: 0.0,
    };
}

pub fn begin_marquee_selection(selection: &mut MarqueeSelection, start_x: f32, start_y: f32) {
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

pub fn end_marquee_selection(selection: &mut MarqueeSelection) -> &Rectangle {
    selection.state.active = false;
    return &selection.state.rectangle;
}

pub fn find_nodes_in_marquee_selection(
    selection: &MarqueeSelection,
    candidates: &[NodeRef],
    mode: Option<MarqueeSelectionMode>,
) -> Vec<NodeRef> {
    let mode = mode.unwrap_or(MarqueeSelectionMode::Intersect);
    let mut matches: Vec<NodeRef> = Vec::new();
    for candidate in candidates {
        let bounds = get_node_local_bounds_rectangle(candidate);
        let is_match = match mode {
            MarqueeSelectionMode::Contain => {
                encloses_rectangle(&selection.state.rectangle, &bounds)
            }
            MarqueeSelectionMode::Intersect => {
                intersects_rectangle(&selection.state.rectangle, &bounds)
            }
        };
        if is_match {
            matches.push(candidate.clone());
        }
    }
    return matches;
}

pub fn get_marquee_rectangle(selection: &MarqueeSelection) -> &Rectangle {
    return &selection.state.rectangle;
}

// flight-lint: allow(conform-extra) D9e exact closed-string serialization helper
pub fn get_marquee_selection_mode_string(value: MarqueeSelectionMode) -> &'static str {
    return match value {
        MarqueeSelectionMode::Contain => "contain",
        MarqueeSelectionMode::Intersect => "intersect",
    };
}

// flight-lint: allow(conform-extra) D9e exact closed-string parsing helper
pub fn parse_marquee_selection_mode(value: &str) -> Option<MarqueeSelectionMode> {
    return match value {
        "contain" => Some(MarqueeSelectionMode::Contain),
        "intersect" => Some(MarqueeSelectionMode::Intersect),
        _ => None,
    };
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

pub fn update_marquee_selection(selection: &mut MarqueeSelection, current_x: f32, current_y: f32) {
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
        return create_marquee_selection();
    }

    pub fn begin(&mut self, start_x: f32, start_y: f32) {
        begin_marquee_selection(self, start_x, start_y);
    }

    pub fn end(&mut self) -> &Rectangle {
        return end_marquee_selection(self);
    }

    pub fn find_nodes(
        &self,
        candidates: &[NodeRef],
        mode: Option<MarqueeSelectionMode>,
    ) -> Vec<NodeRef> {
        return find_nodes_in_marquee_selection(self, candidates, mode);
    }

    pub fn rectangle(&self) -> &Rectangle {
        return get_marquee_rectangle(self);
    }

    pub fn update(&mut self, current_x: f32, current_y: f32) {
        update_marquee_selection(self, current_x, current_y);
    }
}

impl MarqueeSelectionMode {
    pub fn as_str(self) -> &'static str {
        return get_marquee_selection_mode_string(self);
    }
}
