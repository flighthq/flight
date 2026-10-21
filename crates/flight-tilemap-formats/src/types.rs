//! Tiled document model types: faithful representations of TMX/TMJ/TSX/TSJ
//! documents and the format registry entries that detect and parse them.

use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::Kind;
use flight_geometry::Vector2;
use flight_importdiagnostics::ImportDiagnostic;

// ── Format kind constants ──────────────────────────────────────────────────

pub const TILEMAP_FORMAT_KIND_TILED_TMJ: &str = "tiled.tmj";
pub const TILEMAP_FORMAT_KIND_TILED_TMX: &str = "tiled.tmx";
pub const TILEMAP_FORMAT_KIND_TILED_TSJ: &str = "tiled.tsj";
pub const TILEMAP_FORMAT_KIND_TILED_TSX: &str = "tiled.tsx";

pub type TilemapFormatKind = Kind;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TiledCompression {
    Gzip,
    Zlib,
    Zstd,
}

// flight-lint: allow(f64) Tiled properties store f64 values per the TMJ/TMX spec
#[derive(Clone, Debug, PartialEq)]
pub enum TiledPropertyValue {
    String(String),
    Number(f64),
    Bool(bool),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TiledLayerDataFailure {
    CompressedWithoutInflate,
    InflateFailed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledOrientation {
    Orthogonal,
    Isometric,
    Staggered,
    Hexagonal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledRenderOrder {
    RightDown,
    RightUp,
    LeftDown,
    LeftUp,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledStaggerAxis {
    X,
    Y,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledStaggerIndex {
    Even,
    Odd,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledObjectAlignment {
    Unspecified,
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledPropertyType {
    String,
    Int,
    Float,
    Bool,
    Color,
    File,
    Object,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTileLayerData {
    pub base: TiledLayerBase,
    pub data: Vec<u32>,
    pub height: i32,
    pub width: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledObjectGroupData {
    pub base: TiledLayerBase,
    pub objects: Vec<TiledObject>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledImageLayerData {
    pub base: TiledLayerBase,
    pub image: String,
    pub repeat_x: bool,
    pub repeat_y: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledGroupData {
    pub base: TiledLayerBase,
    pub layers: Vec<TiledLayer>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TiledLayer {
    TileLayer(TiledTileLayerData),
    ObjectGroup(TiledObjectGroupData),
    ImageLayer(TiledImageLayerData),
    Group(TiledGroupData),
}

pub type TiledInflate = Arc<dyn Fn(&[u8], TiledCompression) -> Option<Vec<u8>> + Send + Sync>;

pub type TiledTilesetResolver =
    Arc<dyn Fn(&TiledTilesetRef) -> Option<TiledTilesetLayout> + Send + Sync>;

#[derive(Clone, Debug, PartialEq)]
pub struct TiledLayerDataExplanation {
    pub preserved_as_zero_grid: bool,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledGid {
    pub flip_diagonal: bool,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub tile_id: u32,
}

// flight-lint: allow(f64) Tiled layer offsets, opacity, parallax factors are fractional real numbers per the TMX spec
#[derive(Clone, Debug, PartialEq)]
pub struct TiledLayerBase {
    pub class: String,
    pub id: i32,
    pub name: String,
    pub offset_x: f64,
    pub offset_y: f64,
    pub opacity: f64,
    pub parallax_x: f64,
    pub parallax_y: f64,
    pub properties: Vec<TiledProperty>,
    pub tint_color: Option<u32>,
    pub visible: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledMap {
    pub background_color: Option<u32>,
    pub height: i32,
    pub hex_side_length: Option<i32>,
    pub infinite: bool,
    pub layers: Vec<TiledLayer>,
    pub orientation: TiledOrientation,
    pub properties: Vec<TiledProperty>,
    pub render_order: TiledRenderOrder,
    pub stagger_axis: Option<TiledStaggerAxis>,
    pub stagger_index: Option<TiledStaggerIndex>,
    pub tile_height: i32,
    pub tile_width: i32,
    pub tiled_version: Option<String>,
    pub tilesets: Vec<TiledTilesetRef>,
    pub version: String,
    pub width: i32,
}

// flight-lint: allow(f64) Tiled object x/y/width/height/rotation are fractional coordinates per the TMX spec
#[derive(Clone, Debug, PartialEq)]
pub struct TiledObject {
    pub ellipse: bool,
    pub gid: Option<u32>,
    pub height: f64,
    pub id: i32,
    pub name: String,
    pub point: bool,
    pub polygon: Option<Vec<Vector2>>,
    pub polyline: Option<Vec<Vector2>>,
    pub properties: Vec<TiledProperty>,
    pub rotation: f64,
    pub object_type: String,
    pub visible: bool,
    pub width: f64,
    pub x: f64,
    pub y: f64,
}

pub struct TiledParseOptions {
    pub inflate: Option<TiledInflate>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledProperty {
    pub name: String,
    pub property_type: TiledPropertyType,
    pub value: TiledPropertyValue,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTileset {
    pub columns: i32,
    pub image: Option<String>,
    pub image_height: i32,
    pub image_width: i32,
    pub margin: i32,
    pub name: String,
    pub object_alignment: TiledObjectAlignment,
    pub properties: Vec<TiledProperty>,
    pub spacing: i32,
    pub tile_offset_x: i32,
    pub tile_offset_y: i32,
    pub tile_count: i32,
    pub tile_height: i32,
    pub tile_width: i32,
    pub tiles: Vec<TiledTilesetTile>,
}

pub struct TiledTilesetLayout {
    pub atlas: Option<flight_entity::Ref<flight_textureatlas::TextureAtlas>>,
    pub tile_height: f32,
    pub tile_width: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetRef {
    pub first_gid: i32,
    pub source: Option<String>,
    pub tileset: Option<TiledTileset>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetTile {
    pub animation: Option<Vec<TiledTilesetTileFrame>>,
    pub id: i32,
    pub image: Option<String>,
    pub objects: Option<Vec<TiledObject>>,
    pub properties: Vec<TiledProperty>,
    pub tile_type: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetTileFrame {
    pub duration: i32,
    pub tile_id: i32,
}

pub struct TilemapImportOptions {
    pub map_formats: Option<Vec<TilemapFormatDescriptor>>,
    pub tileset_formats: Option<Vec<TilesetFormatDescriptor>>,
}

#[derive(Clone)]
pub struct TilemapFormatEntry {
    pub detect: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub parse: Arc<
        dyn Fn(&str, Option<&TiledParseOptions>, Option<&mut Vec<ImportDiagnostic>>) -> Option<TiledMap>
            + Send
            + Sync,
    >,
}

pub struct TilemapFormatDescriptor {
    pub kind: TilemapFormatKind,
    pub entry: TilemapFormatEntry,
}

#[derive(Clone)]
pub struct TilesetFormatEntry {
    pub detect: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub parse: Arc<
        dyn Fn(&str, Option<&TiledParseOptions>, Option<&mut Vec<ImportDiagnostic>>) -> Option<TiledTileset>
            + Send
            + Sync,
    >,
}

pub struct TilesetFormatDescriptor {
    pub kind: TilemapFormatKind,
    pub entry: TilesetFormatEntry,
}

// ── Free functions for enum discriminants ─────────────────────────────────

pub(crate) fn detail_map(
    entries: &[(&str, flight_importdiagnostics::ImportDiagnosticDetailValue)],
) -> Option<HashMap<String, flight_importdiagnostics::ImportDiagnosticDetailValue>> {
    let mut map = HashMap::new();
    for (k, v) in entries {
        map.insert(k.to_string(), v.clone());
    }
    return Some(map);
}

pub(crate) fn get_tiled_compression_str(value: &TiledCompression) -> &'static str {
    return match value {
        TiledCompression::Gzip => "gzip",
        TiledCompression::Zlib => "zlib",
        TiledCompression::Zstd => "zstd",
    };
}

pub(crate) fn get_tiled_layer_base(layer: &TiledLayer) -> &TiledLayerBase {
    return match layer {
        TiledLayer::TileLayer(d) => &d.base,
        TiledLayer::ObjectGroup(d) => &d.base,
        TiledLayer::ImageLayer(d) => &d.base,
        TiledLayer::Group(d) => &d.base,
    };
}

pub(crate) fn get_tiled_layer_data_failure_str(value: &TiledLayerDataFailure) -> &'static str {
    return match value {
        TiledLayerDataFailure::CompressedWithoutInflate => "compressed-without-inflate",
        TiledLayerDataFailure::InflateFailed => "inflate-failed",
    };
}

pub(crate) fn get_tiled_layer_type(layer: &TiledLayer) -> &'static str {
    return match layer {
        TiledLayer::TileLayer(_) => "tilelayer",
        TiledLayer::ObjectGroup(_) => "objectgroup",
        TiledLayer::ImageLayer(_) => "imagelayer",
        TiledLayer::Group(_) => "group",
    };
}

pub(crate) fn get_tiled_object_alignment_str(value: &TiledObjectAlignment) -> &'static str {
    return match value {
        TiledObjectAlignment::Unspecified => "unspecified",
        TiledObjectAlignment::TopLeft => "topleft",
        TiledObjectAlignment::Top => "top",
        TiledObjectAlignment::TopRight => "topright",
        TiledObjectAlignment::Left => "left",
        TiledObjectAlignment::Center => "center",
        TiledObjectAlignment::Right => "right",
        TiledObjectAlignment::BottomLeft => "bottomleft",
        TiledObjectAlignment::Bottom => "bottom",
        TiledObjectAlignment::BottomRight => "bottomright",
    };
}

pub(crate) fn get_tiled_orientation_str(value: &TiledOrientation) -> &'static str {
    return match value {
        TiledOrientation::Orthogonal => "orthogonal",
        TiledOrientation::Isometric => "isometric",
        TiledOrientation::Staggered => "staggered",
        TiledOrientation::Hexagonal => "hexagonal",
    };
}

pub(crate) fn get_tiled_property_type_str(value: &TiledPropertyType) -> &'static str {
    return match value {
        TiledPropertyType::String => "string",
        TiledPropertyType::Int => "int",
        TiledPropertyType::Float => "float",
        TiledPropertyType::Bool => "bool",
        TiledPropertyType::Color => "color",
        TiledPropertyType::File => "file",
        TiledPropertyType::Object => "object",
    };
}

pub(crate) fn get_tiled_render_order_str(value: &TiledRenderOrder) -> &'static str {
    return match value {
        TiledRenderOrder::RightDown => "right-down",
        TiledRenderOrder::RightUp => "right-up",
        TiledRenderOrder::LeftDown => "left-down",
        TiledRenderOrder::LeftUp => "left-up",
    };
}

pub(crate) fn get_tiled_stagger_axis_str(value: &TiledStaggerAxis) -> &'static str {
    return match value {
        TiledStaggerAxis::X => "x",
        TiledStaggerAxis::Y => "y",
    };
}

pub(crate) fn get_tiled_stagger_index_str(value: &TiledStaggerIndex) -> &'static str {
    return match value {
        TiledStaggerIndex::Even => "even",
        TiledStaggerIndex::Odd => "odd",
    };
}

// ── Impl sugar (delegates to free functions) ─────────────────────────────

impl TiledCompression {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_compression_str(self);
    }
}

impl TiledLayer {
    pub fn base(&self) -> &TiledLayerBase {
        return get_tiled_layer_base(self);
    }

    pub fn layer_type(&self) -> &'static str {
        return get_tiled_layer_type(self);
    }
}

impl TiledLayerDataFailure {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_layer_data_failure_str(self);
    }
}

impl TiledObjectAlignment {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_object_alignment_str(self);
    }
}

impl TiledOrientation {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_orientation_str(self);
    }
}

impl TiledPropertyType {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_property_type_str(self);
    }
}

impl TiledRenderOrder {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_render_order_str(self);
    }
}

impl TiledStaggerAxis {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_stagger_axis_str(self);
    }
}

impl TiledStaggerIndex {
    pub fn as_str(&self) -> &'static str {
        return get_tiled_stagger_index_str(self);
    }
}
