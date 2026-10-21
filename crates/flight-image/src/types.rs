use std::fmt;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock};

use flight_bitmap::HostImageSource;
use flight_entity::{Entity, EntityRuntimeSlot, Ref, Uint8Array};
use flight_texture::{AlphaType, TextureGamut, TextureSource, TextureSourceFields};
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerSupercompression,
};

pub const COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND: &str = "compressedImage";
pub const IMAGE_TEXTURE_SOURCE_KIND: &str = "image";

/// Container metadata and the exact encoded payload allocation supplied by its parser.
#[derive(Clone, Debug)]
pub struct CompressedImageData {
    pub container: TextureContainer,
    pub payload: Ref<Box<Uint8Array>>,
}

/// GPU-only block-compressed image source.
#[derive(Clone, Debug)]
pub struct CompressedImageResource {
    pub(crate) fields: TextureSourceFields,
    pub compressed: Arc<CompressedImageData>,
}

/// Host-drawable image source. The host handle is borrowed and retained by exact shared identity.
#[derive(Clone, Debug)]
pub struct ImageResource {
    pub(crate) fields: TextureSourceFields,
    pub source: Ref<HostImageSource>,
}

/// Pixel size written by a host-owned source resolver.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HostImageDimensions {
    pub height: u32,
    pub width: u32,
}

/// Host-owned measurement callback. The exact shared source identity is never unwrapped or copied.
pub type HostImageDimensionResolver =
    Arc<dyn Fn(&Ref<HostImageSource>, &mut HostImageDimensions) -> bool + Send + Sync>;

/// Explicit caller-owned state replacing the source module's hidden resolver slot. Registration is
/// ordered and last-wins; unregistering clears the current slot.
#[derive(Clone, Default)]
pub struct ImageResolverState {
    pub(crate) dimension_resolver: Option<HostImageDimensionResolver>,
}

impl Default for CompressedImageData {
    fn default() -> Self {
        return Self {
            container: TextureContainer {
                format: TextureContainerFormat::Rgba8Unorm,
                width: 0,
                height: 0,
                depth: 0,
                mip_levels: 0,
                layers: 0,
                faces: 0,
                supercompression: TextureContainerSupercompression::None,
                levels: Vec::new(),
            },
            payload: Arc::new(RwLock::new(Vec::new().into_boxed_slice())),
        };
    }
}

impl Default for CompressedImageResource {
    fn default() -> Self {
        let mut fields = TextureSourceFields::default();
        fields.kind = COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string();
        return Self {
            fields,
            compressed: Arc::new(CompressedImageData::default()),
        };
    }
}

impl Default for ImageResource {
    fn default() -> Self {
        let mut fields = TextureSourceFields::default();
        fields.kind = IMAGE_TEXTURE_SOURCE_KIND.to_string();
        return Self {
            fields,
            source: Arc::new(RwLock::new(HostImageSource)),
        };
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for CompressedImageResource {
    type Target = TextureSourceFields;

    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for CompressedImageResource {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 Entity implementation delegates the composed runtime slot
impl Entity for CompressedImageResource {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 family implementation exposes the composed source fields
impl TextureSource for CompressedImageResource {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }

    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for ImageResource {
    type Target = TextureSourceFields;

    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for ImageResource {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 Entity implementation delegates the composed runtime slot
impl Entity for ImageResource {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 family implementation exposes the composed source fields
impl TextureSource for ImageResource {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }

    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// Ensure these canonical source facts stay named in this owner even though defaults come from
// TextureSourceFields.
const _: (AlphaType, TextureGamut) = (AlphaType::Straight, TextureGamut::Srgb);

impl fmt::Debug for ImageResolverState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter
            .debug_struct("ImageResolverState")
            .field("has_dimension_resolver", &self.dimension_resolver.is_some())
            .finish();
    }
}
