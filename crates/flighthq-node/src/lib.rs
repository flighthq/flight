//! `flighthq-node` — scene graph core.
//!
//! Provides the fundamental building blocks for every scene graph family in
//! the Flight SDK: node identifiers, hierarchy management, 2D and 3D
//! transforms, bounds rectangles, appearance properties, and the combined
//! [`Spatial2DNode`] struct.
//!
//! # Design
//!
//! - All mutable state lives in [`NodeArena<T>`] (a `slotmap::SlotMap`).
//! - Operations are free functions taking `(&mut NodeArena<T>, NodeId)`.
//! - Matrices and bounds are lazily recomputed using revision IDs — no
//!   work happens until the value is actually needed.
//! - No global state, no side effects at module top level.

pub mod appearance;
pub mod bounds;
pub mod bounds_rectangle;
pub mod hierarchy;
pub mod invalidation;
pub mod node;
pub mod node_id;
pub mod revision;
pub mod scene;
pub mod spatial2d;
pub mod traits;
pub mod transform2d;
pub mod transform3d;
pub mod traversal;
pub mod viewport;

// ---------------------------------------------------------------------------
// Re-exports — public surface at the crate root
// ---------------------------------------------------------------------------

// node_id
pub use node_id::{NodeArena, NodeId};

// invalidation
pub use invalidation::{DIRTY_SENTINEL, is_dirty, next_revision};

// hierarchy
pub use hierarchy::{
    HierarchyNode, add_node_child, add_node_child_at, add_node_children, contains_node_child,
    detach_node, get_node_child_at, get_node_child_by_name, get_node_child_count,
    get_node_child_index, get_node_children, get_node_depth, get_node_parent, get_node_root,
    remove_node_child, remove_node_child_at, remove_node_children, set_node_child_index,
    swap_node_children, swap_node_children_at,
};

// appearance
pub use appearance::{
    GraphAppearanceNode, get_node_alpha, get_node_appearance_revision, get_node_blend_mode,
    get_node_visible, invalidate_node_appearance, set_node_alpha, set_node_blend_mode,
    set_node_visible,
};

// bounds
pub use bounds::{
    BoundsNode, get_bounds_node_local_bounds_revision, get_bounds_node_local_content_revision,
    get_node_bounds, get_node_local_bounds_revision, get_node_world_bounds,
    get_node_world_bounds_revision, invalidate_bounds_node_local_bounds,
    invalidate_bounds_node_local_content, invalidate_node_bounds, is_node_bounds_dirty,
    is_node_world_bounds_dirty, set_node_bounds, set_node_world_bounds,
};

// transform2d
pub use transform2d::{
    Transform2DNode, convert_node_vector2_global_to_local, convert_node_vector2_local_to_global,
    ensure_node_local_transform_matrix, ensure_node_world_transform_matrix,
    get_node_local_transform_matrix, get_node_local_transform_revision, get_node_transform2d,
    get_node_world_matrix, get_node_world_transform_matrix, get_node_world_transform_revision,
    invalidate_node_transform, propagate_node_transforms, set_node_transform2d,
};

// transform3d
pub use transform3d::{
    Transform3DNode, convert_node_vector3_global_to_local, convert_node_vector3_local_to_global,
    ensure_node_world_transform_matrix4, get_node_local_transform3d_revision,
    get_node_world_transform_matrix4, get_node_world_transform3d_revision,
    invalidate_node_transform3d, propagate_node_transforms3d, set_node_transform3d,
};

// spatial2d
pub use spatial2d::{
    Spatial2DArena, Spatial2DNode, add_spatial2d_child, add_spatial2d_child_at,
    contains_spatial2d_child, detach_spatial2d_node, get_spatial2d_alpha, get_spatial2d_blend_mode,
    get_spatial2d_child_at, get_spatial2d_child_count, get_spatial2d_parent, get_spatial2d_root,
    get_spatial2d_visible, remove_spatial2d_child, set_spatial2d_alpha, set_spatial2d_blend_mode,
    set_spatial2d_transform, set_spatial2d_visible, swap_spatial2d_children,
};

// scene
pub use scene::{
    compute_scene_align_x, compute_scene_align_y, compute_scene_fill_scale,
    compute_scene_fit_scale, compute_scene_render_transform, create_scene,
};

// bounds_rectangle (coordinate-space bounds over Spatial2DArena)
pub use bounds_rectangle::{
    compute_node_bounds_rectangle, ensure_node_local_bounds_rectangle,
    ensure_node_parent_bounds_rectangle, ensure_node_world_bounds_rectangle, get_node_height,
    get_node_local_bounds_rectangle, get_node_parent_bounds_rectangle, get_node_width,
    get_node_world_bounds_rectangle, set_node_height, set_node_width,
};

// node (entity/runtime model) — `NodeId`/revision getters are NOT re-exported
// here to avoid colliding with `node_id::NodeId` and the transform2d revision
// getters; reach them via `node::` / `revision::` when the entity model is needed.
pub use node::{
    CanAddChild, Node, NodeRuntime, NodeSignals, PartialNode, create_node, create_node_runtime,
    create_node_signals, default_node_runtime_can_add_child, enable_node_signals, get_node_runtime,
    get_node_signals, set_node_enabled,
};

// revision (entity-model invalidation). Names that also exist as arena
// functions (appearance/bounds/transform revision getters and their
// invalidators) intentionally stay in `revision::` to avoid root collisions;
// only the entity-model-unique surface is re-exported here.
pub use revision::{
    NodeRevisions, compute_node_world_transform_revision, get_node_local_content_revision,
    invalidate_node, invalidate_node_local_bounds, invalidate_node_local_content,
    invalidate_node_local_transform, invalidate_node_parent_reference, invalidate_node_render,
    invalidate_node_world_bounds,
};

// traits (TS `has*` initializers)
pub use traits::{
    AppearanceTrait, BoundsRectangleRuntimeTrait, BoundsRectangleTrait, ClipTrait, MaterialTrait,
    Transform2DRuntimeTrait, Transform2DTrait, Transform3DRuntimeTrait, Transform3DTrait,
    default_compute_local_bounds_rectangle, init_appearance_trait,
    init_bounds_rectangle_runtime_trait, init_bounds_rectangle_trait, init_clip_trait,
    init_material_trait, init_transform2d_runtime_trait, init_transform2d_trait,
    init_transform3d_runtime_trait, init_transform3d_trait,
};

// traversal
pub use traversal::{
    find_node, find_node_by_name, for_each_node_ancestor, for_each_node_child,
    for_each_node_descendant, get_node_ancestors, get_node_common_ancestor, get_node_next_sibling,
    get_node_previous_sibling, is_node_ancestor_of, replace_node_child, walk_node_descendants,
};

// viewport
pub use viewport::{
    Viewport, ViewportAlign, ViewportScaleMode, compute_viewport_align_x, compute_viewport_align_y,
    compute_viewport_fill_scale, compute_viewport_fit_scale, compute_viewport_render_transform,
    create_viewport,
};

// ---------------------------------------------------------------------------
// Graph-feature type aliases (mirror TS graph-alias pattern)
// ---------------------------------------------------------------------------

// These allow consumers to reference the feature they need without coupling to
// a concrete graph family. A `HierarchyNode` arena IS a `NodeArena<HierarchyNode>`,
// a `GraphAppearanceNode` arena is `NodeArena<GraphAppearanceNode>`, etc.
//
// The aliases are defined in the sub-modules and re-exported above. Additional
// composite aliases are defined here for convenience.

/// Arena alias for the 2D hierarchy feature.
pub type HierarchyArena = NodeArena<HierarchyNode>;

/// Arena alias for the 2D transform feature.
pub type Transform2DArena = NodeArena<Transform2DNode>;

/// Arena alias for the 3D transform feature.
pub type Transform3DArena = NodeArena<Transform3DNode>;

/// Arena alias for the bounds feature.
pub type BoundsArena = NodeArena<BoundsNode>;

/// Arena alias for the appearance feature.
pub type AppearanceArena = NodeArena<GraphAppearanceNode>;
