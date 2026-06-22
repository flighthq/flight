//! `flighthq-path` — vector path geometry: curve flattening and tessellation.
//!
//! Provides:
//! - [`path`]: [`Path`] construction helpers (`create_path`, `append_path_*`).
//! - [`flatten_path`]: adaptive subdivision of curves into straight-line contours.
//! - [`tessellate_path`]: ear-clip triangulation of a path fill into a [`PathMesh`].

pub mod flatten_path;
pub mod path;
pub mod tessellate_path;

// flatten_path
pub use flatten_path::flatten_path;

// path
pub use path::{
    append_path_cubic_curve_to, append_path_curve_to, append_path_line_to, append_path_move_to,
    clear_path, create_path,
};

// tessellate_path
pub use tessellate_path::tessellate_path;
