use crate::scene_node::as_node3d;
use flight_geometry::{Aabb, create_aabb, set_aabb, transform_aabb_by_matrix4, union_aabb};
use flight_meshgeometry::contract::ensure_mesh_geometry_bounds;
use flight_node::contract::NodeRef;
use flight_node::contract::get_node_world_matrix4;

fn accumulate_world_bounds(out: &mut Aabb, node: &NodeRef) {
    let (geometry, children) = {
        let n = node.read().unwrap();
        let geometry = as_node3d(&*n)
            .and_then(|n| n.as_mesh())
            .map(|m| m.geometry.clone());
        (
            geometry,
            n.node_runtime().children.clone().unwrap_or_default(),
        )
    };
    if let Some(geometry) = geometry {
        let local = ensure_mesh_geometry_bounds(&mut geometry.write().unwrap()).cloned();
        if let Some(local) = local {
            if local.min.x <= local.max.x {
                let matrix = get_node_world_matrix4(node);
                let mut world = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
                transform_aabb_by_matrix4(&mut world, &local, &matrix);
                let previous = out.clone();
                union_aabb(out, &previous, &world);
            }
        }
    }
    for child in children {
        accumulate_world_bounds(out, &child);
    }
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node revision source replaces TS module state
pub fn get_node3d_world_bounds(out: &mut Aabb, node: &NodeRef) {
    set_aabb(
        out,
        f32::INFINITY,
        f32::INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
    );
    accumulate_world_bounds(out, node);
}
