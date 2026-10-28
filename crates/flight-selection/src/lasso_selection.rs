use flight_entity::allocate_entity;
use flight_node::{NodeRef, get_node_local_bounds_rectangle};
use flight_path::{Path, PathCommand, PathWinding, create_path};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn lasso_selection_add_point_matches_add_lasso_selection_point() {
        let mut a = LassoSelection::new();
        let mut b = create_lasso_selection();
        a.begin(1.0, 2.0);
        begin_lasso_selection(&mut b, 1.0, 2.0);
        a.add_point(3.0, 4.0);
        add_lasso_selection_point(&mut b, 3.0, 4.0);
        assert_eq!(a.path(), get_lasso_selection_path(&b));
    }

    #[test]
    fn lasso_selection_begin_matches_begin_lasso_selection() {
        let mut a = LassoSelection::new();
        let mut b = create_lasso_selection();
        a.begin(1.0, 2.0);
        begin_lasso_selection(&mut b, 1.0, 2.0);
        assert_eq!(a.path(), get_lasso_selection_path(&b));
    }

    #[test]
    fn lasso_selection_end_matches_end_lasso_selection() {
        let mut a = LassoSelection::new();
        let mut b = create_lasso_selection();
        a.begin(1.0, 2.0);
        begin_lasso_selection(&mut b, 1.0, 2.0);
        let method = a.end().clone();
        let free = end_lasso_selection(&mut b).clone();
        assert_eq!(method, free);
    }

    #[test]
    fn lasso_selection_find_nodes_matches_find_nodes_in_lasso_selection() {
        let selection = LassoSelection::new();
        let (mut method, mut free) = (Vec::new(), Vec::new());
        selection.find_nodes(&mut method, &[]);
        find_nodes_in_lasso_selection(&mut free, &selection, &[]);
        assert!(method.is_empty() && free.is_empty());
    }

    #[test]
    fn lasso_selection_new_matches_create_lasso_selection() {
        let a = LassoSelection::new();
        let b = create_lasso_selection();
        assert_eq!(a.path(), get_lasso_selection_path(&b));
    }

    #[test]
    fn lasso_selection_path_matches_get_lasso_selection_path() {
        let selection = LassoSelection::new();
        assert_eq!(selection.path(), get_lasso_selection_path(&selection));
    }
}

// flight-lint: allow-file(f64) lasso coordinates feed canonical f64 Path.data without truncation

pub fn create_lasso_selection() -> LassoSelection {
    let mut out: LassoSelection = allocate_entity();
    initialize_lasso_selection(&mut out);
    return out;
}

pub fn initialize_lasso_selection(out: &mut LassoSelection) {
    let mut path = create_path(flight_path::PathWinding::NonZero);
    path.winding = PathWinding::EvenOdd;
    out.state = LassoSelectionRuntime {
        active: false,
        path,
    };
}

pub fn add_lasso_selection_point(selection: &mut LassoSelection, x: f64, y: f64) {
    if !selection.state.active {
        return;
    }
    selection
        .state
        .path
        .commands
        .push(PathCommand::LineTo as u8);
    selection.state.path.data.push(x);
    selection.state.path.data.push(y);
}

pub fn begin_lasso_selection(selection: &mut LassoSelection, start_x: f64, start_y: f64) {
    selection.state.active = true;
    selection.state.path.commands.clear();
    selection.state.path.data.clear();
    selection
        .state
        .path
        .commands
        .push(PathCommand::MoveTo as u8);
    selection.state.path.data.push(start_x);
    selection.state.path.data.push(start_y);
}

pub fn end_lasso_selection(selection: &mut LassoSelection) -> &Path {
    if selection.state.active {
        selection.state.path.commands.push(PathCommand::Close as u8);
    }
    selection.state.active = false;
    return &selection.state.path;
}

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the matches fill a caller-owned out, cleared first
pub fn find_nodes_in_lasso_selection(
    out: &mut Vec<NodeRef>,
    selection: &LassoSelection,
    candidates: &[NodeRef],
) {
    out.clear();
    if selection.state.path.data.len() < 6 {
        return;
    }

    for candidate in candidates {
        let bounds = get_node_local_bounds_rectangle(candidate);
        let center_x = (bounds.x + bounds.width / 2.0) as f64;
        let center_y = (bounds.y + bounds.height / 2.0) as f64;
        if is_point_in_polygon(&selection.state.path.data, center_x, center_y) {
            out.push(candidate.clone());
        }
    }
}

pub fn get_lasso_selection_path(selection: &LassoSelection) -> &Path {
    return &selection.state.path;
}

fn is_point_in_polygon(points: &[f64], x: f64, y: f64) -> bool {
    let mut inside = false;
    let point_count = points.len() / 2;
    let mut previous_index = point_count - 1;
    for current_index in 0..point_count {
        let current_x = points[current_index * 2];
        let current_y = points[current_index * 2 + 1];
        let previous_x = points[previous_index * 2];
        let previous_y = points[previous_index * 2 + 1];

        if is_point_on_segment(x, y, previous_x, previous_y, current_x, current_y) {
            return true;
        }
        if (current_y > y) != (previous_y > y)
            && x < ((previous_x - current_x) * (y - current_y)) / (previous_y - current_y)
                + current_x
        {
            inside = !inside;
        }
        previous_index = current_index;
    }
    return inside;
}

fn is_point_on_segment(x: f64, y: f64, start_x: f64, start_y: f64, end_x: f64, end_y: f64) -> bool {
    let cross = (x - start_x) * (end_y - start_y) - (y - start_y) * (end_x - start_x);
    let scale = 1.0_f64
        .max((end_x - start_x).abs())
        .max((end_y - start_y).abs());
    if cross.abs() > f64::EPSILON * scale * 16.0 {
        return false;
    }
    return x >= start_x.min(end_x)
        && x <= start_x.max(end_x)
        && y >= start_y.min(end_y)
        && y <= start_y.max(end_y);
}

impl LassoSelection {
    pub fn new() -> Self {
        return create_lasso_selection();
    }

    pub fn add_point(&mut self, x: f64, y: f64) {
        add_lasso_selection_point(self, x, y);
    }

    pub fn begin(&mut self, start_x: f64, start_y: f64) {
        begin_lasso_selection(self, start_x, start_y);
    }

    pub fn end(&mut self) -> &Path {
        return end_lasso_selection(self);
    }

    pub fn find_nodes(&self, out: &mut Vec<NodeRef>, candidates: &[NodeRef]) {
        find_nodes_in_lasso_selection(out, self, candidates);
    }

    pub fn path(&self) -> &Path {
        return get_lasso_selection_path(self);
    }
}
