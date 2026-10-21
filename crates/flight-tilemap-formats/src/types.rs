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

// ── TilemapFormatKind is just Kind (String) ────────────────────────────────

pub type TilemapFormatKind = Kind;

// ── Compression ────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TiledCompression {
    Gzip,
    Zlib,
    Zstd,
}

impl TiledCompression {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledCompression::Gzip => "gzip",
            TiledCompression::Zlib => "zlib",
            TiledCompression::Zstd => "zstd",
        };
    }
}

// ── Layer data failure ─────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TiledLayerDataFailure {
    CompressedWithoutInflate,
    InflateFailed,
}

impl TiledLayerDataFailure {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledLayerDataFailure::CompressedWithoutInflate => "compressed-without-inflate",
            TiledLayerDataFailure::InflateFailed => "inflate-failed",
        };
    }
}

// ── Layer data explanation ─────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledLayerDataExplanation {
    pub preserved_as_zero_grid: bool,
    pub reason: String,
}

// ── Inflate callback ───────────────────────────────────────────────────────

pub type TiledInflate = Arc<dyn Fn(&[u8], TiledCompression) -> Option<Vec<u8>> + Send + Sync>;

// ── Orientation ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledOrientation {
    Orthogonal,
    Isometric,
    Staggered,
    Hexagonal,
}

impl TiledOrientation {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledOrientation::Orthogonal => "orthogonal",
            TiledOrientation::Isometric => "isometric",
            TiledOrientation::Staggered => "staggered",
            TiledOrientation::Hexagonal => "hexagonal",
        };
    }
}

// ── Render order ───────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledRenderOrder {
    RightDown,
    RightUp,
    LeftDown,
    LeftUp,
}

impl TiledRenderOrder {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledRenderOrder::RightDown => "right-down",
            TiledRenderOrder::RightUp => "right-up",
            TiledRenderOrder::LeftDown => "left-down",
            TiledRenderOrder::LeftUp => "left-up",
        };
    }
}

// ── Stagger ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledStaggerAxis {
    X,
    Y,
}

impl TiledStaggerAxis {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledStaggerAxis::X => "x",
            TiledStaggerAxis::Y => "y",
        };
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TiledStaggerIndex {
    Even,
    Odd,
}

impl TiledStaggerIndex {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledStaggerIndex::Even => "even",
            TiledStaggerIndex::Odd => "odd",
        };
    }
}

// ── Object alignment ──────────────────────────────────────────────────────

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

impl TiledObjectAlignment {
    pub fn as_str(&self) -> &'static str {
        return match self {
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
}

// ── Property type ──────────────────────────────────────────────────────────

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

impl TiledPropertyType {
    pub fn as_str(&self) -> &'static str {
        return match self {
            TiledPropertyType::String => "string",
            TiledPropertyType::Int => "int",
            TiledPropertyType::Float => "float",
            TiledPropertyType::Bool => "bool",
            TiledPropertyType::Color => "color",
            TiledPropertyType::File => "file",
            TiledPropertyType::Object => "object",
        };
    }
}

// ── Property value ─────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub enum TiledPropertyValue {
    String(String),
    Number(f64),
    Bool(bool),
}

// ── Property ───────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledProperty {
    pub name: String,
    pub property_type: TiledPropertyType,
    pub value: TiledPropertyValue,
}

// ── GID ────────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledGid {
    pub flip_diagonal: bool,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub tile_id: u32,
}

// ── Tileset tile frame ─────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetTileFrame {
    pub duration: i32,
    pub tile_id: i32,
}

// ── Tileset tile ───────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetTile {
    pub animation: Option<Vec<TiledTilesetTileFrame>>,
    pub id: i32,
    pub image: Option<String>,
    pub objects: Option<Vec<TiledObject>>,
    pub properties: Vec<TiledProperty>,
    pub tile_type: String,
}

// ── Tileset ────────────────────────────────────────────────────────────────

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

// ── Tileset ref ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct TiledTilesetRef {
    pub first_gid: i32,
    pub source: Option<String>,
    pub tileset: Option<TiledTileset>,
}

// ── Object ─────────────────────────────────────────────────────────────────

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

// ── Layer ──────────────────────────────────────────────────────────────────

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
pub enum TiledLayer {
    TileLayer {
        base: TiledLayerBase,
        data: Vec<u32>,
        height: i32,
        width: i32,
    },
    ObjectGroup {
        base: TiledLayerBase,
        objects: Vec<TiledObject>,
    },
    ImageLayer {
        base: TiledLayerBase,
        image: String,
        repeat_x: bool,
        repeat_y: bool,
    },
    Group {
        base: TiledLayerBase,
        layers: Vec<TiledLayer>,
    },
}

impl TiledLayer {
    pub fn base(&self) -> &TiledLayerBase {
        return match self {
            TiledLayer::TileLayer { base, .. } => base,
            TiledLayer::ObjectGroup { base, .. } => base,
            TiledLayer::ImageLayer { base, .. } => base,
            TiledLayer::Group { base, .. } => base,
        };
    }

    pub fn layer_type(&self) -> &'static str {
        return match self {
            TiledLayer::TileLayer { .. } => "tilelayer",
            TiledLayer::ObjectGroup { .. } => "objectgroup",
            TiledLayer::ImageLayer { .. } => "imagelayer",
            TiledLayer::Group { .. } => "group",
        };
    }
}

// ── Map ────────────────────────────────────────────────────────────────────

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

// ── Parse options ──────────────────────────────────────────────────────────

pub struct TiledParseOptions {
    pub inflate: Option<TiledInflate>,
}

// ── Format registry entries ────────────────────────────────────────────────

#[derive(Clone)]
pub struct TilemapFormatEntry {
    pub detect: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub parse: Arc<
        dyn Fn(&str, Option<&TiledParseOptions>, Option<&mut Vec<ImportDiagnostic>>) -> Option<TiledMap>
            + Send
            + Sync,
    >,
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

pub struct TilemapFormatDescriptor {
    pub kind: TilemapFormatKind,
    pub entry: TilemapFormatEntry,
}

pub struct TilesetFormatDescriptor {
    pub kind: TilemapFormatKind,
    pub entry: TilesetFormatEntry,
}

// ── Import options ─────────────────────────────────────────────────────────

pub struct TilemapImportOptions {
    pub map_formats: Option<Vec<TilemapFormatDescriptor>>,
    pub tileset_formats: Option<Vec<TilesetFormatDescriptor>>,
}

// ── Tileset resolver ───────────────────────────────────────────────────────

pub struct TiledTilesetLayout {
    pub atlas: Option<flight_entity::Ref<flight_textureatlas::TextureAtlas>>,
    pub tile_height: f32,
    pub tile_width: f32,
}

pub type TiledTilesetResolver =
    Arc<dyn Fn(&TiledTilesetRef) -> Option<TiledTilesetLayout> + Send + Sync>;

// ── Diagnostic detail helpers ──────────────────────────────────────────────

pub(crate) fn detail_map(
    entries: &[(&str, flight_importdiagnostics::ImportDiagnosticDetailValue)],
) -> Option<HashMap<String, flight_importdiagnostics::ImportDiagnosticDetailValue>> {
    let mut map = HashMap::new();
    for (k, v) in entries {
        map.insert(k.to_string(), v.clone());
    }
    return Some(map);
}
