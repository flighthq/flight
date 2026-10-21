use flight_geometry::{intersects_rectangle, Rectangle};
use flight_node::contract::NodeRevisionState;
use flight_node::{get_node_world_bounds_rectangle, NodeRef};

// flight-lint: allow(conform-params) D1: explicit revision state per caller-owned clock
pub fn hit_test_area_query(
    root: &NodeRef,
    rect: &Rectangle,
    out: &mut Vec<NodeRef>,
    revisions: &mut NodeRevisionState,
) {
    {
        let node = root.read().unwrap();
        if !node.node_fields().enabled {
            return;
        }
    }

    let world_bounds = get_node_world_bounds_rectangle(root, revisions);
    if intersects_rectangle(&world_bounds, rect) {
        out.push(root.clone());
    }

    let children: Option<Vec<NodeRef>> = {
        let node = root.read().unwrap();
        node.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            hit_test_area_query(child, rect, out, revisions);
        }
    }
}

// flight-lint: allow(conform-params) D1: explicit revision state per caller-owned clock
pub fn hit_test_area_query_circle(
    root: &NodeRef,
    cx: f32,
    cy: f32,
    radius: f32,
    out: &mut Vec<NodeRef>,
    revisions: &mut NodeRevisionState,
) {
    {
        let node = root.read().unwrap();
        if !node.node_fields().enabled {
            return;
        }
    }

    let b = get_node_world_bounds_rectangle(root, revisions);
    let near_x = cx.max(b.x).min(b.x + b.width);
    let near_y = cy.max(b.y).min(b.y + b.height);
    let dx = cx - near_x;
    let dy = cy - near_y;
    if dx * dx + dy * dy <= radius * radius {
        out.push(root.clone());
    }

    let children: Option<Vec<NodeRef>> = {
        let node = root.read().unwrap();
        node.node_runtime().children.clone()
    };
    if let Some(children) = children {
        for child in &children {
            hit_test_area_query_circle(child, cx, cy, radius, out, revisions);
        }
    }
}
