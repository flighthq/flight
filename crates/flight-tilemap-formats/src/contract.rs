//! Re-exports: the public surface of the tilemap-formats crate.

pub use crate::enable_tilemap_formats_guards::{
    disable_tilemap_formats_guards, enable_tilemap_formats_guards,
};
pub use crate::tiled_color::{format_tiled_color, parse_tiled_color};
pub use crate::tiled_gid::{decode_tiled_gid, get_tiled_tileset_ref_for_gid};
pub use crate::tiled_json_parse::{parse_tiled_tileset_json, parse_tiled_tmj};
pub use crate::tiled_layer_data::{
    TiledGuardState, create_tiled_guard_state, decode_tiled_base64_layer, decode_tiled_csv_layer,
    explain_tiled_layer_data, set_tiled_layer_data_guard,
};
pub use crate::tiled_project::build_tilemap_layers_from_tiled;
pub use crate::tiled_tmj_format::{format_tiled_tileset_json, format_tiled_tmj};
pub use crate::tiled_tmx_format::{format_tiled_tileset, format_tiled_tmx};
pub use crate::tiled_xml_parse::{parse_tiled_tileset, parse_tiled_tmx};
pub use crate::tilemap_detect::{
    apply_tilemap_import_options, create_default_tilemap_registry, create_default_tileset_registry,
    detect_tilemap_format, get_tilemap_format, get_tilemap_format_kinds, get_tileset_format,
    get_tileset_format_kinds, parse_tilemap, parse_tileset, register_tilemap_format,
    register_tileset_format, tiled_tmj_tilemap_format, tiled_tmx_tilemap_format,
    tiled_tsj_tileset_format, tiled_tsx_tileset_format, tilemap_all_map_formats,
    tilemap_all_tileset_formats, unregister_tilemap_format, unregister_tileset_format,
};
pub use crate::tilemap_format_requirements::TILEMAP_REQUIREMENT_KEY_NAMESPACE;
pub use crate::types::*;
