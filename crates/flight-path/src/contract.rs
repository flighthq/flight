//! The full contract lane, mirroring TS `contract.ts`: every public free function and type.
//! Consumers that need the complete surface (other Flight crates, internal seams) import here;
//! the crate root exposes only the curated public lane from TS `index.ts` plus type sugar.

pub use super::clean_path::*;
pub use super::contains_path_point::*;
pub use super::copy_path::*;
pub use super::dash_path::*;
pub use super::decimate_path::*;
pub use super::explain_path_morph_creation::*;
pub use super::explain_stroke_path_tessellation::*;
pub use super::fit_path_curves::*;
pub use super::flatten_path::*;
pub use super::for_each_path_segment::*;
pub use super::get_path_bounds::*;
pub use super::get_path_contour_lengths::*;
pub use super::get_path_curvature_at_distance::*;
pub use super::get_path_length::*;
pub use super::get_path_nearest_point::*;
pub use super::get_path_point_at_distance::*;
pub use super::get_path_segment_at_parameter::*;
pub use super::get_path_signed_area::*;
pub use super::path::*;
pub use super::path_mesh_pool::*;
pub use super::path_morph::*;
pub use super::path_morph_geometry::*;
pub use super::reverse_path::*;
pub use super::stroke_path::*;
pub use super::stroke_path_geometry::*;
pub use super::tessellate_path::*;
pub use super::tessellate_path_typed::*;
pub use super::tessellate_stroke_path::*;
pub use super::transform_path::*;
