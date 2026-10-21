//! 3D picking (TS `@flighthq/picking`): camera-ray scene selection, a world AABB broad-phase plus a
//! brute-force ray↔triangle narrow-phase, and on-demand hit surface attributes.
//!
//! The construction initializer is available through `contract`.
//! ```compile_fail
//! use flight_picking::initialize_scene3d_hit;
//! ```

mod pick_scene3d;
mod scene_hit_attributes;
mod sugar;
mod types;

pub mod contract;

// Public lane: the named exports of the pinned TS `index.ts` plus the public `Scene3DHit` and
// `Scene3DPickOptions` types. The construction initializer stays under `contract`.
pub use contract::Scene3DHit;
pub use contract::Scene3DPickMethods;
pub use contract::Scene3DPickOptions;
pub use contract::create_scene3d_hit;
pub use contract::get_scene3d_hit_material;
pub use contract::get_scene3d_hit_subset_index;
pub use contract::get_scene3d_hit_uv0;
pub use contract::get_scene3d_hit_vertex_normal;
pub use contract::get_scene3d_hit_vertex_tangent;
pub use contract::is_scene3d_hit_front_facing;
pub use contract::pick_scene3d;
pub use contract::pick_scene3d_all;
pub use contract::pick_scene3d_all_with_ray3d;
pub use contract::pick_scene3d_with_ray3d;
