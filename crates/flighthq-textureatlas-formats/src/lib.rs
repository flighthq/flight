//! Import texture atlas region data from industry-standard formats.
//!
//! Port of `@flighthq/textureatlas-formats`. All parsers accept a `&str` and
//! return a `Result<TextureAtlas, String>` with a populated set of regions on
//! success.
//!
//! # Format support
//!
//! | Format | Parser |
//! |--------|--------|
//! | TexturePacker JSON (hash & array) | [`parse_texture_atlas_packer`] |
//! | Starling / Sparrow XML | [`parse_texture_atlas_starling`] |
//! | libGDX `.atlas` text | [`parse_texture_atlas_libgdx`] |
//! | Aseprite JSON (hash & array) | [`parse_texture_atlas_aseprite`] |
//!
//! The XML parser ([`xml_parse`]) is also re-exported for callers that need to
//! parse raw atlas XML themselves.

pub mod texture_atlas_aseprite_parse;
pub mod texture_atlas_libgdx_parse;
pub mod texture_atlas_packer_parse;
pub mod texture_atlas_starling_parse;
pub mod xml_parse;

mod json;

pub use texture_atlas_aseprite_parse::parse_texture_atlas_aseprite;
pub use texture_atlas_libgdx_parse::parse_texture_atlas_libgdx;
pub use texture_atlas_packer_parse::parse_texture_atlas_packer;
pub use texture_atlas_starling_parse::parse_texture_atlas_starling;
pub use xml_parse::{XmlElement, parse_xml_attributes, parse_xml_document};

mod detect;
pub use detect::detect_texture_atlas_format;

pub use texture_atlas_aseprite_parse::{
    parse_texture_atlas_aseprite as parse_texture_atlas_aseprite_json,
    parse_texture_atlas_aseprite_document,
};
pub use texture_atlas_libgdx_parse::parse_texture_atlas_libgdx as parse_texture_atlas_libgdx_atlas;
pub use texture_atlas_packer_parse::{
    parse_texture_atlas_packer as parse_texture_atlas_packer_json,
    parse_texture_atlas_packer_document,
};
pub use texture_atlas_starling_parse::parse_texture_atlas_starling as parse_texture_atlas_starling_xml;
