//! Portable readers and synthetic producers for CFF, SFNT, WOFF and WOFF2.
//!
//! The construction initializer remains in the full contract lane.
//! ```compile_fail
//! use flight_font_formats::initialize_glyph_outline_source_from_open_type_font;
//! ```
//! Its parsed-table construction carrier is likewise contract-only.
//! ```compile_fail
//! use flight_font_formats::OpenTypeFontTables;
//! ```

mod binary;
mod cff_charstring;
mod cff_dict;
mod cff_fd_select;
mod cff_index;
mod cff_table;
mod open_type_cmap;
mod open_type_glyf;
mod open_type_glyph_outline_source;
mod open_type_metrics;
mod open_type_test_helper;
mod sfnt_assembly;
mod sfnt_table_directory;
mod types;
mod woff2_font;
mod woff2_glyf_transform;
mod woff_font;

pub mod contract;

pub use cff_charstring::*;
pub use cff_dict::*;
pub use cff_fd_select::*;
pub use cff_index::*;
pub use cff_table::*;
pub use open_type_cmap::*;
pub use open_type_glyf::*;
pub use open_type_glyph_outline_source::{
    OpenTypeFontExplanation, OpenTypeFontExplanationReason,
    create_glyph_outline_source_from_open_type_font, explain_open_type_font,
    get_open_type_font_explanation_reason_string, parse_open_type_font_explanation_reason,
};
pub use open_type_metrics::*;
pub use open_type_test_helper::*;
pub use sfnt_assembly::*;
pub use sfnt_table_directory::*;
pub use types::*;
pub use woff_font::*;
pub use woff2_font::*;
pub use woff2_glyf_transform::*;
