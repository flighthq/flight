//! Import and export spritesheet atlas descriptors in industry-standard
//! formats: Aseprite JSON, Starling/Sparrow XML, Texture Packer JSON, Cocos
//! Creator / Cocos2d-x plist XML, and LibGDX `.atlas` text.
//!
//! All parsers produce a [`SpritesheetData`](flighthq_spritesheet::SpritesheetData)
//! (from `flighthq_spritesheet`) which can be loaded into a
//! [`flighthq_types::Spritesheet`] by the runtime. The `*Document` variants
//! additionally preserve the original document structure for lossless round-trip
//! serialisation.
//!
//! [`detect_spritesheet_format`] and [`parse_spritesheet`] auto-detect a format
//! from its text; custom formats can be added via [`register_spritesheet_format`].
//!
//! # Format support
//!
//! | Format | Parse | Serialize | Round-trip |
//! |--------|-------|-----------|------------|
//! | Aseprite JSON (hash & array) | yes | yes | yes |
//! | Starling / Sparrow XML | yes | yes | yes |
//! | Texture Packer JSON (hash & array) | yes | yes | yes |
//! | Cocos Creator / Cocos2d-x plist XML | yes | no | no |
//! | LibGDX `.atlas` text | yes | no | no |

pub mod aseprite;
pub mod cocos_plist;
pub mod libgdx_atlas;
pub mod starling;
pub mod texture_packer;

mod json;
mod spritesheet_detect;

pub use aseprite::{
    AsepriteParsed, AsepriteSerializeOptions, parse_aseprite_spritesheet,
    parse_aseprite_spritesheet_document, serialize_aseprite_spritesheet,
};
pub use cocos_plist::{
    CocosPlistDocument, CocosPlistFrame, CocosPlistMetadata, CocosPlistParseOptions,
    CocosPlistParsed, parse_cocos_plist_spritesheet, parse_cocos_plist_spritesheet_document,
};
pub use libgdx_atlas::{LibgdxAtlasParseOptions, parse_libgdx_atlas_spritesheet};
pub use spritesheet_detect::{
    SpritesheetFormatEntry, SpritesheetParseOptions, detect_spritesheet_format,
    has_spritesheet_format, parse_spritesheet, register_spritesheet_format,
    run_spritesheet_format_detect, run_spritesheet_format_parse,
};
pub use starling::{
    StarlingParseOptions, StarlingParsed, parse_starling_spritesheet,
    parse_starling_spritesheet_document, serialize_starling_spritesheet,
};
pub use texture_packer::{
    TexturePackerParsed, TexturePackerSerializeOptions, parse_texture_packer_spritesheet,
    parse_texture_packer_spritesheet_document, serialize_texture_packer_spritesheet,
};
