//! Scene pick ray — nearest Mesh hit, returning a `SceneHit`.
//!
//! Ports `@flighthq/picking` `pickScene.ts` 1:1.

use flighthq_camera::get_camera_screen_to_world_ray;
use flighthq_geometry::{
    get_ray3d_point_at, intersect_ray3d_aabb, intersect_ray3d_triangle, inverse_matrix4,
    matrix4_transform_point, transform_aabb_by_matrix4,
};
use flighthq_mesh::{
    get_mesh_geometry_index, get_mesh_geometry_triangle_count, get_mesh_geometry_vertex_position,
};
use flighthq_node::{HierarchyArena, NodeId};
use flighthq_scene::{SceneArena, get_scene_node_world_matrix};
use flighthq_types::{Aabb, Camera, Matrix4Like, MeshGeometry, Ray3D, Vector3, Vector3Like};

// ---------------------------------------------------------------------------
// SceneHit
// ---------------------------------------------------------------------------

/// Result of a successful scene pick (a camera ray hitting a mesh node's
/// geometry). `distance` is the parametric `t` along the pick ray in world
/// units (the world-space hit point is `point_*`). `u`/`v`/`w` are the
/// barycentric weights of the hit triangle's first/second/third vertex, so
/// the hit point is `u*A + v*B + w*C` with `u + v + w == 1`.
///
/// Ports `SceneHit` from `@flighthq/types`.
#[derive(Clone, Debug, Default)]
pub struct SceneHit {
    /// Arena key of the mesh node that was hit.
    pub node: NodeId,
    pub distance: f32,
    pub u: f32,
    pub v: f32,
    pub w: f32,
    pub point_x: f32,
    pub point_y: f32,
    pub point_z: f32,
}

// ---------------------------------------------------------------------------
// pick_scene
// ---------------------------------------------------------------------------

/// Resolves the nearest mesh hit by a camera pick ray through the scene,
/// returning `Some(SceneHit)` for the closest hit or `None` on a miss
/// (sentinel — never throws).
///
/// `meshes` is a caller-supplied list of `(NodeId, MeshGeometry)` pairs.
/// Each `NodeId` must have a corresponding entry in `world_arena` (for world
/// transforms) and `hierarchy` (for parent links used by world-matrix
/// accumulation).
///
/// `screen_x`/`screen_y` are NDC coordinates in `[-1, 1]`
/// (center = 0, top-right = (1, 1)). `aspect` is viewport width / height.
///
/// Broad-phase: per-mesh world-AABB slab test (skipped conservatively when
/// `geometry.bounds` is `None`). Narrow-phase: Möller–Trumbore ray↔triangle
/// test in mesh-local space (one inverse-matrix per mesh, not per vertex),
/// so the parametric `t` stays in world-ray units and is comparable across
/// meshes.
///
/// Alias-safe: only returns on a hit; on a miss `None` is returned.
///
/// Ports `pickScene` from `@flighthq/picking`.
pub fn pick_scene(
    meshes: &[(NodeId, MeshGeometry)],
    world_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
    camera: &Camera,
    screen_x: f32,
    screen_y: f32,
    aspect: f32,
) -> Option<SceneHit> {
    let mut world_ray = Ray3D::default();
    if !get_camera_screen_to_world_ray(&mut world_ray, camera, screen_x, screen_y, aspect) {
        return None;
    }

    let mut best_t = f32::INFINITY;
    let mut result: Option<SceneHit> = None;

    for (node_id, geometry) in meshes {
        let node_id = *node_id;

        // Accumulate the world matrix for this node.
        let world_m = get_scene_node_world_matrix(world_arena, hierarchy, node_id).clone();
        let world_m_like = Matrix4Like { m: world_m.m };

        // Broad-phase: skip meshes whose world AABB the ray cannot reach.
        // When bounds are absent the broad-phase is skipped (conservative pass-through).
        if let Some(local_bounds) = &geometry.bounds {
            let mut world_bounds = Aabb::default();
            transform_aabb_by_matrix4(&mut world_bounds, local_bounds, &world_m_like);
            if intersect_ray3d_aabb(&world_ray, &world_bounds) < 0.0 {
                continue;
            }
        }

        // Narrow-phase: transform the ray into mesh-local space.
        // Requires an invertible world matrix.
        let mut inv_world = Matrix4Like::default();
        if !inverse_matrix4(&mut inv_world, &world_m_like) {
            continue;
        }

        let world_origin = Vector3Like {
            x: world_ray.origin.x,
            y: world_ray.origin.y,
            z: world_ray.origin.z,
        };
        let world_dir = Vector3Like {
            x: world_ray.direction.x,
            y: world_ray.direction.y,
            z: world_ray.direction.z,
        };

        let mut local_origin = Vector3Like::default();
        let mut local_dir = Vector3Like::default();
        // Point transform (includes translation).
        matrix4_transform_point(&mut local_origin, &inv_world, &world_origin);
        // Direction transform (no translation, so t stays in world-ray units).
        transform_direction_by_matrix4(&mut local_dir, &inv_world, &world_dir);

        let local_ray = Ray3D {
            origin: Vector3 {
                x: local_origin.x,
                y: local_origin.y,
                z: local_origin.z,
            },
            direction: Vector3 {
                x: local_dir.x,
                y: local_dir.y,
                z: local_dir.z,
            },
        };

        // Iterate every triangle in the mesh.
        let triangle_count = get_mesh_geometry_triangle_count(geometry);
        for tri in 0..triangle_count {
            let base = tri * 3;
            let i0 = match get_mesh_geometry_index(geometry, base) {
                Some(i) => i,
                None => continue,
            };
            let i1 = match get_mesh_geometry_index(geometry, base + 1) {
                Some(i) => i,
                None => continue,
            };
            let i2 = match get_mesh_geometry_index(geometry, base + 2) {
                Some(i) => i,
                None => continue,
            };

            let mut a = Vector3Like::default();
            let mut b = Vector3Like::default();
            let mut c = Vector3Like::default();
            if !get_mesh_geometry_vertex_position(&mut a, geometry, i0) {
                continue;
            }
            if !get_mesh_geometry_vertex_position(&mut b, geometry, i1) {
                continue;
            }
            if !get_mesh_geometry_vertex_position(&mut c, geometry, i2) {
                continue;
            }

            let t = intersect_ray3d_triangle(&local_ray, &a, &b, &c);
            if t < 0.0 || t >= best_t {
                continue;
            }

            best_t = t;

            // World-space hit point.
            let mut world_hit = Vector3Like::default();
            get_ray3d_point_at(&mut world_hit, &world_ray, t);

            // Local-space hit point for barycentric weights.
            let mut local_hit = Vector3Like::default();
            get_ray3d_point_at(&mut local_hit, &local_ray, t);

            let mut hit = SceneHit {
                node: node_id,
                distance: t,
                point_x: world_hit.x,
                point_y: world_hit.y,
                point_z: world_hit.z,
                ..SceneHit::default()
            };
            write_barycentric(&mut hit, &local_hit, &a, &b, &c);
            result = Some(hit);
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Fills `out.u/v/w` with the barycentric weights of `p` within triangle
/// `a,b,c` (weights of a, b, c respectively; `p = u*a + v*b + w*c`).
/// Degenerate triangles collapse to `(1, 0, 0)`.
///
/// Ports `writeBarycentric` from `@flighthq/picking`.
fn write_barycentric(
    out: &mut SceneHit,
    p: &Vector3Like,
    a: &Vector3Like,
    b: &Vector3Like,
    c: &Vector3Like,
) {
    let v0x = b.x - a.x;
    let v0y = b.y - a.y;
    let v0z = b.z - a.z;
    let v1x = c.x - a.x;
    let v1y = c.y - a.y;
    let v1z = c.z - a.z;
    let v2x = p.x - a.x;
    let v2y = p.y - a.y;
    let v2z = p.z - a.z;
    let d00 = v0x * v0x + v0y * v0y + v0z * v0z;
    let d01 = v0x * v1x + v0y * v1y + v0z * v1z;
    let d11 = v1x * v1x + v1y * v1y + v1z * v1z;
    let d20 = v2x * v0x + v2y * v0y + v2z * v0z;
    let d21 = v2x * v1x + v2y * v1y + v2z * v1z;
    let denom = d00 * d11 - d01 * d01;
    if denom == 0.0 {
        out.u = 1.0;
        out.v = 0.0;
        out.w = 0.0;
        return;
    }
    let inv = 1.0 / denom;
    let v = (d11 * d20 - d01 * d21) * inv;
    let w = (d00 * d21 - d01 * d20) * inv;
    out.u = 1.0 - v - w;
    out.v = v;
    out.w = w;
}

/// Transforms a direction vector (w = 0, translation ignored) by a column-major
/// 4×4 matrix into `out`. The result is intentionally not normalized so a
/// ray's parametric `t` is preserved across the world↔local transform.
/// Alias-safe: reads all inputs before writing `out`.
fn transform_direction_by_matrix4(out: &mut Vector3Like, m: &Matrix4Like, d: &Vector3Like) {
    let x = d.x;
    let y = d.y;
    let z = d.z;
    out.x = m.m[0] * x + m.m[4] * y + m.m[8] * z;
    out.y = m.m[1] * x + m.m[5] * y + m.m[9] * z;
    out.z = m.m[2] * x + m.m[6] * y + m.m[10] * z;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::f32::consts::PI;

    use flighthq_camera::{
        create_camera, create_perspective_projection, set_camera_view_matrix4_from_look_at,
    };
    use flighthq_mesh::create_box_mesh_geometry;
    use flighthq_node::{HierarchyNode, NodeArena};
    use flighthq_scene::create_scene_node;
    use flighthq_types::{Camera, Vector3};

    use super::*;

    /// Builds a camera at (0, 0, 5) looking at the origin down -Z.
    fn make_camera() -> Camera {
        let mut camera = create_camera(0.1, 100.0, create_perspective_projection(PI / 2.0, 1.0));
        set_camera_view_matrix4_from_look_at(
            &mut camera,
            &Vector3 {
                x: 0.0,
                y: 0.0,
                z: 5.0,
            },
            &Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            &Vector3 {
                x: 0.0,
                y: 1.0,
                z: 0.0,
            },
        );
        camera
    }

    /// Builds a SceneArena + HierarchyArena with a single root node at identity,
    /// and a 2×2×2 box mesh centered at the origin.
    fn make_scene() -> (SceneArena, HierarchyArena, NodeId, MeshGeometry) {
        let mut world_arena = SceneArena::new();
        let mut hierarchy = NodeArena::<HierarchyNode>::new();

        // Insert paired scene + hierarchy nodes so their NodeIds align.
        let node_id = create_scene_node(&mut world_arena, None);
        let h_id = hierarchy.insert(HierarchyNode::default());
        assert_eq!(node_id, h_id, "scene and hierarchy node ids must align");

        let geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        (world_arena, hierarchy, node_id, geometry)
    }

    fn close(a: f32, b: f32, eps: f32) {
        assert!((a - b).abs() < eps, "expected {b} ± {eps}, got {a}");
    }

    // pick_scene

    #[test]
    fn pick_scene_returns_hit_for_center_ray() {
        let camera = make_camera();
        let (mut world_arena, hierarchy, node_id, geometry) = make_scene();

        let hit = pick_scene(
            &[(node_id, geometry)],
            &mut world_arena,
            &hierarchy,
            &camera,
            0.0,
            0.0,
            1.0,
        );

        assert!(hit.is_some(), "expected a hit");
        let hit = hit.unwrap();
        assert_eq!(hit.node, node_id, "hit node should be the mesh node");
        // Front face of a 2×2×2 box centred at the origin is at z = 1;
        // the ray travels -Z from z = 5.
        close(hit.point_z, 1.0, 3e-3);
        close(hit.point_x, 0.0, 3e-3);
        close(hit.point_y, 0.0, 3e-3);
        assert!(hit.distance > 0.0, "distance must be positive");
    }

    #[test]
    fn pick_scene_barycentric_weights_sum_to_one() {
        let camera = make_camera();
        let (mut world_arena, hierarchy, node_id, geometry) = make_scene();

        let hit = pick_scene(
            &[(node_id, geometry)],
            &mut world_arena,
            &hierarchy,
            &camera,
            0.0,
            0.0,
            1.0,
        );

        assert!(hit.is_some(), "expected a hit");
        let hit = hit.unwrap();
        close(hit.u + hit.v + hit.w, 1.0, 1e-5);
    }

    #[test]
    fn pick_scene_returns_none_for_empty_mesh_list() {
        let camera = make_camera();
        let (mut world_arena, hierarchy, _, _) = make_scene();

        assert!(pick_scene(&[], &mut world_arena, &hierarchy, &camera, 0.0, 0.0, 1.0).is_none());
    }

    #[test]
    fn pick_scene_returns_none_when_ray_misses() {
        let camera = make_camera();
        let (mut world_arena, hierarchy, node_id, geometry) = make_scene();

        // Far corner of the viewport points away from the small centred box.
        assert!(
            pick_scene(
                &[(node_id, geometry)],
                &mut world_arena,
                &hierarchy,
                &camera,
                0.99,
                0.99,
                1.0,
            )
            .is_none()
        );
    }
}
