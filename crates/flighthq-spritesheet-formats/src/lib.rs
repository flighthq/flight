//! Import and export spritesheet atlas descriptors in industry-standard
//! formats: Aseprite JSON, Starling/Sparrow XML, and Texture Packer JSON.
//!
//! All parsers produce a [`SpritesheetData`] (from `flighthq_spritesheet`)
//! which can be loaded into a [`flighthq_types::Spritesheet`] by the runtime.
//! The `*Document` variants additionally preserve the original document
//! structure for lossless round-trip serialisation.
//!
//! # Format support
//!
//! | Format | Parse | Serialize | Round-trip |
//! |--------|-------|-----------|------------|
//! | Aseprite JSON (hash & array) | yes | yes | yes |
//! | Starling / Sparrow XML | yes | yes | yes |
//! | Texture Packer JSON (hash & array) | yes | yes | yes |

pub mod aseprite;
pub mod starling;
pub mod texture_packer;

mod json;

pub use aseprite::{
    AsepriteParsed, AsepriteSerializeOptions, parse_aseprite_spritesheet,
    parse_aseprite_spritesheet_document, serialize_aseprite_spritesheet,
};
pub use starling::{
    StarlingParseOptions, StarlingParsed, parse_starling_spritesheet,
    parse_starling_spritesheet_document, serialize_starling_spritesheet,
};
pub use texture_packer::{
    TexturePackerParsed, TexturePackerSerializeOptions, parse_texture_packer_spritesheet,
    parse_texture_packer_spritesheet_document, serialize_texture_packer_spritesheet,
};
