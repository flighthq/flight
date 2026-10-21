use crate::scene_node::as_node3d;
use flight_geometry::{
    Aabb, Frustum, Matrix4, create_aabb, is_frustum_intersecting_aabb, set_frustum_from_matrix4,
    transform_aabb_by_matrix4,
};
use flight_meshgeometry::compute_mesh_geometry_bounds;
use flight_node::contract::get_node_world_matrix4;
use flight_node::contract::{NodeRef, NodeRevisionState};

pub fn build_scene3d_frustum(out: &mut Frustum, view_projection: &Matrix4) {
    set_frustum_from_matrix4(out, view_projection);
}
fn cull_node(
    out: &mut Vec<NodeRef>,
    node: &NodeRef,
    frustum: &Frustum,
    revisions: &mut NodeRevisionState,
) {
    let (geometry, children) = {
        let n = node.read().unwrap();
        if !n.node_fields().enabled {
            return;
        }
        (
            as_node3d(&*n)
                .and_then(|n| n.as_mesh())
                .map(|m| m.geometry.clone()),
            n.node_runtime().children.clone().unwrap_or_default(),
        )
    };
    if let Some(geometry) = geometry {
        let local = {
            let g = geometry.read().unwrap();
            if let Some(b) = &g.bounds {
                b.clone()
            } else {
                let mut b = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
                compute_mesh_geometry_bounds(&mut b, &g);
                b
            }
        };
        if local.min.x <= local.max.x {
            let matrix = get_node_world_matrix4(node, revisions);
            let mut world: Aabb = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
            transform_aabb_by_matrix4(&mut world, &local, &matrix);
            if is_frustum_intersecting_aabb(frustum, &world) {
                out.push(node.clone());
            }
        }
    }
    for child in children {
        cull_node(out, &child, frustum, revisions);
    }
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node revision source; D9 mutating out-first operation returns unit
pub fn cull_node3d_by_frustum(
    out: &mut Vec<NodeRef>,
    root: &NodeRef,
    frustum: &Frustum,
    revisions: &mut NodeRevisionState,
) {
    cull_node(out, root, frustum, revisions);
}
