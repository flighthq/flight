use std::fmt;
use std::ops::{Deref, DerefMut};

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref, Uint8Array};
use flight_geometry::{Vector2, create_vector2};

// flight-lint: allow-file(contract-vocabulary) D16 general open-family traits preserve TextureSource dispatch and the closed Texture family without erased fields

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AlphaType {
    Opaque,
    Premultiplied,
    #[default]
    Straight,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum PixelFormat {
    Bgra8Unorm,
    #[default]
    Rgba8Unorm,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RenderTargetColorSpace {
    Linear,
    #[default]
    Srgb,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureColorSpace {
    Linear,
    #[default]
    Srgb,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureDimension {
    #[default]
    Texture2D,
    Texture2DArray,
    Texture3D,
    Cube,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureFilter {
    Linear,
    #[default]
    LinearMipmapLinear,
    LinearMipmapNearest,
    Nearest,
    NearestMipmapLinear,
    NearestMipmapNearest,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureGamut {
    DisplayP3,
    #[default]
    Srgb,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TextureWrap {
    #[default]
    ClampToEdge,
    MirrorRepeat,
    Repeat,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Sampler {
    runtime: EntityRuntimeSlot,
    pub anisotropy: f32,
    pub mag_filter: TextureFilter,
    pub min_filter: TextureFilter,
    pub mipmaps: bool,
    pub wrap_u: TextureWrap,
    pub wrap_v: TextureWrap,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SamplerOptions {
    pub anisotropy: Option<f32>,
    pub mag_filter: Option<TextureFilter>,
    pub min_filter: Option<TextureFilter>,
    pub mipmaps: Option<bool>,
    pub wrap_u: Option<TextureWrap>,
    pub wrap_v: Option<TextureWrap>,
}

#[derive(Clone, Debug)]
pub struct TextureSourceFields {
    runtime: EntityRuntimeSlot,
    pub alpha_type: AlphaType,
    pub gamut: TextureGamut,
    pub height: u32,
    pub kind: Kind,
    pub version: u32,
    pub width: u32,
}

/// Open source family. Concrete source crates compose `TextureSourceFields` and implement this
/// trait; `kind` remains an open string used by renderer dispatch tables.
pub trait TextureSource: Entity + fmt::Debug + Send + Sync {
    fn texture_source_fields(&self) -> &TextureSourceFields;
    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields;
}

pub type TextureSourceKind = Kind;
pub type TextureSourceRef = Ref<dyn TextureSource>;
pub type TextureSourceCubeFaces = [Option<TextureSourceRef>; 6];

#[derive(Clone, Debug)]
pub struct VoxelGrid {
    pub(crate) fields: TextureSourceFields,
    pub data: Box<Uint8Array>,
    pub depth: u32,
    pub format: PixelFormat,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextureFields {
    pub(crate) runtime: EntityRuntimeSlot,
    pub color_space: TextureColorSpace,
    pub flip_x: bool,
    pub flip_y: bool,
    pub sampler: Sampler,
    pub uv_offset: Vector2,
    pub uv_rotation: f32,
    pub uv_scale: Vector2,
    pub version: u32,
}

pub trait TextureUvTransform {
    fn texture_fields(&self) -> &TextureFields;
    fn texture_fields_mut(&mut self) -> &mut TextureFields;
}

/// Structural texture view accepted by the universal helpers. The dimension is closed while the
/// source objects it points at remain an open family.
pub trait TextureVariant: TextureUvTransform + fmt::Debug {
    fn dimension(&self) -> TextureDimension;
    fn source_2d(&self) -> Option<&Option<TextureSourceRef>> {
        return None;
    }
    fn source_2d_mut(&mut self) -> Option<&mut Option<TextureSourceRef>> {
        return None;
    }
    fn source_3d(&self) -> Option<&Option<Ref<VoxelGrid>>> {
        return None;
    }
    fn source_3d_mut(&mut self) -> Option<&mut Option<Ref<VoxelGrid>>> {
        return None;
    }
    fn sources_2d_array(&self) -> Option<&Vec<Option<TextureSourceRef>>> {
        return None;
    }
    fn sources_2d_array_mut(&mut self) -> Option<&mut Vec<Option<TextureSourceRef>>> {
        return None;
    }
    fn sources_cube(&self) -> Option<&TextureSourceCubeFaces> {
        return None;
    }
    fn sources_cube_mut(&mut self) -> Option<&mut TextureSourceCubeFaces> {
        return None;
    }
}

#[derive(Clone, Debug)]
pub struct Texture2D {
    pub(crate) fields: TextureFields,
    pub source: Option<TextureSourceRef>,
}

#[derive(Clone, Debug)]
pub struct Texture2DArray {
    pub(crate) fields: TextureFields,
    pub sources: Vec<Option<TextureSourceRef>>,
}

#[derive(Clone, Debug)]
pub struct Texture3D {
    pub(crate) fields: TextureFields,
    pub source: Option<Ref<VoxelGrid>>,
}

#[derive(Clone, Debug)]
pub struct CubeTexture {
    pub(crate) fields: TextureFields,
    pub sources: TextureSourceCubeFaces,
}

/// Closed hardware texture-dimension family. Every payload is named and is independently an Entity;
/// the union itself carries no second runtime slot (D12).
#[derive(Clone, Debug)]
pub enum Texture {
    Texture2D(Texture2D),
    Texture2DArray(Texture2DArray),
    Texture3D(Texture3D),
    Cube(CubeTexture),
}

#[derive(Clone, Debug, Default)]
pub struct CreateTextureCommonOptions {
    pub color_space: Option<TextureColorSpace>,
    pub flip_x: Option<bool>,
    pub flip_y: Option<bool>,
    pub sampler: Option<Sampler>,
    pub uv_offset: Option<Vector2>,
    pub uv_rotation: Option<f32>,
    pub uv_scale: Option<Vector2>,
    pub version: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct CreateTexture2DOptions {
    pub common: CreateTextureCommonOptions,
    pub source: Option<TextureSourceRef>,
}

#[derive(Clone, Debug, Default)]
pub struct CreateTexture2DArrayOptions {
    pub common: CreateTextureCommonOptions,
    pub sources: Option<Vec<Option<TextureSourceRef>>>,
}

#[derive(Clone, Debug, Default)]
pub struct CreateTexture3DOptions {
    pub common: CreateTextureCommonOptions,
    pub source: Option<Ref<VoxelGrid>>,
}

#[derive(Clone, Debug, Default)]
pub struct CreateTextureCubeOptions {
    pub common: CreateTextureCommonOptions,
    pub sources: Option<TextureSourceCubeFaces>,
}

#[derive(Clone, Debug)]
pub enum CreateTextureOptions {
    Texture2D(CreateTexture2DOptions),
    Texture2DArray(CreateTexture2DArrayOptions),
    Texture3D(CreateTexture3DOptions),
    Cube(CreateTextureCubeOptions),
}

#[derive(Clone, Debug, Default)]
pub struct CreateCubeTextureOptions {
    pub color_space: Option<TextureColorSpace>,
    pub sampler: Option<Sampler>,
    pub sources: Option<TextureSourceCubeFaces>,
}

impl Default for Sampler {
    fn default() -> Self {
        return Sampler {
            runtime: EntityRuntimeSlot::default(),
            anisotropy: 1.0,
            mag_filter: TextureFilter::Linear,
            min_filter: TextureFilter::LinearMipmapLinear,
            mipmaps: true,
            wrap_u: TextureWrap::ClampToEdge,
            wrap_v: TextureWrap::ClampToEdge,
        };
    }
}

impl Default for TextureSourceFields {
    fn default() -> Self {
        return TextureSourceFields {
            runtime: EntityRuntimeSlot::default(),
            alpha_type: AlphaType::Straight,
            gamut: TextureGamut::Srgb,
            height: 0,
            kind: String::new(),
            version: 0,
            width: 0,
        };
    }
}

impl Default for VoxelGrid {
    fn default() -> Self {
        let mut fields = TextureSourceFields::default();
        fields.kind = VOXEL_GRID_TEXTURE_SOURCE_KIND.to_string();
        return VoxelGrid {
            fields,
            data: Vec::new().into_boxed_slice(),
            depth: 0,
            format: PixelFormat::Rgba8Unorm,
        };
    }
}

impl Default for TextureFields {
    fn default() -> Self {
        return TextureFields {
            runtime: EntityRuntimeSlot::default(),
            color_space: TextureColorSpace::Srgb,
            flip_x: false,
            flip_y: false,
            sampler: Sampler::default(),
            uv_offset: create_vector2(0.0, 0.0),
            uv_rotation: 0.0,
            uv_scale: create_vector2(1.0, 1.0),
            version: 0,
        };
    }
}

impl Default for Texture2D {
    fn default() -> Self {
        return Texture2D {
            fields: TextureFields::default(),
            source: None,
        };
    }
}

impl Default for Texture2DArray {
    fn default() -> Self {
        return Texture2DArray {
            fields: TextureFields::default(),
            sources: Vec::new(),
        };
    }
}

impl Default for Texture3D {
    fn default() -> Self {
        return Texture3D {
            fields: TextureFields::default(),
            source: None,
        };
    }
}

impl Default for CubeTexture {
    fn default() -> Self {
        return CubeTexture {
            fields: TextureFields::default(),
            sources: std::array::from_fn(|_| None),
        };
    }
}

impl Default for Texture {
    fn default() -> Self {
        return Texture::Texture2D(Texture2D::default());
    }
}

impl Default for CreateTextureOptions {
    fn default() -> Self {
        return CreateTextureOptions::Texture2D(CreateTexture2DOptions::default());
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for VoxelGrid {
    type Target = TextureSourceFields;
    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for VoxelGrid {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 Entity implementation delegates the composed runtime slot
impl Entity for VoxelGrid {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 family implementation exposes the composed source fields
impl TextureSource for VoxelGrid {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }
    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

macro_rules! impl_texture_variant {
    ($type:ty, $dimension:expr, $source:ident, $source_mut:ident, $field:ident, $return_type:ty) => {
        impl Deref for $type {
            type Target = TextureFields;
            fn deref(&self) -> &TextureFields {
                return &self.fields;
            }
        }
        impl DerefMut for $type {
            fn deref_mut(&mut self) -> &mut TextureFields {
                return &mut self.fields;
            }
        }
        impl Entity for $type {
            fn entity_runtime(&self) -> &EntityRuntimeSlot {
                return self.fields.entity_runtime();
            }
            fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
                return self.fields.entity_runtime_mut();
            }
        }
        impl TextureUvTransform for $type {
            fn texture_fields(&self) -> &TextureFields {
                return &self.fields;
            }
            fn texture_fields_mut(&mut self) -> &mut TextureFields {
                return &mut self.fields;
            }
        }
        impl TextureVariant for $type {
            fn dimension(&self) -> TextureDimension {
                return $dimension;
            }
            fn $source(&self) -> Option<&$return_type> {
                return Some(&self.$field);
            }
            fn $source_mut(&mut self) -> Option<&mut $return_type> {
                return Some(&mut self.$field);
            }
        }
    };
}

impl_texture_variant!(
    Texture2D,
    TextureDimension::Texture2D,
    source_2d,
    source_2d_mut,
    source,
    Option<TextureSourceRef>
);
impl_texture_variant!(
    Texture2DArray,
    TextureDimension::Texture2DArray,
    sources_2d_array,
    sources_2d_array_mut,
    sources,
    Vec<Option<TextureSourceRef>>
);
impl_texture_variant!(
    Texture3D,
    TextureDimension::Texture3D,
    source_3d,
    source_3d_mut,
    source,
    Option<Ref<VoxelGrid>>
);
impl_texture_variant!(
    CubeTexture,
    TextureDimension::Cube,
    sources_cube,
    sources_cube_mut,
    sources,
    TextureSourceCubeFaces
);

// flight-lint: allow(sugar-delegates) closed-union forwarding preserves the runtime-free Texture enum required by D12
impl TextureUvTransform for Texture {
    fn texture_fields(&self) -> &TextureFields {
        return match self {
            Texture::Texture2D(value) => value.texture_fields(),
            Texture::Texture2DArray(value) => value.texture_fields(),
            Texture::Texture3D(value) => value.texture_fields(),
            Texture::Cube(value) => value.texture_fields(),
        };
    }
    fn texture_fields_mut(&mut self) -> &mut TextureFields {
        return match self {
            Texture::Texture2D(value) => value.texture_fields_mut(),
            Texture::Texture2DArray(value) => value.texture_fields_mut(),
            Texture::Texture3D(value) => value.texture_fields_mut(),
            Texture::Cube(value) => value.texture_fields_mut(),
        };
    }
}

// flight-lint: allow(sugar-delegates) closed-union forwarding preserves the runtime-free Texture enum required by D12
impl TextureVariant for Texture {
    fn dimension(&self) -> TextureDimension {
        return match self {
            Texture::Texture2D(value) => value.dimension(),
            Texture::Texture2DArray(value) => value.dimension(),
            Texture::Texture3D(value) => value.dimension(),
            Texture::Cube(value) => value.dimension(),
        };
    }
    fn source_2d(&self) -> Option<&Option<TextureSourceRef>> {
        return match self {
            Texture::Texture2D(value) => value.source_2d(),
            _ => None,
        };
    }
    fn source_2d_mut(&mut self) -> Option<&mut Option<TextureSourceRef>> {
        return match self {
            Texture::Texture2D(value) => value.source_2d_mut(),
            _ => None,
        };
    }
    fn source_3d(&self) -> Option<&Option<Ref<VoxelGrid>>> {
        return match self {
            Texture::Texture3D(value) => value.source_3d(),
            _ => None,
        };
    }
    fn source_3d_mut(&mut self) -> Option<&mut Option<Ref<VoxelGrid>>> {
        return match self {
            Texture::Texture3D(value) => value.source_3d_mut(),
            _ => None,
        };
    }
    fn sources_2d_array(&self) -> Option<&Vec<Option<TextureSourceRef>>> {
        return match self {
            Texture::Texture2DArray(value) => value.sources_2d_array(),
            _ => None,
        };
    }
    fn sources_2d_array_mut(&mut self) -> Option<&mut Vec<Option<TextureSourceRef>>> {
        return match self {
            Texture::Texture2DArray(value) => value.sources_2d_array_mut(),
            _ => None,
        };
    }
    fn sources_cube(&self) -> Option<&TextureSourceCubeFaces> {
        return match self {
            Texture::Cube(value) => value.sources_cube(),
            _ => None,
        };
    }
    fn sources_cube_mut(&mut self) -> Option<&mut TextureSourceCubeFaces> {
        return match self {
            Texture::Cube(value) => value.sources_cube_mut(),
            _ => None,
        };
    }
}

flight_entity::impl_entity!(Sampler);
flight_entity::impl_entity!(TextureFields);
flight_entity::impl_entity!(TextureSourceFields);

pub const CUBE_FACE_POSITIVE_X: usize = 0;
pub const CUBE_FACE_NEGATIVE_X: usize = 1;
pub const CUBE_FACE_POSITIVE_Y: usize = 2;
pub const CUBE_FACE_NEGATIVE_Y: usize = 3;
pub const CUBE_FACE_POSITIVE_Z: usize = 4;
pub const CUBE_FACE_NEGATIVE_Z: usize = 5;
pub const SAMPLER_KIND: &str = "Sampler";
pub const TEXTURE_KIND: &str = "Texture";
pub const VOXEL_GRID_TEXTURE_SOURCE_KIND: &str = "voxelGrid";
