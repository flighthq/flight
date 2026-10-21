use std::fmt;
use std::sync::Arc;

use flight_entity::Kind;
use flight_registry::KindMap;
use flight_textureatlas::TextureAtlas;

pub const TEXTURE_ATLAS_FORMAT_KIND_ASEPRITE: &str = "aseprite";
pub const TEXTURE_ATLAS_FORMAT_KIND_COCOS_PLIST: &str = "cocosPlist";
pub const TEXTURE_ATLAS_FORMAT_KIND_LIBGDX_ATLAS: &str = "libgdxAtlas";
pub const TEXTURE_ATLAS_FORMAT_KIND_STARLING: &str = "starling";
pub const TEXTURE_ATLAS_FORMAT_KIND_TEXTURE_PACKER: &str = "texturePacker";

pub type TextureAtlasFormatKind = Kind;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextureAtlasFrameTagDirection {
    Forward,
    PingPong,
    PingPongReverse,
    Reverse,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasScaleNumber {
    pub value: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasScaleString {
    pub value: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TextureAtlasScale {
    Number(TextureAtlasScaleNumber),
    String(TextureAtlasScaleString),
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteRect {
    pub h: f32,
    pub w: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteSize {
    pub h: f32,
    pub w: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteFrameTag {
    pub color: Option<String>,
    pub direction: TextureAtlasFrameTagDirection,
    pub from: i32,
    pub name: String,
    pub to: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteBaseFrame {
    pub duration: f32,
    pub frame: TextureAtlasAsepriteRect,
    pub rotated: bool,
    pub source_size: TextureAtlasAsepriteSize,
    pub sprite_source_size: TextureAtlasAsepriteRect,
    pub trimmed: bool,
}

pub type TextureAtlasAsepriteHashFrame = TextureAtlasAsepriteBaseFrame;

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteArrayFrame {
    pub duration: f32,
    pub filename: String,
    pub frame: TextureAtlasAsepriteRect,
    pub rotated: bool,
    pub source_size: TextureAtlasAsepriteSize,
    pub sprite_source_size: TextureAtlasAsepriteRect,
    pub trimmed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteMeta {
    pub app: String,
    pub format: String,
    pub frame_tags: Option<Vec<TextureAtlasAsepriteFrameTag>>,
    pub image: String,
    pub scale: TextureAtlasScale,
    pub size: TextureAtlasAsepriteSize,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteNamedFrame {
    pub frame: TextureAtlasAsepriteHashFrame,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteArrayDocument {
    pub frames: Vec<TextureAtlasAsepriteArrayFrame>,
    pub meta: TextureAtlasAsepriteMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteHashDocument {
    pub frames: Vec<TextureAtlasAsepriteNamedFrame>,
    pub meta: TextureAtlasAsepriteMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteArrayDocumentValue {
    pub value: TextureAtlasAsepriteArrayDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasAsepriteHashDocumentValue {
    pub value: TextureAtlasAsepriteHashDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TextureAtlasAsepriteDocument {
    Array(TextureAtlasAsepriteArrayDocumentValue),
    Hash(TextureAtlasAsepriteHashDocumentValue),
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasRect {
    pub h: f32,
    pub w: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasSize {
    pub h: f32,
    pub w: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasPivot {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasFrameTag {
    pub direction: Option<TextureAtlasFrameTagDirection>,
    pub from: i32,
    pub name: String,
    pub to: i32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasHashFrame {
    pub frame: TexturePackerAtlasRect,
    pub pivot: Option<TexturePackerAtlasPivot>,
    pub rotated: bool,
    pub source_size: TexturePackerAtlasSize,
    pub sprite_source_size: TexturePackerAtlasRect,
    pub trimmed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasArrayFrame {
    pub filename: String,
    pub frame: TexturePackerAtlasRect,
    pub pivot: Option<TexturePackerAtlasPivot>,
    pub rotated: bool,
    pub source_size: TexturePackerAtlasSize,
    pub sprite_source_size: TexturePackerAtlasRect,
    pub trimmed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasMeta {
    pub app: String,
    pub format: String,
    pub frame_tags: Option<Vec<TexturePackerAtlasFrameTag>>,
    pub image: String,
    pub scale: TextureAtlasScale,
    pub size: TexturePackerAtlasSize,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasNamedFrame {
    pub frame: TexturePackerAtlasHashFrame,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasArrayDocument {
    pub frames: Vec<TexturePackerAtlasArrayFrame>,
    pub meta: TexturePackerAtlasMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasHashDocument {
    pub frames: Vec<TexturePackerAtlasNamedFrame>,
    pub meta: TexturePackerAtlasMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasArrayDocumentValue {
    pub value: TexturePackerAtlasArrayDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerAtlasHashDocumentValue {
    pub value: TexturePackerAtlasHashDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TexturePackerAtlasDocument {
    Array(TexturePackerAtlasArrayDocumentValue),
    Hash(TexturePackerAtlasHashDocumentValue),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TexturePackerAtlasParseOptions {
    pub strip_path_prefix: Option<bool>,
}

pub type TextureAtlasParseOptions = TexturePackerAtlasParseOptions;

pub type TextureAtlasFormatDetector = Arc<dyn Fn(&str) -> bool + Send + Sync>;
pub type TextureAtlasFormatParser =
    Arc<dyn Fn(&mut TextureAtlas, &str, &TextureAtlasParseOptions) + Send + Sync>;

#[derive(Clone)]
pub struct TextureAtlasFormatEntry {
    pub detect: TextureAtlasFormatDetector,
    pub parse: TextureAtlasFormatParser,
}

#[derive(Clone)]
pub struct TextureAtlasFormatDescriptor {
    pub entry: Arc<TextureAtlasFormatEntry>,
    pub kind: TextureAtlasFormatKind,
}

#[derive(Clone, Debug, Default)]
pub struct TextureAtlasImportOptions {
    pub formats: Option<Vec<TextureAtlasFormatDescriptor>>,
}

#[derive(Clone)]
pub(crate) struct RegisteredTextureAtlasFormat {
    pub entry: Arc<TextureAtlasFormatEntry>,
    pub order: usize,
}

#[derive(Clone)]
pub struct TextureAtlasFormatRegistry {
    pub(crate) all_formats: Vec<TextureAtlasFormatDescriptor>,
    pub(crate) formats: KindMap<RegisteredTextureAtlasFormat>,
    pub(crate) next_format_order: usize,
}

// flight-lint: allow(conform-extra) D9: exact string table for the schema string union
pub fn get_texture_atlas_frame_tag_direction_string(
    value: TextureAtlasFrameTagDirection,
) -> &'static str {
    return match value {
        TextureAtlasFrameTagDirection::Forward => "forward",
        TextureAtlasFrameTagDirection::PingPong => "pingpong",
        TextureAtlasFrameTagDirection::PingPongReverse => "pingpong_reverse",
        TextureAtlasFrameTagDirection::Reverse => "reverse",
    };
}

// flight-lint: allow(conform-extra) D9: exact string table for the schema string union
pub fn parse_texture_atlas_frame_tag_direction(
    value: &str,
) -> Option<TextureAtlasFrameTagDirection> {
    return match value {
        "forward" => Some(TextureAtlasFrameTagDirection::Forward),
        "pingpong" => Some(TextureAtlasFrameTagDirection::PingPong),
        "pingpong_reverse" => Some(TextureAtlasFrameTagDirection::PingPongReverse),
        "reverse" => Some(TextureAtlasFrameTagDirection::Reverse),
        _ => None,
    };
}

impl fmt::Debug for TextureAtlasFormatEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("TextureAtlasFormatEntry")
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for TextureAtlasFormatDescriptor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("TextureAtlasFormatDescriptor")
            .field("kind", &self.kind)
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for TextureAtlasFormatRegistry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("TextureAtlasFormatRegistry")
            .field("kinds", &self.formats.key_order)
            .finish();
    }
}
