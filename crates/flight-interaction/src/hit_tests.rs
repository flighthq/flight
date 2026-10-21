use std::collections::HashMap;

use flight_clip::clip_region_contains_point;
use flight_entity::Kind;
use flight_geometry::{
    contains_rectangle_point_xy, create_vector2, intersects_rectangle,
    inverse_matrix_transform_point_xy,
};
use flight_node::contract::NodeRevisionState;
use flight_node::{
    get_node_local_bounds_rectangle, get_node_parent, get_node_world_bounds_rectangle,
    get_node_world_matrix, NodeRef,
};
use flight_path::contains_path_point;

use crate::node_interaction_state::get_node_interaction_state;
use crate::types::{HitArea, HitTestFunction, HitTestPreciseFunction, HitTestResult};

// flight-lint: allow(conform-extra) D5: caller-owned hit test context replaces TS module-level registries
pub struct HitTestContext {
    registry: HashMap<Kind, HitTestFunction>,
    exact_registry: HashMap<Kind, HitTestPreciseFunction>,
}

// flight-lint: allow(conform-extra) D5: Rust needs explicit constructor for caller-owned hit test context
pub fn create_hit_test_context() -> HitTestContext {
    return HitTestContext {
        registry: HashMap::new(),
        exact_registry: HashMap::new(),
    };
}

fn any_hit(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
    precise: bool,
) -> bool {
    {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return false;
        }
    }
    if !contains_node_clip_point(node, x, y) {
        return false;
    }

    let state = get_node_interaction_state(node);
    let (enabled, has_hit_area, children_enabled) = match &state {
        Some(s) => {
            let s = s.read().unwrap();
            (
                s.hit_test_enabled,
                s.hit_area.is_some(),
                s.children_hit_test_enabled,
            )
        }
        None => (false, false, true),
    };

    if enabled && has_hit_area {
        return hit_area_contains_point(ctx, node, x, y);
    }
    if enabled && test_node_geometry(ctx, node, x, y, precise) {
        return true;
    }

    if children_enabled {
        let children: Option<Vec<NodeRef>> = {
            let n = node.read().unwrap();
            n.node_runtime().children.clone()
        };
        if let Some(children) = children {
            for child in &children {
                if any_hit(ctx, child, x, y, precise) {
                    return true;
                }
            }
        }
    }
    return false;
}

fn collect_hits(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
    precise: bool,
    out: &mut Vec<NodeRef>,
) {
    {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return;
        }
    }
    if !contains_node_clip_point(node, x, y) {
        return;
    }

    let state = get_node_interaction_state(node);
    let (enabled, has_hit_area, children_enabled) = match &state {
        Some(s) => {
            let s = s.read().unwrap();
            (
                s.hit_test_enabled,
                s.hit_area.is_some(),
                s.children_hit_test_enabled,
            )
        }
        None => (false, false, true),
    };

    if enabled && has_hit_area {
        if hit_area_contains_point(ctx, node, x, y) {
            out.push(node.clone());
        }
        return;
    }

    if children_enabled {
        let children: Option<Vec<NodeRef>> = {
            let n = node.read().unwrap();
            n.node_runtime().children.clone()
        };
        if let Some(children) = children {
            for i in (0..children.len()).rev() {
                collect_hits(ctx, &children[i], x, y, precise, out);
            }
        }
    }

    if enabled && test_node_geometry(ctx, node, x, y, precise) {
        out.push(node.clone());
    }
}

// flight-lint: allow(f64) D1: clip region API uses f64 path coordinates
fn contains_node_clip_point(node: &NodeRef, x: f32, y: f32) -> bool {
    let clip = {
        let n = node.read().unwrap();
        match n.as_clip_node() {
            Some(clip_node) => clip_node.clip_view().clip.clone(),
            None => return true,
        }
    };
    let Some(clip) = clip else {
        return true;
    };
    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(node, &mut revisions);
    let mut scratch = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut scratch, &matrix, x, y);
    let clip_state = flight_clip::ClipRegionState::default();
    return clip_region_contains_point(
        &clip_state,
        &clip,
        scratch.x as f64,
        scratch.y as f64,
    );
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn describe_graph_hit(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
    out: &mut HitTestResult,
) {
    out.node = Some(node.clone());
    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(node, &mut revisions);
    let mut scratch = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut scratch, &matrix, x, y);
    out.local_x = scratch.x;
    out.local_y = scratch.y;
    let kind = node.read().unwrap().node_fields().kind.clone();
    out.sub_index = match ctx.exact_registry.get(&kind) {
        Some(exact) => exact(node, x, y),
        None => -1,
    };
}

fn find_first_hit(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
    precise: bool,
) -> Option<NodeRef> {
    {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return None;
        }
    }
    if !contains_node_clip_point(node, x, y) {
        return None;
    }

    let state = get_node_interaction_state(node);
    let (enabled, has_hit_area, children_enabled) = match &state {
        Some(s) => {
            let s = s.read().unwrap();
            (
                s.hit_test_enabled,
                s.hit_area.is_some(),
                s.children_hit_test_enabled,
            )
        }
        None => (false, false, true),
    };

    if enabled && has_hit_area {
        return if hit_area_contains_point(ctx, node, x, y) {
            Some(node.clone())
        } else {
            None
        };
    }

    if children_enabled {
        let children: Option<Vec<NodeRef>> = {
            let n = node.read().unwrap();
            n.node_runtime().children.clone()
        };
        if let Some(children) = children {
            for i in (0..children.len()).rev() {
                let hit = find_first_hit(ctx, &children[i], x, y, precise);
                if hit.is_some() {
                    return hit;
                }
            }
        }
    }

    if enabled && test_node_geometry(ctx, node, x, y, precise) {
        return Some(node.clone());
    }
    return None;
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn find_graph_hit_target(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
) -> Option<NodeRef> {
    return find_first_hit(ctx, source, x, y, false);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn find_graph_hit_target_precise(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
) -> Option<NodeRef> {
    return find_first_hit(ctx, source, x, y, true);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn find_graph_hit_targets(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
    out: &mut Vec<NodeRef>,
) {
    out.clear();
    collect_hits(ctx, source, x, y, false, out);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn find_graph_hit_targets_precise(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
    out: &mut Vec<NodeRef>,
) {
    out.clear();
    collect_hits(ctx, source, x, y, true, out);
}

// flight-lint: allow(f64) D1: path containment API uses f64 coordinates
fn hit_area_contains_point(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
) -> bool {
    let state = get_node_interaction_state(node);
    let state = match state {
        Some(s) => s,
        None => return false,
    };
    let state_guard = state.read().unwrap();
    let hit_area = match &state_guard.hit_area {
        Some(ha) => ha,
        None => return false,
    };

    match hit_area {
        HitArea::Bounds => {
            drop(state_guard);
            return hit_test_graph_local_bounds(node, x, y);
        }
        HitArea::Node(proxy) => {
            let proxy = proxy.clone();
            let kind = proxy.read().unwrap().node_fields().kind.clone();
            drop(state_guard);
            if let Some(proxy_hit) = ctx.registry.get(&kind) {
                return proxy_hit(&proxy, x, y);
            }
            return hit_test_graph_local_bounds(&proxy, x, y);
        }
        HitArea::Path(path_ref) => {
            let path_ref = path_ref.clone();
            drop(state_guard);
            let mut revisions = NodeRevisionState::default();
            let matrix = get_node_world_matrix(node, &mut revisions);
            let mut scratch = create_vector2(0.0, 0.0);
            inverse_matrix_transform_point_xy(&mut scratch, &matrix, x, y);
            let path_guard = path_ref.read().unwrap();
            return contains_path_point(
                &path_guard,
                scratch.x as f64,
                scratch.y as f64,
                None,
            );
        }
        HitArea::Rect(rect) => {
            let rect = rect.clone();
            drop(state_guard);
            let mut revisions = NodeRevisionState::default();
            let matrix = get_node_world_matrix(node, &mut revisions);
            let mut scratch = create_vector2(0.0, 0.0);
            inverse_matrix_transform_point_xy(&mut scratch, &matrix, x, y);
            return contains_rectangle_point_xy(&rect, scratch.x, scratch.y);
        }
    }
}

pub fn hit_test_graph_local_bounds(source: &NodeRef, x: f32, y: f32) -> bool {
    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(source, &mut revisions);
    let mut scratch = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut scratch, &matrix, x, y);
    return contains_rectangle_point_xy(
        &get_node_local_bounds_rectangle(source),
        scratch.x,
        scratch.y,
    );
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn hit_test_graph_point(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
) -> bool {
    return any_hit(ctx, source, x, y, false);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn hit_test_graph_point_precise(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
) -> bool {
    return any_hit(ctx, source, x, y, true);
}

pub fn hit_test_node2ds(source: &NodeRef, other: &NodeRef) -> bool {
    if get_node_parent(source).is_some() && get_node_parent(other).is_some() {
        let mut revisions = NodeRevisionState::default();
        return intersects_rectangle(
            &get_node_world_bounds_rectangle(source, &mut revisions),
            &get_node_world_bounds_rectangle(other, &mut revisions),
        );
    }
    return false;
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn hit_test_node_region(
    ctx: &HitTestContext,
    source: &NodeRef,
    x: f32,
    y: f32,
    precise: bool,
) -> bool {
    let state = get_node_interaction_state(source);
    let has_hit_area = state
        .as_ref()
        .map_or(false, |s| s.read().unwrap().hit_area.is_some());
    if has_hit_area {
        return hit_area_contains_point(ctx, source, x, y);
    }
    return test_node_geometry(ctx, source, x, y, precise);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_hit_test(ctx: &mut HitTestContext, kind: Kind, f: HitTestFunction) {
    ctx.registry.insert(kind, f);
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_hit_test_precise(
    ctx: &mut HitTestContext,
    kind: Kind,
    f: HitTestPreciseFunction,
) {
    ctx.exact_registry.insert(kind, f);
}

fn test_node_geometry(
    ctx: &HitTestContext,
    node: &NodeRef,
    x: f32,
    y: f32,
    precise: bool,
) -> bool {
    let kind = node.read().unwrap().node_fields().kind.clone();
    if precise {
        if let Some(exact) = ctx.exact_registry.get(&kind) {
            return exact(node, x, y) >= 0;
        }
    }
    if let Some(coarse) = ctx.registry.get(&kind) {
        return coarse(node, x, y);
    }
    return false;
}

impl HitTestContext {
    pub fn new() -> Self {
        return create_hit_test_context();
    }
}
