//! Frustum culling of a scene subtree.
//!
//! Ports the TS `@flighthq/scene` `sceneNodeCulling.ts`. `build_scene_frustum`
//! extracts a view frustum from a view-projection matrix; `cull_scene_node_by_frustum`
//! walks a subtree and collects the Mesh leaves whose world-space AABB intersects
//! that frustum.
//!
//! TS↔Rust note: the geometry-crate `Frustum` header type and its
//! `set_frustum_from_matrix4` / `is_frustum_intersecting_aabb` helpers are not
//! yet compiled (their modules are unwired), so a self-contained `Frustum` (six
//! [`Plane`]s) and the Gribb-Hartmann extraction + positive-vertex AABB test are
//! implemented here, matching the TS `@flighthq/geometry` frustum module. When
//! the geometry header lands, these should delegate to it.

use flighthq_geometry::transform_aabb_by_matrix4;
use flighthq_mesh::compute_mesh_geometry_bounds;
use flighthq_node::{HierarchyArena, NodeId, get_node_children};
use flighthq_types::{Aabb, Matrix4Like, Plane};

use crate::scene_node::{SceneArena, get_scene_node_world_matrix};

/// Six clip planes of a view frustum, each oriented with an inward-pointing
/// normal. A point is inside when its signed distance to every plane is
/// non-negative.
#[derive(Clone, Debug, Default)]
pub struct Frustum {
    pub bottom: Plane,
    pub far: Plane,
    pub left: Plane,
    pub near: Plane,
    pub right: Plane,
    pub top: Plane,
}

/// Extracts the six frustum planes from a view-projection matrix
/// (Gribb-Hartmann), each normalized with an inward-pointing normal, into `out`.
pub fn build_scene_frustum(out: &mut Frustum, view_projection: &Matrix4Like) {
    let m = &view_projection.m;
    let r00 = m[0];
    let r01 = m[4];
    let r02 = m[8];
    let r03 = m[12];
    let r10 = m[1];
    let r11 = m[5];
    let r12 = m[9];
    let r13 = m[13];
    let r20 = m[2];
    let r21 = m[6];
    let r22 = m[10];
    let r23 = m[14];
    let r30 = m[3];
    let r31 = m[7];
    let r32 = m[11];
    let r33 = m[15];

    set_plane_normalized(&mut out.left, r30 + r00, r31 + r01, r32 + r02, r33 + r03);
    set_plane_normalized(&mut out.right, r30 - r00, r31 - r01, r32 - r02, r33 - r03);
    set_plane_normalized(&mut out.bottom, r30 + r10, r31 + r11, r32 + r12, r33 + r13);
    set_plane_normalized(&mut out.top, r30 - r10, r31 - r11, r32 - r12, r33 - r13);
    set_plane_normalized(&mut out.near, r30 + r20, r31 + r21, r32 + r22, r33 + r23);
    set_plane_normalized(&mut out.far, r30 - r20, r31 - r21, r32 - r22, r33 - r23);
}

/// Walks the subtree rooted at `root` depth-first and appends each Mesh leaf
/// whose world-space AABB intersects `frustum` to `out`. Transform-only group
/// nodes are never collected. Disabled nodes and their entire subtrees are
/// skipped.
///
/// `out` is not cleared before collection — the caller controls accumulation
/// order across multiple roots.
pub fn cull_scene_node_by_frustum(
    out: &mut Vec<NodeId>,
    arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    root: NodeId,
    frustum: &Frustum,
) {
    if !arena[root].enabled {
        return;
    }

    let local_bounds: Option<Aabb> =
        arena[root]
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
            m: get_scene_node_world_matrix(arena, hierarchy, root).m,
        };
        let mut world_aabb = Aabb::default();
        transform_aabb_by_matrix4(&mut world_aabb, &local, &world);
        if is_frustum_intersecting_aabb(frustum, &world_aabb) {
            out.push(root);
        }
    }

    for child in get_node_children(hierarchy, root) {
        cull_scene_node_by_frustum(out, arena, hierarchy, child, frustum);
    }
}

// Positive-vertex test: true unless the AABB lies entirely on the negative side
// of some single plane.
fn is_frustum_intersecting_aabb(frustum: &Frustum, aabb: &Aabb) -> bool {
    plane_intersects_aabb(&frustum.left, aabb)
        && plane_intersects_aabb(&frustum.right, aabb)
        && plane_intersects_aabb(&frustum.bottom, aabb)
        && plane_intersects_aabb(&frustum.top, aabb)
        && plane_intersects_aabb(&frustum.near, aabb)
        && plane_intersects_aabb(&frustum.far, aabb)
}

fn plane_intersects_aabb(plane: &Plane, aabb: &Aabb) -> bool {
    let px = if plane.a >= 0.0 {
        aabb.max.x
    } else {
        aabb.min.x
    };
    let py = if plane.b >= 0.0 {
        aabb.max.y
    } else {
        aabb.min.y
    };
    let pz = if plane.c >= 0.0 {
        aabb.max.z
    } else {
        aabb.min.z
    };
    plane.a * px + plane.b * py + plane.c * pz + plane.d >= 0.0
}

fn set_plane_normalized(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    let l = (a * a + b * b + c * c).sqrt();
    if l != 0.0 {
        let inv = 1.0 / l;
        out.a = a * inv;
        out.b = b * inv;
        out.c = c * inv;
        out.d = d * inv;
    } else {
        out.a = a;
        out.b = b;
        out.c = c;
        out.d = d;
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
    use crate::scene::create_scene;
    use crate::scene_node::create_scene_node;
    use crate::scene_node_transform::set_scene_node_position;

    // Box centered at origin with side 2 (bounds [-1, 1]).
    fn box_geometry() -> Arc<MeshGeometry> {
        #[rustfmt::skip]
        let vertices = vec![
            -1.0, -1.0, -1.0,  1.0, -1.0, -1.0,  1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
            -1.0, -1.0,  1.0,  1.0, -1.0,  1.0,  1.0, 1.0,  1.0, -1.0, 1.0,  1.0,
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
                index_count: 3,
                index_offset: 0,
            }],
            topology: PrimitiveTopology::TriangleList,
            version: 0,
            vertices,
        })
    }

    // 90-degree FOV perspective view-projection, camera at origin looking down -Z.
    fn view_projection() -> Matrix4Like {
        let f = 1.0_f32;
        let near = 0.1_f32;
        let far = 100.0_f32;
        let mut m = [0.0_f32; 16];
        m[0] = f;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1.0;
        m[14] = (2.0 * far * near) / (near - far);
        m[15] = 0.0;
        Matrix4Like { m }
    }

    fn add_mesh(scene: &mut SceneArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let s = create_mesh(scene, box_geometry(), vec![], None);
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(s, h);
        s
    }

    fn add_scene_node(scene: &mut SceneArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let s = create_scene_node(scene, None);
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(s, h);
        s
    }

    fn add_root(scene: &mut SceneArena, hierarchy: &mut HierarchyArena) -> NodeId {
        let s = create_scene(scene, None);
        let h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(s, h);
        s
    }

    // build_scene_frustum

    #[test]
    fn build_scene_frustum_writes_non_zero_plane_normals() {
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        for p in [
            &frustum.near,
            &frustum.far,
            &frustum.left,
            &frustum.right,
            &frustum.top,
            &frustum.bottom,
        ] {
            let len = (p.a * p.a + p.b * p.b + p.c * p.c).sqrt();
            assert!(len > 0.0);
        }
    }

    // cull_scene_node_by_frustum

    #[test]
    fn cull_returns_empty_when_no_meshes() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_root(&mut scene, &mut hierarchy);
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        let mut out = Vec::new();
        cull_scene_node_by_frustum(&mut out, &mut scene, &hierarchy, root, &frustum);
        assert!(out.is_empty());
    }

    #[test]
    fn cull_collects_a_mesh_in_frustum() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_root(&mut scene, &mut hierarchy);
        let mesh = add_mesh(&mut scene, &mut hierarchy);
        set_scene_node_position(&mut scene, mesh, 0.0, 0.0, -5.0);
        add_node_child(&mut hierarchy, root, mesh);
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        let mut out = Vec::new();
        cull_scene_node_by_frustum(&mut out, &mut scene, &hierarchy, root, &frustum);
        assert!(out.contains(&mesh));
    }

    #[test]
    fn cull_excludes_disabled_subtrees() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_root(&mut scene, &mut hierarchy);
        let parent = add_scene_node(&mut scene, &mut hierarchy);
        scene[parent].enabled = false;
        let mesh = add_mesh(&mut scene, &mut hierarchy);
        set_scene_node_position(&mut scene, mesh, 0.0, 0.0, -5.0);
        add_node_child(&mut hierarchy, parent, mesh);
        add_node_child(&mut hierarchy, root, parent);
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        let mut out = Vec::new();
        cull_scene_node_by_frustum(&mut out, &mut scene, &hierarchy, root, &frustum);
        assert!(!out.contains(&mesh));
        assert!(!out.contains(&parent));
    }

    #[test]
    fn cull_excludes_meshes_behind_the_camera() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_root(&mut scene, &mut hierarchy);
        let mesh = add_mesh(&mut scene, &mut hierarchy);
        set_scene_node_position(&mut scene, mesh, 0.0, 0.0, 50.0);
        add_node_child(&mut hierarchy, root, mesh);
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        let mut out = Vec::new();
        cull_scene_node_by_frustum(&mut out, &mut scene, &hierarchy, root, &frustum);
        assert!(!out.contains(&mesh));
    }

    #[test]
    fn cull_does_not_clear_out_before_appending() {
        let mut scene = SceneArena::new();
        let mut hierarchy = HierarchyArena::new();
        let root = add_root(&mut scene, &mut hierarchy);
        let mesh = add_mesh(&mut scene, &mut hierarchy);
        set_scene_node_position(&mut scene, mesh, 0.0, 0.0, -5.0);
        add_node_child(&mut hierarchy, root, mesh);
        let existing = add_scene_node(&mut scene, &mut hierarchy);
        let mut frustum = Frustum::default();
        build_scene_frustum(&mut frustum, &view_projection());
        let mut out = vec![existing];
        cull_scene_node_by_frustum(&mut out, &mut scene, &hierarchy, root, &frustum);
        assert_eq!(out.len(), 2);
    }
}
