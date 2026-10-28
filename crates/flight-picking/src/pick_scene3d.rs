//! Camera-ray and world-ray scene selection (TS `pickScene3D.ts`): per-node world AABB broad-phase,
//! then a brute-force ray↔triangle narrow-phase over each candidate Mesh's current geometry.
//!
//! Re-entrant: the source's module-level scratch (its C/C++ port note) is per-call stack storage
//! here, so no hidden state is shared between picks. World matrices resolve through the caller-owned
//! node revision source (D5).

// flight-lint: allow-file(contract-vocabulary) D16 native NodeRef retains the original open Mesh allocation through the scene's own Node3D narrowing

use std::cmp::Ordering;
use std::sync::Arc;

use flight_camera::{Camera3D, Projection, get_camera_3d_screen_to_world_ray};
use flight_entity::allocate_entity;
use flight_geometry::{
    Matrix4, Ray3D, Vector3, create_aabb, create_ray3d, create_vector3, get_ray3d_point_at,
    intersect_ray3d_aabb, intersect_ray3d_triangle, inverse_matrix4, transform_aabb_by_matrix4,
};
use flight_meshgeometry::{
    MeshTriangleVertexIndices, get_mesh_geometry_triangle_count,
    get_mesh_geometry_triangle_vertex_indices, get_mesh_geometry_vertex_position,
};
use flight_node::contract::get_node_world_matrix4;
use flight_node::{Node, NodeRef};
use flight_scene3d::contract::{get_mesh_runtime, get_node3d_world_bounds};
use flight_scene3d::{Mesh, NODE3D_TRAITS_KEY, Node3DNarrow};

use crate::types::{Scene3DHit, Scene3DPickOptions};

/// Allocates a zeroed Scene3DHit (TS `createScene3DHit`). Handy for the `out` of
/// `pick_scene3d`/`pick_scene3d_with_ray3d` and for growing the `out_array` of the multi-hit
/// queries. `node` is `None` until a pick fills it.
pub fn create_scene3d_hit() -> Scene3DHit {
    let mut out: Scene3DHit = allocate_entity();
    initialize_scene3d_hit(&mut out);
    return out;
}

/// Writes the zeroed hit state into `out` (TS `initializeScene3DHit`), the construction
/// initializer of `create_scene3d_hit`.
pub fn initialize_scene3d_hit(out: &mut Scene3DHit) {
    out.distance = 0.0;
    out.node = None;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.point_x = 0.0;
    out.point_y = 0.0;
    out.point_z = 0.0;
    out.triangle_index = -1;
    out.u = 0.0;
    out.v = 0.0;
    out.w = 0.0;
}

// Unprojects a camera pick ray into `out`. Orthographic projections ignore `aspect` (their extents
// are the half-width/half-height on the descriptor), so the passed value only matters for
// perspective, where it must be the projection's own aspect to avoid a horizontal ray skew.
fn build_camera_pick_ray(out: &mut Ray3D, camera: &Camera3D, screen_x: f32, screen_y: f32) -> bool {
    let aspect = match &camera.projection {
        Projection::Perspective(projection) => projection.read().unwrap().aspect,
        _ => 1.0,
    };
    return get_camera_3d_screen_to_world_ray(out, camera, screen_x, screen_y, aspect);
}

// Ascending-distance comparator for the stable all-hit sort. Incomparable distances order as
// equal, as the source's `a.distance - b.distance` comparator does.
fn compare_scene3d_hit_by_distance(a: &Scene3DHit, b: &Scene3DHit) -> Ordering {
    return a
        .distance
        .partial_cmp(&b.distance)
        .unwrap_or(Ordering::Equal);
}

// Field-copies the hit payload of `src` into `out`. The destination keeps its own Entity identity
// (runtime slot); only the result fields, including the shared Mesh node handle, are copied.
fn copy_scene3d_hit(out: &mut Scene3DHit, src: &Scene3DHit) {
    out.node = src.node.clone();
    out.distance = src.distance;
    out.triangle_index = src.triangle_index;
    out.u = src.u;
    out.v = src.v;
    out.w = src.w;
    out.point_x = src.point_x;
    out.point_y = src.point_y;
    out.point_z = src.point_z;
    out.normal_x = src.normal_x;
    out.normal_y = src.normal_y;
    out.normal_z = src.normal_z;
}

// Walks every enabled Mesh in the scene, tests `ray` against its triangles under `options`, and
// calls `on_hit` once per passing triangle with the fully-populated per-call hit scratch. Disabled
// nodes (`enabled == false`) prune their whole subtree, mirroring scene culling; the `predicate`
// option excludes an individual mesh without pruning its descendants. `on_hit` must consume the
// hit before it returns — the scratch is overwritten on the next triangle.
fn for_each_scene3d_ray_hit(
    scene: &NodeRef,
    ray: &Ray3D,
    options: Option<&Scene3DPickOptions>,
    on_hit: &mut dyn FnMut(&Scene3DHit),
) {
    let predicate = options.and_then(|o| o.predicate.as_ref());
    let max_distance = options
        .and_then(|o| o.max_distance)
        .unwrap_or(f32::INFINITY);
    let cull_backfaces = options.and_then(|o| o.cull_backfaces).unwrap_or(false);
    let mut hit = create_scene3d_hit();
    pick_node(
        scene,
        ray,
        predicate,
        max_distance,
        cull_backfaces,
        &mut hit,
        on_hit,
    );
}

// Broad-phase (world AABB) then brute-force ray↔triangle narrow-phase for one mesh, reporting each
// passing triangle through `on_hit`.
//
// The broad-phase prefers the POSED local bounds a deform pass wrote to the mesh runtime
// (deformed_local_bounds), transformed to world — so a GPU-skinned mesh whose limb has swung outside
// its bind box is not wrongly rejected before its triangles are ever tested. It reads that slot as
// plain data (no skinning code, so picking keeps its dependency set), falling back to the
// bind-pose world bounds for a rigid or unprepared mesh. The NARROW-phase, however, tests
// geometry.vertices — which stay BIND POSE for a GPU-skinned mesh (the GPU deforms in-shader). So
// exact triangle picking of a skinned mesh requires the app to CPU-skin it first (update_mesh_skin,
// which writes posed vertices and bumps the version); without that, the posed broad-phase admits
// the mesh but the triangle test runs against the bind pose. A morph-only mesh needs nothing extra
// — its blend writes real vertices, so both phases are posed.
fn intersect_mesh_triangles(
    node: &NodeRef,
    ray: &Ray3D,
    max_distance: f32,
    cull_backfaces: bool,
    hit: &mut Scene3DHit,
    on_hit: &mut dyn FnMut(&Scene3DHit),
) {
    let (geometry, posed_local_bounds) = {
        let guard = node.read().unwrap();
        let Some(mesh) = narrow_mesh(&*guard) else {
            return;
        };
        (
            mesh.geometry.clone(),
            get_mesh_runtime(mesh).deformed_local_bounds.clone(),
        )
    };
    let mut world_bounds = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if let Some(posed_local_bounds) = &posed_local_bounds {
        let world_matrix = get_node_world_matrix4(node);
        transform_aabb_by_matrix4(&mut world_bounds, posed_local_bounds, &world_matrix);
    } else {
        get_node3d_world_bounds(&mut world_bounds, node);
    }
    if intersect_ray3d_aabb(ray, &world_bounds) < 0.0 {
        return;
    }

    let world_matrix = get_node_world_matrix4(node);
    let mut inverse_world = world_matrix.clone();
    if !inverse_matrix4(&mut inverse_world, &world_matrix) {
        return;
    }
    let mut local_ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    transform_point_by_matrix4(&mut local_ray.origin, &ray.origin, &inverse_world);
    transform_direction_by_matrix4(&mut local_ray.direction, &ray.direction, &inverse_world);

    let mut triangle_indices = MeshTriangleVertexIndices {
        i0: 0,
        i1: 0,
        i2: 0,
    };
    let mut a = create_vector3(0.0, 0.0, 0.0);
    let mut b = create_vector3(0.0, 0.0, 0.0);
    let mut c = create_vector3(0.0, 0.0, 0.0);
    let mut wa = create_vector3(0.0, 0.0, 0.0);
    let mut wb = create_vector3(0.0, 0.0, 0.0);
    let mut wc = create_vector3(0.0, 0.0, 0.0);
    let mut world_normal = create_vector3(0.0, 0.0, 0.0);
    let mut world_point = create_vector3(0.0, 0.0, 0.0);
    let mut local_point = create_vector3(0.0, 0.0, 0.0);
    let geometry = geometry.read().unwrap();
    let triangle_count = get_mesh_geometry_triangle_count(&geometry);
    for triangle in 0..triangle_count {
        if !get_mesh_geometry_triangle_vertex_indices(&mut triangle_indices, &geometry, triangle) {
            continue;
        }
        get_mesh_geometry_vertex_position(&mut a, &geometry, triangle_indices.i0);
        get_mesh_geometry_vertex_position(&mut b, &geometry, triangle_indices.i1);
        get_mesh_geometry_vertex_position(&mut c, &geometry, triangle_indices.i2);

        let t = intersect_ray3d_triangle(&local_ray, &a, &b, &c);
        if t < 0.0 || t > max_distance {
            continue;
        }

        // World-space geometric face normal (normalized cross of two world edges). Transforming the
        // three verts by the world matrix — rather than the local normal by the inverse-transpose —
        // keeps the sign correct under mirroring/negative scale and yields the world normal directly.
        transform_point_by_matrix4(&mut wa, &a, &world_matrix);
        transform_point_by_matrix4(&mut wb, &b, &world_matrix);
        transform_point_by_matrix4(&mut wc, &c, &world_matrix);
        if !write_face_normal(&mut world_normal, &wa, &wb, &wc) {
            continue;
        }

        // Back-facing when the ray runs along the same side as the normal (dot > 0). Only the sign
        // matters, so the un-normalized ray direction is fine here.
        if cull_backfaces
            && ray.direction.x * world_normal.x
                + ray.direction.y * world_normal.y
                + ray.direction.z * world_normal.z
                > 0.0
        {
            continue;
        }

        hit.node = Some(node.clone());
        hit.distance = t;
        hit.triangle_index = triangle as i32;
        hit.normal_x = world_normal.x;
        hit.normal_y = world_normal.y;
        hit.normal_z = world_normal.z;
        get_ray3d_point_at(&mut world_point, ray, t);
        hit.point_x = world_point.x;
        hit.point_y = world_point.y;
        hit.point_z = world_point.z;
        get_ray3d_point_at(&mut local_point, &local_ray, t);
        write_barycentric(hit, &local_point, &a, &b, &c);
        on_hit(hit);
    }
}

// Narrows a scene node to the Mesh it is, through the scene's own Node3D family dispatch.
pub(crate) fn narrow_mesh(node: &dyn Node) -> Option<&Mesh> {
    let traits = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    let narrow = traits.narrow.downcast_ref::<Node3DNarrow>()?;
    return (narrow.as_node3d)(node)?.as_mesh();
}

// Depth-first pruning walk: a disabled node contributes nothing and skips its subtree; an enabled
// Mesh is narrow-phase tested; every enabled node's children are descended.
fn pick_node(
    node: &NodeRef,
    ray: &Ray3D,
    predicate: Option<&Arc<dyn Fn(&Mesh) -> bool + Send + Sync>>,
    max_distance: f32,
    cull_backfaces: bool,
    hit: &mut Scene3DHit,
    on_hit: &mut dyn FnMut(&Scene3DHit),
) {
    let (test_mesh, children) = {
        let guard = node.read().unwrap();
        if !guard.node_fields().enabled {
            return;
        }
        let test_mesh = narrow_mesh(&*guard).is_some_and(|mesh| {
            return predicate.is_none_or(|predicate| predicate(mesh));
        });
        (test_mesh, guard.node_runtime().children.clone())
    };
    if test_mesh {
        intersect_mesh_triangles(node, ray, max_distance, cull_backfaces, hit, on_hit);
    }
    if let Some(children) = children {
        for child in &children {
            pick_node(
                child,
                ray,
                predicate,
                max_distance,
                cull_backfaces,
                hit,
                on_hit,
            );
        }
    }
}

/// Resolves the nearest Mesh hit by a camera pick ray through a scene, filling `out` and returning
/// true, or false on a miss (sentinel, not a panic) (TS `pickScene3D`). `screen_x`/`screen_y` are
/// normalized device coordinates in [-1, 1] (the viewport→NDC mapping is the caller's
/// responsibility, mirroring the camera unproject). A thin wrapper: it unprojects the camera ray,
/// then delegates to `pick_scene3d_with_ray3d`.
///
/// Alias-safe: `out` is only written when a hit is found; on a miss `out` is untouched.
// flight-lint: allow(conform-params) D9b out-first
pub fn pick_scene3d(
    out: &mut Scene3DHit,
    scene: &NodeRef,
    camera: &Camera3D,
    screen_x: f32,
    screen_y: f32,
    options: Option<&Scene3DPickOptions>,
) -> bool {
    let mut camera_ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if !build_camera_pick_ray(&mut camera_ray, camera, screen_x, screen_y) {
        return false;
    }
    return pick_scene3d_with_ray3d(out, scene, &camera_ray, options);
}

/// Collects every Mesh hit by a camera pick ray into `out_array`, sorted by ascending distance (TS
/// `pickScene3DAll`). A thin wrapper over `pick_scene3d_all_with_ray3d` that first unprojects the
/// camera ray; on an unprojectable camera the array is emptied.
// flight-lint: allow(conform-params) D9b out-first
pub fn pick_scene3d_all(
    out_array: &mut Vec<Scene3DHit>,
    scene: &NodeRef,
    camera: &Camera3D,
    screen_x: f32,
    screen_y: f32,
    options: Option<&Scene3DPickOptions>,
) {
    let mut camera_ray = create_ray3d(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if !build_camera_pick_ray(&mut camera_ray, camera, screen_x, screen_y) {
        out_array.clear();
        return;
    }
    pick_scene3d_all_with_ray3d(out_array, scene, &camera_ray, options);
}

/// Collects every Mesh hit by a world-space `ray` into `out_array`, sorted by ascending distance
/// (TS `pickScene3DAllWithRay3D`); its length is set to the hit count (empty on a miss). Existing
/// slots are reused and new ones allocated as needed, so the array can be kept and refilled across
/// picks. The general primitive behind `pick_scene3d_all`; the ray need not be unit-length (see
/// `Scene3DPickOptions`).
// flight-lint: allow(conform-params) D9b out-first
pub fn pick_scene3d_all_with_ray3d(
    out_array: &mut Vec<Scene3DHit>,
    scene: &NodeRef,
    ray: &Ray3D,
    options: Option<&Scene3DPickOptions>,
) {
    let mut count = 0;
    for_each_scene3d_ray_hit(scene, ray, options, &mut |hit| {
        if count == out_array.len() {
            out_array.push(create_scene3d_hit());
        }
        copy_scene3d_hit(&mut out_array[count], hit);
        count += 1;
    });
    out_array.truncate(count);
    out_array.sort_by(compare_scene3d_hit_by_distance);
}

/// Resolves the nearest Mesh hit by a world-space `ray` through a scene, filling `out` and returning
/// true, or false on a miss (TS `pickScene3DWithRay3D`). The general primitive behind
/// `pick_scene3d`: `pick_scene3d` builds the ray from a camera and delegates here. The ray direction
/// need not be unit-length; `t` (and `out.distance`) is in direction-length units.
///
/// Bronze precision: per-node broad-phase against the world AABB, then a brute-force ray↔triangle
/// test over the candidate `MeshGeometry` (a per-`MeshGeometry` BVH is a later additive
/// optimization). The ray is transformed into each mesh's local space (one inverse matrix per mesh)
/// rather than every vertex into world space; the local direction is intentionally left
/// un-normalized so the parametric `t` stays in world-ray units and is comparable across meshes.
///
/// Alias-safe: `out` is only written when a nearer hit is found; on a miss `out` is untouched.
// flight-lint: allow(conform-params) D9b out-first
pub fn pick_scene3d_with_ray3d(
    out: &mut Scene3DHit,
    scene: &NodeRef,
    ray: &Ray3D,
    options: Option<&Scene3DPickOptions>,
) -> bool {
    let mut found = false;
    let mut best_t = f32::INFINITY;
    for_each_scene3d_ray_hit(scene, ray, options, &mut |hit| {
        if hit.distance >= best_t {
            return;
        }
        best_t = hit.distance;
        found = true;
        copy_scene3d_hit(out, hit);
    });
    return found;
}

// Transforms a direction (w = 0, translation ignored) by a column-major 4x4 matrix into `out`. The
// result is intentionally not normalized so a ray's parametric `t` is preserved across the
// world↔local transform.
fn transform_direction_by_matrix4(out: &mut Vector3, d: &Vector3, matrix: &Matrix4) {
    let m = &matrix.m;
    let x = d.x;
    let y = d.y;
    let z = d.z;
    out.x = m[0] * x + m[4] * y + m[8] * z;
    out.y = m[1] * x + m[5] * y + m[9] * z;
    out.z = m[2] * x + m[6] * y + m[10] * z;
}

// Transforms a point (w = 1) by a column-major 4x4 matrix into `out`.
fn transform_point_by_matrix4(out: &mut Vector3, p: &Vector3, matrix: &Matrix4) {
    let m = &matrix.m;
    let x = p.x;
    let y = p.y;
    let z = p.z;
    out.x = m[0] * x + m[4] * y + m[8] * z + m[12];
    out.y = m[1] * x + m[5] * y + m[9] * z + m[13];
    out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
}

// Fills `out.u/v/w` with the barycentric weights of `p` within triangle `a,b,c` (weights of a, b, c
// respectively; `p = u*a + v*b + w*c`). Degenerate triangles collapse to `(1, 0, 0)`.
fn write_barycentric(out: &mut Scene3DHit, p: &Vector3, a: &Vector3, b: &Vector3, c: &Vector3) {
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

// Writes the unit geometric face normal of triangle `a,b,c` (normalized `(b-a) × (c-a)`) into `out`,
// returning false for a degenerate (zero-area) triangle, in which case `out` is left untouched.
fn write_face_normal(out: &mut Vector3, a: &Vector3, b: &Vector3, c: &Vector3) -> bool {
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e1z = b.z - a.z;
    let e2x = c.x - a.x;
    let e2y = c.y - a.y;
    let e2z = c.z - a.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    let length_squared = nx * nx + ny * ny + nz * nz;
    if length_squared == 0.0 {
        return false;
    }
    let inv = 1.0 / length_squared.sqrt();
    out.x = nx * inv;
    out.y = ny * inv;
    out.z = nz * inv;
    return true;
}
