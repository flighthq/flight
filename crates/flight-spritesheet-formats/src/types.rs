use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use flight_entity::{Kind, Record, Unknown, unknown_strict_equals};
use flight_registry::KindMap;
use flight_spritesheet::SpritesheetData;
use flight_textureatlas_formats::{
    TextureAtlasAsepriteBaseFrame, TextureAtlasAsepriteFrameTag, TextureAtlasAsepriteSize,
    TextureAtlasScale, TexturePackerAtlasArrayFrame, TexturePackerAtlasDocument,
    TexturePackerAtlasHashFrame, TexturePackerAtlasMeta, TexturePackerAtlasNamedFrame,
};

pub const SPRITESHEET_FORMAT_KIND_ASEPRITE: &str = "Aseprite";
pub const SPRITESHEET_FORMAT_KIND_COCOS_PLIST: &str = "CocosPlist";
pub const SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS: &str = "LibgdxAtlas";
pub const SPRITESHEET_FORMAT_KIND_STARLING: &str = "Starling";
pub const SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER: &str = "TexturePacker";

pub type SpritesheetFormatKind = Kind;
pub type AsepriteBaseFrame = TextureAtlasAsepriteBaseFrame;
pub type AsepriteFrameTag = TextureAtlasAsepriteFrameTag;
pub type AsepriteSize = TextureAtlasAsepriteSize;
pub type TexturePackerArrayFrame = TexturePackerAtlasArrayFrame;
pub type TexturePackerDocument = TexturePackerAtlasDocument;
pub type TexturePackerHashFrame = TexturePackerAtlasHashFrame;
pub type TexturePackerMeta = TexturePackerAtlasMeta;
pub type TexturePackerNamedFrame = TexturePackerAtlasNamedFrame;

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteLayer {
    pub blend_mode: String,
    pub name: String,
    pub opacity: f32,
}

#[derive(Clone)]
pub struct AsepriteMeta {
    pub app: String,
    pub format: String,
    pub frame_tags: Vec<AsepriteFrameTag>,
    pub image: String,
    pub layers: Option<Vec<AsepriteLayer>>,
    pub scale: TextureAtlasScale,
    pub size: AsepriteSize,
    pub slices: Option<Vec<Unknown>>,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteArrayFrame {
    pub duration: f32,
    pub filename: String,
    pub frame: flight_textureatlas_formats::TextureAtlasAsepriteRect,
    pub rotated: bool,
    pub source_size: AsepriteSize,
    pub sprite_source_size: flight_textureatlas_formats::TextureAtlasAsepriteRect,
    pub trimmed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteNamedFrame {
    pub frame: AsepriteBaseFrame,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteArrayDocument {
    pub frames: Vec<AsepriteArrayFrame>,
    pub meta: AsepriteMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteHashDocument {
    pub frames: Vec<AsepriteNamedFrame>,
    pub meta: AsepriteMeta,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteArrayDocumentValue {
    pub value: AsepriteArrayDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteHashDocumentValue {
    pub value: AsepriteHashDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub enum AsepriteDocument {
    Array(AsepriteArrayDocumentValue),
    Hash(AsepriteHashDocumentValue),
}

#[derive(Clone, Debug, PartialEq)]
pub struct AsepriteParsed {
    pub data: SpritesheetData,
    pub document: AsepriteDocument,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpritesheetDocumentVariant {
    Array,
    Hash,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AsepriteSerializeOptions {
    pub variant: Option<SpritesheetDocumentVariant>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TexturePackerParsed {
    pub data: SpritesheetData,
    pub document: TexturePackerDocument,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TexturePackerSerializeOptions {
    pub variant: Option<SpritesheetDocumentVariant>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CocosPlistFrame {
    pub aliases: Option<Vec<String>>,
    pub frame: String,
    pub sprite_offset: String,
    pub sprite_size: String,
    pub sprite_source_size: String,
    pub sprite_trimmed: bool,
    pub texture_rotated: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CocosPlistMetadata {
    pub format: i32,
    pub size: String,
    pub texture_file_name: String,
}

#[derive(Clone, Debug)]
pub struct CocosPlistDocument {
    pub frames: Record<CocosPlistFrame>,
    pub metadata: CocosPlistMetadata,
}

#[derive(Clone, Debug)]
pub struct CocosPlistParsed {
    pub data: SpritesheetData,
    pub document: CocosPlistDocument,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StarlingSubTexture {
    pub frame_height: Option<f32>,
    pub frame_width: Option<f32>,
    pub frame_x: Option<f32>,
    pub frame_y: Option<f32>,
    pub height: f32,
    pub name: String,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotated: Option<bool>,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StarlingDocument {
    pub image_path: String,
    pub sub_textures: Vec<StarlingSubTexture>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StarlingParsed {
    pub data: SpritesheetData,
    pub document: StarlingDocument,
}

// flight-lint: allow(f64) D1: frame timings are source JavaScript numbers
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct StarlingParseOptions {
    pub frame_duration: Option<f64>,
    pub image_height: Option<f32>,
    pub image_width: Option<f32>,
}

// flight-lint: allow(f64) D1: frame timings are source JavaScript numbers
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LibgdxAtlasParseOptions {
    pub frame_duration: Option<f64>,
}

// flight-lint: allow(f64) D1: frame timings are source JavaScript numbers
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpritesheetParseOptions {
    pub frame_duration: Option<f64>,
    pub image_height: Option<f32>,
    pub image_width: Option<f32>,
}

pub type SpritesheetFormatDetector = Arc<dyn Fn(&str) -> bool + Send + Sync>;
pub type SpritesheetFormatParser =
    Arc<dyn Fn(&str, &SpritesheetParseOptions) -> SpritesheetData + Send + Sync>;

#[derive(Clone)]
pub struct SpritesheetFormatEntry {
    pub detect: SpritesheetFormatDetector,
    pub parse: SpritesheetFormatParser,
}

#[derive(Clone)]
pub struct SpritesheetFormatDescriptor {
    pub entry: Arc<SpritesheetFormatEntry>,
    pub kind: SpritesheetFormatKind,
}

#[derive(Clone, Debug, Default)]
pub struct SpritesheetImportOptions {
    pub formats: Option<Vec<SpritesheetFormatDescriptor>>,
}

#[derive(Clone)]
pub(crate) struct RegisteredSpritesheetFormat {
    pub entry: Arc<SpritesheetFormatEntry>,
    pub order: usize,
}

#[derive(Clone)]
pub struct SpritesheetFormatRegistry {
    pub(crate) all_formats: Vec<SpritesheetFormatDescriptor>,
    pub(crate) formats: KindMap<RegisteredSpritesheetFormat>,
    pub(crate) next_format_order: usize,
}

pub(crate) fn empty_spritesheet_format_map() -> KindMap<RegisteredSpritesheetFormat> {
    return KindMap {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
}

impl fmt::Debug for AsepriteMeta {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("AsepriteMeta")
            .field("app", &self.app)
            .field("format", &self.format)
            .field("frame_tags", &self.frame_tags)
            .field("image", &self.image)
            .field("layers", &self.layers)
            .field("scale", &self.scale)
            .field("size", &self.size)
            .field("slices", &self.slices.as_ref().map(Vec::len))
            .field("version", &self.version)
            .finish();
    }
}

impl PartialEq for AsepriteMeta {
    fn eq(&self, other: &Self) -> bool {
        let slices_equal = match (&self.slices, &other.slices) {
            (None, None) => true,
            (Some(left), Some(right)) => {
                left.len() == right.len()
                    && left.iter().zip(right).all(|(left, right)| {
                        let json_equal = match (left, right) {
                            (Some(left), Some(right)) => left
                                .downcast_ref::<serde_json::Value>()
                                .zip(right.downcast_ref::<serde_json::Value>())
                                .is_some_and(|(left, right)| left == right),
                            _ => false,
                        };
                        json_equal || unknown_strict_equals(left, right)
                    })
            }
            _ => false,
        };
        return self.app == other.app
            && self.format == other.format
            && self.frame_tags == other.frame_tags
            && self.image == other.image
            && self.layers == other.layers
            && self.scale == other.scale
            && self.size == other.size
            && slices_equal
            && self.version == other.version;
    }
}

impl fmt::Debug for SpritesheetFormatEntry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("SpritesheetFormatEntry")
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for SpritesheetFormatDescriptor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("SpritesheetFormatDescriptor")
            .field("kind", &self.kind)
            .finish_non_exhaustive();
    }
}

impl fmt::Debug for SpritesheetFormatRegistry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("SpritesheetFormatRegistry")
            .field("kinds", &self.formats.key_order)
            .finish();
    }
}
