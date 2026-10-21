//! picking-owned declarations (TS `Scene3DHit.ts`, `Scene3DPickOptions.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 native NodeRef retains the original open Mesh allocation; the predicate is a canonical Arc callback

use std::sync::Arc;

use flight_entity::EntityRuntimeSlot;
use flight_node::NodeRef;
use flight_scene3d::Mesh;

/// Result of a successful scene pick (TS `Scene3DHit`, an Entity): a camera or world ray hitting a
/// Mesh's geometry. `distance` is the parametric `t` along the pick ray in world units (the
/// world-space hit point is `point`). `triangle_index` is the zero-based index of the hit triangle
/// within the mesh's geometry (the i-th triangle in index order). `u`/`v`/`w` are the barycentric
/// weights of that triangle's first/second/third vertex, so the hit point is `u*A + v*B + w*C` with
/// `u + v + w == 1`. `normal_x`/`normal_y`/`normal_z` are the triangle's unit geometric face normal
/// in world space (the normalized cross product of two edges), matching the flat-scalar shape of
/// `point_x/y/z`. `node` is the hit Mesh's own node handle: `None` on a freshly allocated hit and
/// `Some` after a successful pick fills the result.
#[derive(Clone, Default)]
pub struct Scene3DHit {
    runtime: EntityRuntimeSlot,
    pub node: Option<NodeRef>,
    pub distance: f32,
    pub triangle_index: i32,
    pub u: f32,
    pub v: f32,
    pub w: f32,
    pub point_x: f32,
    pub point_y: f32,
    pub point_z: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    pub normal_z: f32,
}

/// Options for a scene pick raycast (TS `Scene3DPickOptions`). `predicate` is an include/exclude
/// test per mesh (it does not prune the mesh's descendants); `max_distance` rejects hits whose
/// ray-parametric distance `t` exceeds it (in the ray's direction-length units — world distance for
/// a unit-length camera ray); `cull_backfaces` discards back-facing triangle hits (the default is
/// double-sided).
#[derive(Clone, Default)]
pub struct Scene3DPickOptions {
    pub cull_backfaces: Option<bool>,
    pub max_distance: Option<f32>,
    pub predicate: Option<Arc<dyn Fn(&Mesh) -> bool + Send + Sync>>,
}

flight_entity::impl_entity!(Scene3DHit);
