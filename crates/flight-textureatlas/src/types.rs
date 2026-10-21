use std::fmt;
use std::sync::{Arc, Mutex, RwLock, Weak};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_texture::Texture2D;

/// The cardinal quarter-turn a packer applied to a region (TS `TextureAtlasRotation`). The one enum
/// is both the rotation flag and its direction, so the two cannot disagree.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureAtlasRotation {
    Counterclockwise90 = -1,
    #[default]
    None = 0,
    Clockwise90 = 1,
}

/// Why `get_texture_atlas_region_texture` can or cannot mint a region view (TS
/// `TextureAtlasRegionTextureStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextureAtlasRegionTextureStatus {
    MissingRegion,
    MissingTexture,
    Ready,
    RotatedPage,
}

/// A packed atlas page: its regions, the page texture, and the page metadata descriptor formats carry
/// (TS `TextureAtlas extends Entity`). A zero image width or height means the document declared none.
///
/// The private fields replace the source's module side tables keyed by the atlas: the region-id
/// high-water mark and the per-region texture cache (keyed weakly by region identity, holding
/// identity only; every lookup re-derives the window).
pub struct TextureAtlas {
    runtime: EntityRuntimeSlot,
    pub image_height: f32,
    pub image_name: Option<String>,
    pub image_width: f32,
    pub regions: Vec<Ref<TextureAtlasRegion>>,
    /// The scale the atlas was exported at (TexturePacker `meta.scale`); 1 when undeclared.
    pub scale: f32,
    pub texture: Option<Ref<Texture2D>>,
    pub(crate) next_region_id_mark: i32,
    pub(crate) region_textures: Mutex<Vec<(Weak<RwLock<TextureAtlasRegion>>, Ref<Texture2D>)>>,
}

/// One packed region (TS `TextureAtlasRegion extends Entity`), shared as `Ref<TextureAtlasRegion>`:
/// lookups return the atlas's own region, and edits through `set_texture_atlas_region` happen in
/// place. `x`/`y`/`width`/`height` are the packed page rectangle; when `rotation` is not `None` the
/// logical drawn size is height by width.
#[derive(Clone, Debug, PartialEq)]
pub struct TextureAtlasRegion {
    runtime: EntityRuntimeSlot,
    pub height: f32,
    pub id: i32,
    pub name: Option<String>,
    pub original_height: Option<f32>,
    pub original_width: Option<f32>,
    /// The page image this region was packed into, for formats that carry several.
    pub page_name: Option<String>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: TextureAtlasRotation,
    pub source_x: f32,
    pub source_y: f32,
    pub trimmed: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

/// A region's fields without its entity runtime (TS `TextureAtlasRegionLike`). Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextureAtlasRegionLike {
    pub height: f32,
    pub id: i32,
    pub name: Option<String>,
    pub original_height: Option<f32>,
    pub original_width: Option<f32>,
    pub page_name: Option<String>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: TextureAtlasRotation,
    pub source_x: f32,
    pub source_y: f32,
    pub trimmed: bool,
    pub x: f32,
    pub y: f32,
    pub width: f32,
}

/// The source's `Partial<TextureAtlasRegionLike>` accepted by `create_texture_atlas_region` and
/// `set_texture_atlas_region`: `None` takes the constructor default. Plain record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TextureAtlasRegionOptions {
    pub height: Option<f32>,
    pub id: Option<i32>,
    pub name: Option<String>,
    pub original_height: Option<f32>,
    pub original_width: Option<f32>,
    pub page_name: Option<String>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: Option<TextureAtlasRotation>,
    pub source_x: Option<f32>,
    pub source_y: Option<f32>,
    pub trimmed: Option<bool>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub width: Option<f32>,
}

/// The source's `Partial<TextureAtlas>` accepted by `create_texture_atlas`: `None` takes the default,
/// and a provided `regions` vector becomes the atlas's own. Plain record.
#[derive(Clone, Debug, Default)]
pub struct TextureAtlasOptions {
    pub image_height: Option<f32>,
    pub image_name: Option<String>,
    pub image_width: Option<f32>,
    pub regions: Option<Vec<Ref<TextureAtlasRegion>>>,
    pub scale: Option<f32>,
    pub texture: Option<Ref<Texture2D>>,
}

/// Why a region texture could or could not be minted (TS `TextureAtlasRegionTextureExplanation`).
/// Plain record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextureAtlasRegionTextureExplanation {
    pub status: TextureAtlasRegionTextureStatus,
}

/// The diagnostics hook consulted when region texture minting returns `None` (TS
/// `TextureAtlasRegionTextureGuard`).
pub type TextureAtlasRegionTextureGuard =
    Arc<dyn Fn(&Ref<TextureAtlas>, i32, &TextureAtlasRegionTextureExplanation) + Send + Sync>;

/// Caller-owned guard state replacing the source module's guard slot and enabled flag (D5). Plain
/// record.
#[derive(Clone, Default)]
pub struct TextureAtlasGuardState {
    pub enabled: bool,
    pub guard: Option<TextureAtlasRegionTextureGuard>,
}

/// Regular-grid slicing options (TS `GridSliceOptions`). `None` frame sizes are derived from the image
/// size, margins and spacing; margins and spacing default to 0 and `name_prefix` to `"frame_"`. Plain
/// record.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct GridSliceOptions {
    pub columns: i32,
    pub frame_height: Option<f32>,
    pub frame_width: Option<f32>,
    pub image_file: String,
    pub image_height: f32,
    pub image_width: f32,
    pub margin_x: Option<f32>,
    pub margin_y: Option<f32>,
    pub name_prefix: Option<String>,
    pub rows: i32,
    pub spacing_x: Option<f32>,
    pub spacing_y: Option<f32>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_texture_atlas sets the source defaults
impl Default for TextureAtlas {
    fn default() -> Self {
        return TextureAtlas {
            runtime: EntityRuntimeSlot::default(),
            image_height: 0.0,
            image_name: None,
            image_width: 0.0,
            regions: Vec::new(),
            scale: 1.0,
            texture: None,
            next_region_id_mark: 0,
            region_textures: Mutex::new(Vec::new()),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_texture_atlas_region sets the source defaults
impl Default for TextureAtlasRegion {
    fn default() -> Self {
        return TextureAtlasRegion {
            runtime: EntityRuntimeSlot::default(),
            height: 0.0,
            id: -1,
            name: None,
            original_height: None,
            original_width: None,
            page_name: None,
            pivot_x: None,
            pivot_y: None,
            rotation: TextureAtlasRotation::None,
            source_x: 0.0,
            source_y: 0.0,
            trimmed: false,
            x: 0.0,
            y: 0.0,
            width: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the private caches hold handles, so Debug reports the public atlas data
impl fmt::Debug for TextureAtlas {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("TextureAtlas")
            .field("image_height", &self.image_height)
            .field("image_name", &self.image_name)
            .field("image_width", &self.image_width)
            .field("regions", &self.regions.len())
            .field("scale", &self.scale)
            .field("texture", &self.texture.is_some())
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the guard is a closure, so Debug reports whether one is installed
impl fmt::Debug for TextureAtlasGuardState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("TextureAtlasGuardState")
            .field("enabled", &self.enabled)
            .field("guard", &self.guard.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(TextureAtlas);
flight_entity::impl_entity!(TextureAtlasRegion);
