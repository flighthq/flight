//! `flighthq-displayobject` — Flash/OpenFL-style display object tree.
//!
//! Provides bitmaps, containers, stages, video nodes, HTML views, and render
//! views as scene graph node types built on `flighthq-node`'s `Spatial2DNode`.
//!
//! # Design
//!
//! - Every node variant is stored in a single `DisplayObjectArena`
//!   (`slotmap::SlotMap<NodeId, DisplayObjectNode>`).
//! - All operations are free functions taking `(&mut DisplayObjectArena, NodeId)`.
//! - Kind-specific payload is stored as `Option<Box<dyn Any + Send + Sync>>` on
//!   the node and downcast inside each module.
//! - No global state, no side effects at module top level.

pub mod bitmap;
pub mod display_container;
pub mod display_object;
pub mod html_view;
pub mod render_view;
pub mod stage;
pub mod video;

// ---------------------------------------------------------------------------
// Re-exports — public surface at the crate root
// ---------------------------------------------------------------------------

// display_object
pub use display_object::{
    DisplayObjectArena, DisplayObjectNode, DisplayObjectRuntime, create_display_object,
    create_display_object_generic, create_display_object_runtime, get_display_object_alpha,
    get_display_object_blend_mode, get_display_object_bounds, get_display_object_clip,
    get_display_object_kind, get_display_object_pivot_x, get_display_object_pivot_y,
    get_display_object_rotation, get_display_object_runtime, get_display_object_scale_x,
    get_display_object_scale_y, get_display_object_visible, get_display_object_x,
    get_display_object_y, is_display_object, prepare_display_object_render,
    set_display_object_alpha, set_display_object_blend_mode, set_display_object_clip,
    set_display_object_pivot_x, set_display_object_pivot_y, set_display_object_rotation,
    set_display_object_scale_x, set_display_object_scale_y, set_display_object_visible,
    set_display_object_x, set_display_object_y,
};

// display_container
pub use display_container::{
    add_display_object_child, add_display_object_child_at, contains_display_object_child,
    create_display_container, create_display_container_runtime, detach_display_object,
    get_display_container_runtime, get_display_object_child_at, get_display_object_child_count,
    get_display_object_child_index, get_display_object_children, get_display_object_depth,
    get_display_object_parent, get_display_object_root, remove_display_object_child,
    remove_display_object_child_at, remove_display_object_children, set_display_object_child_index,
    swap_display_object_children, swap_display_object_children_at,
};

// bitmap
pub use bitmap::{
    compute_bitmap_local_bounds_rectangle, create_bitmap, create_bitmap_data,
    create_bitmap_runtime, get_bitmap_image, get_bitmap_runtime, get_bitmap_smoothing,
    get_bitmap_source_rectangle, set_bitmap_image, set_bitmap_smoothing,
    set_bitmap_source_rectangle,
};

// html_view
pub use html_view::{
    compute_html_view_local_bounds_rectangle, create_html_view, create_html_view_data,
    create_html_view_runtime, get_html_view_height, get_html_view_runtime, get_html_view_width,
    set_html_view_size,
};

// render_view
pub use render_view::{
    compute_render_view_local_bounds_rectangle, create_render_view, create_render_view_data,
    create_render_view_runtime, get_render_view_height, get_render_view_runtime,
    get_render_view_width, set_render_view_size,
};

// stage
pub use stage::{
    StageMeta, compute_stage_local_bounds_rectangle, create_stage, create_stage_data,
    create_stage_runtime, create_stage_signals, enable_stage_signals, get_display_object_stage,
    get_stage_color, get_stage_height, get_stage_runtime, get_stage_signals, get_stage_width,
    set_stage_color, set_stage_size,
};

// video
pub use video::{
    compute_video_local_bounds_rectangle, create_video, create_video_data, create_video_runtime,
    get_video_runtime, get_video_smoothing, get_video_source, set_video_smoothing,
    set_video_source,
};
