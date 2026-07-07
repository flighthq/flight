//! World-space bounds accumulation over a scene subtree.
//!
//! Ports the TS `@flighthq/scene` `sceneNodeBounds.ts`. Each Mesh leaf
//! contributes its local-space geometry bounds transformed by its world matrix;
//! transform-only group nodes contribute nothing.

use flighthq_geometry::{set_aabb, transform_aabb_by_matrix4, union_aabb};
use flighthq_mesh::compute_mesh_geometry_bounds;
use flighthq_node::{HierarchyArena, NodeId, get_node_children};
use flighthq_types::{Aabb, Matrix4Like};

use crate::scene_node::{SceneArena, get_scene_node_world_matrix};

/// Accumulates the world-space AABB of `root` and all its descendants into
/// `out`. If neither `root` nor any descendant is a Mesh, `out` is set to an
/// empty box (`min = +inf`, `max = -inf`). Disabled nodes are still included —
/// this matches the TS behavior (filter in a visitor to exclude them).
///
/// `hierarchy` supplies the child links and parent chain; `arena` supplies the
/// geometry and local transforms and caches the world matrices computed along
/// the way. Alias-safe: `out` may be any pre-existing `Aabb`.
pub fn get_scene_node_world_bounds(
    out: &mut Aabb,
    arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    root: NodeId,
) {
    set_aabb(
        out,
        f32::INFINITY,
        f32::INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
    );
    accumulate_world_bounds(out, arena, hierarchy, root);
}

fn accumulate_world_bounds(
    out: &mut Aabb,
    arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    node: NodeId,
) {
    // Resolve local-space bounds (from the cache or a fresh compute) before any
    // mutable borrow of the arena.
    let local_bounds: Option<Aabb> =
        arena[node]
            .mesh
            .as_ref()
            .map(|mesh| match mesh.geometry.bounds {
                Some(b) => b,
                None => {
                    let mut scratch = Aabb::default();
                    compute_mesh_geometry_bounds(&mut scratch, &mesh.geometry);
                    scratch
                }
            });

    // Only a non-empty local box (min <= max) contributes.
    if let Some(local) = local_bounds.filter(|b| b.min.x <= b.max.x) {
        let world = Matrix4Like {
            m: get_scene_node_world_matrix(arena, hierarchy, node).m,
        };
        let mut world_aabb = Aabb::default();
        transform_aabb_by_matrix4(&mut world_aabb, &local, &world);
        let current = *out;
        union_aabb(out, &current, &world_aabb);
    }

    for child in get_node_children(hierarchy, node) {
        accumulate_world_bounds(out, arena, hierarchy, child);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use flighthq_node::{HierarchyNode, add_node_child};
    use flighthq_types::{
        MeshGeometry, MeshSubset, PrimitiveTopology, VertexAttribute, VertexAttributeLayout,
        VertexFormat, VertexSemantic,
    };

    use super::*;
    use crate::mesh::create_mesh;
    use crate::scene_node::create_scene_node;
    use crate::scene_node_transform::set_scene_node_position;

    // A position-only unit box centered at origin (bounds [-0.5, 0.5]).
    fn box_geometry() -> Arc<MeshGeometry> {
        let h = 0.5;
        #[rustfmt::skip]
        let vertices = vec![
            -h, -h, -h,  h, -h, -h,  h,  h, -h, -h,  h, -h,
            -h, -h,  h,  h, -h,  h,  h,  h,  h, -h,  h,  h,
        ];
        Arc::new(MeshGeometry {
            bounds: None,
            indices: None,
            layout: VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            },
            subsets: vec![MeshSubset {
                index_count: 0,
                index_offset: 0,
            }],
            topology: PrimitiveTopology::TriangleList,
            version: 0,
            vertices,
        })
    }

    // Inserts a node into both arenas keeping the NodeId aligned.
    fn add_pair(scene: &mut SceneArena, hierarchy: &mut HierarchyArena, is_mesh: bool) -> NodeId {
        let s = if is_mesh {
            create_mesh(scene, box_geometry(), vec![], None)
        } else {
            create_scene_node(scene, None)
        };
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(s, h, "key alignment required");
        s
    }

    // get_scene_node_world_bounds

    #[test]
    fn empty_box_when_no_mesh_geometry() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let node = add_pair(&mut scene, &mut hierarchy, false);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, node);
        assert_eq!(out.min.x, f32::INFINITY);
        assert_eq!(out.max.x, f32::NEG_INFINITY);
    }

    #[test]
    fn empty_box_for_group_only_scene() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_pair(&mut scene, &mut hierarchy, false);
        let a = add_pair(&mut scene, &mut hierarchy, false);
        let b = add_pair(&mut scene, &mut hierarchy, false);
        add_node_child(&mut hierarchy, root, a);
        add_node_child(&mut hierarchy, root, b);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, root);
        assert_eq!(out.min.x, f32::INFINITY);
    }

    #[test]
    fn single_mesh_at_origin() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let mesh = add_pair(&mut scene, &mut hierarchy, true);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, mesh);
        assert!((out.min.x + 0.5).abs() < 1e-4);
        assert!((out.max.z - 0.5).abs() < 1e-4);
    }

    #[test]
    fn translated_mesh_bounds() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let mesh = add_pair(&mut scene, &mut hierarchy, true);
        set_scene_node_position(&mut scene, mesh, 10.0, 0.0, 0.0);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, mesh);
        assert!((out.min.x - 9.5).abs() < 1e-4);
        assert!((out.max.x - 10.5).abs() < 1e-4);
    }

    #[test]
    fn accumulates_multiple_mesh_children() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_pair(&mut scene, &mut hierarchy, false);
        let a = add_pair(&mut scene, &mut hierarchy, true);
        let b = add_pair(&mut scene, &mut hierarchy, true);
        set_scene_node_position(&mut scene, a, -5.0, 0.0, 0.0);
        set_scene_node_position(&mut scene, b, 5.0, 0.0, 0.0);
        add_node_child(&mut hierarchy, root, a);
        add_node_child(&mut hierarchy, root, b);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, root);
        assert!((out.min.x + 5.5).abs() < 1e-4);
        assert!((out.max.x - 5.5).abs() < 1e-4);
    }

    #[test]
    fn accumulates_recursively_through_groups() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_pair(&mut scene, &mut hierarchy, false);
        let group = add_pair(&mut scene, &mut hierarchy, false);
        let leaf = add_pair(&mut scene, &mut hierarchy, true);
        set_scene_node_position(&mut scene, leaf, 3.0, 0.0, 0.0);
        add_node_child(&mut hierarchy, root, group);
        add_node_child(&mut hierarchy, group, leaf);
        let mut out = Aabb::default();
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, root);
        assert!((out.min.x - 2.5).abs() < 1e-4);
        assert!((out.max.x - 3.5).abs() < 1e-4);
    }

    #[test]
    fn is_alias_safe_with_prefilled_out() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let mesh = add_pair(&mut scene, &mut hierarchy, true);
        let mut out = Aabb {
            min: flighthq_types::Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            max: flighthq_types::Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
        };
        get_scene_node_world_bounds(&mut out, &mut scene, &hierarchy, mesh);
        assert!((out.min.x + 0.5).abs() < 1e-4);
    }
}
