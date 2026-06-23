//! `flighthq-shape` — vector shape display node.
//!
//! Provides shape display objects over the shared `DisplayObjectArena`,
//! drawing-command helpers, fill region extraction, and a hit-test command
//! registry — the Rust counterpart of the TypeScript `@flighthq/shape` package.
//!
//! A shape is a display object of kind `shape_kind` whose boxed payload is a
//! `ShapeData` (its drawing-command buffer); scale-9 shapes use
//! `scale9_shape_kind` with a `Scale9ShapeData` payload. There is no
//! shape-specific arena — shapes share the display-object scene graph.
//!
//! # Structure
//!
//! - [`shape`]: shape factories ([`shape::create_shape`]), bounds computation,
//!   and geometry invalidation.
//! - [`shape_commands`]: append helpers for every drawing command verb
//!   (moveTo, lineTo, curveTo, drawCircle, …).
//! - [`shape_fill`]: solid-fill region extraction ([`get_shape_fill_regions`])
//!   for GPU fill paths.
//! - [`shape_hit_test_registry`]: per-command hit-test function registry.
//! - [`scale9_shape`]: Scale-9 shape variant with a `scale9_grid` rectangle.

pub mod command_buffer;
pub mod scale9_shape;
pub mod shape;
pub mod shape_commands;
pub mod shape_fill;
pub mod shape_hit_test_registry;

// shape
pub use shape::{
    ShapeRuntime, clear_shape_commands, compute_shape_local_bounds_rectangle, copy_shape_commands,
    create_shape, create_shape_data, create_shape_runtime, get_shape_runtime,
    invalidate_shape_geometry,
};

// scale9_shape
pub use scale9_shape::{
    Scale9ShapeRuntime, create_scale9_shape, create_scale9_shape_data, create_scale9_shape_runtime,
    get_scale9_shape_runtime,
};

// shape_commands
pub use shape_commands::{
    append_shape_begin_bitmap_fill, append_shape_begin_fill, append_shape_begin_gradient_fill,
    append_shape_circle, append_shape_cubic_curve_to, append_shape_curve_to, append_shape_ellipse,
    append_shape_end_fill, append_shape_line_bitmap_style, append_shape_line_gradient_style,
    append_shape_line_style, append_shape_line_to, append_shape_move_to, append_shape_path,
    append_shape_rectangle, append_shape_round_rectangle, append_shape_round_rectangle_path,
};

// shape_fill
pub use shape_fill::{get_shape_fill_regions, has_non_solid_shape_fill};

// shape_hit_test_registry
pub use shape_hit_test_registry::{
    ShapeHitTestCommand, hit_test_shape_command_point, register_shape_hit_test_command,
};
