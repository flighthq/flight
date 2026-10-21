mod bitmap_font_binary;
mod bitmap_font_detect;
mod bitmap_font_fnt;
mod bitmap_font_format_kind;
mod bitmap_font_json;
mod bitmap_font_record;
mod bitmap_font_xml;
mod bitmapfont_format_requirements;
mod explain_bitmap_font_parse;
mod fnt_fields;
mod json;
mod sugar;
mod types;

pub mod contract;

// Curated root mirrors pinned index.ts, while contract also exposes the shared record seam.
pub use bitmap_font_binary::parse_bitmap_font_binary;
pub use bitmap_font_detect::*;
pub use bitmap_font_fnt::{format_bitmap_font_fnt, parse_bitmap_font_fnt};
pub use bitmap_font_format_kind::read_bitmap_font_format_kind;
pub use bitmap_font_json::parse_bitmap_font_json;
pub use bitmap_font_xml::parse_bitmap_font_xml;
pub use bitmapfont_format_requirements::BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE;
pub use explain_bitmap_font_parse::explain_bitmap_font_parse;
pub use types::*;
