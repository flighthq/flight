use flight_node::{NodeRef, get_node_world_bounds_rectangle};
use flight_spatial::{
    SpatialAabb2D, clear_spatial_index_2d, insert_spatial_object_2d, query_spatial_point_2d,
};

use crate::hit_tests::{HitTestContext, hit_test_node_region};
use crate::node_interaction_state::get_node_interaction_state;
use crate::types::InteractionManager;

fn collect_spatial_candidates(node: &NodeRef, out: &mut Vec<NodeRef>) {
    {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return;
        }
    }
    let state = get_node_interaction_state(node);
    let enabled = state
        .as_ref()
        .map_or(false, |s| s.read().unwrap().hit_test_enabled);
    let has_hit_area = state
        .as_ref()
        .map_or(false, |s| s.read().unwrap().hit_area.is_some());
    if enabled && has_hit_area {
        out.push(node.clone());
        return;
    }
    let children: Option<Vec<NodeRef>> = {
        let n = node.read().unwrap();
        n.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for i in (0..children.len()).rev() {
            collect_spatial_candidates(&children[i], out);
        }
    }
    if enabled {
        out.push(node.clone());
    }
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context and per-manager candidates
pub fn find_spatial_interaction_target(
    manager: &InteractionManager,
    ctx: &HitTestContext,
    x: f32,
    y: f32,
    precise: bool,
    candidates: &[NodeRef],
) -> Option<NodeRef> {
    let index_ref = manager.spatial_index.as_ref()?;
    if candidates.is_empty() {
        return None;
    }
    let mut query_out: Vec<i32> = Vec::new();
    {
        let mut idx = index_ref.write().unwrap();
        query_spatial_point_2d(&mut query_out, &mut idx, x, y);
    }
    let mut best: Option<NodeRef> = None;
    let mut best_rank = i32::MAX;
    for &rank in &query_out {
        if rank >= best_rank {
            continue;
        }
        if let Some(node) = candidates.get(rank as usize) {
            if hit_test_node_region(ctx, node, x, y, precise) {
                best = Some(node.clone());
                best_rank = rank;
            }
        }
    }
    return best;
}

// flight-lint: allow(conform-params) D5: per-manager candidates are caller-owned state
pub fn refresh_interaction_spatial_index(
    manager: &InteractionManager,
    candidates: &mut Vec<NodeRef>,
) {
    let index_ref = match &manager.spatial_index {
        Some(r) => r,
        None => return,
    };
    candidates.clear();
    collect_spatial_candidates(&manager.root, candidates);

    let mut idx = index_ref.write().unwrap();
    clear_spatial_index_2d(&mut idx);
    let mut aabb = SpatialAabb2D {
        min_x: 0.0,
        min_y: 0.0,
        max_x: 0.0,
        max_y: 0.0,
    };
    for (rank, node) in candidates.iter().enumerate() {
        let bounds = get_node_world_bounds_rectangle(node);
        aabb.min_x = bounds.x;
        aabb.min_y = bounds.y;
        aabb.max_x = bounds.x + bounds.width;
        aabb.max_y = bounds.y + bounds.height;
        insert_spatial_object_2d(&mut idx, rank as i32, &aabb);
    }
}
