use std::fmt;
use std::future::Future;
use std::ops::{Deref, DerefMut};
use std::pin::Pin;
use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, HostImageSource};
use flight_entity::{Entity, EntityRuntimeSlot, Ref, Uint8Array};
use flight_hostcapability::ProviderRef;
use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, ImageDecodeOptions, ImageEncodeOptions,
};
use flight_resource::ResourceResolutionState;
use flight_stream::AbortSignal;
use flight_surface::Surface;
use flight_texture::{AlphaType, Texture2D, TextureGamut, TextureSource, TextureSourceFields};
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

/// Stable category retained for a failed image reference.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ImageResourceFailureKind {
    #[default]
    Error,
    Unavailable,
}

/// Discriminant for an encoded image resource reference.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ImageResourceReferenceKind {
    #[default]
    Embedded,
    External,
}

/// The two credential modes accepted by the host URL-loader seam.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageCrossOrigin {
    Anonymous,
    UseCredentials,
}

/// Closed operation keys of `HostImageCapability`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageOperation {
    CreateImageFromBitmap,
    CreateImageFromSurface,
    LoadImageFromUrl,
}

/// One serialization-safe failure retained by an image reference.
#[derive(Clone, Default)]
pub struct ImageResourceFailure {
    pub kind: ImageResourceFailureKind,
    pub message: String,
    pub name: Option<String>,
    runtime: EntityRuntimeSlot,
}

/// Plain format-owned data selecting a registered bitmap composer.
#[derive(Clone, Debug)]
pub struct ImageBitmapComposition {
    pub kind: String,
    pub payload: Ref<Box<Uint8Array>>,
}

/// Parser-retained encoded bytes and the textures waiting for their decoded source. The byte view
/// and every texture handle retain the exact allocations supplied by their respective callers.
pub struct EmbeddedImageResourceReference {
    pub alpha_type: AlphaType,
    pub bitmap_composition: Option<ImageBitmapComposition>,
    pub bytes: Ref<Box<Uint8Array>>,
    pub failure: Option<Ref<ImageResourceFailure>>,
    pub mime_type: Option<String>,
    pub state: ResourceResolutionState,
    pub textures: Vec<Ref<Texture2D>>,
    runtime: EntityRuntimeSlot,
}

/// URI-backed image reference resolved through a caller-owned fetch seam.
pub struct ExternalImageResourceReference {
    pub base_path: Option<String>,
    pub failure: Option<Ref<ImageResourceFailure>>,
    pub mime_type: Option<String>,
    pub state: ResourceResolutionState,
    pub textures: Vec<Ref<Texture2D>>,
    pub uri: String,
    runtime: EntityRuntimeSlot,
}

/// Named payload retaining one embedded reference entity handle in the untagged source union.
#[derive(Clone)]
pub struct EmbeddedImageResourceReferenceValue {
    pub reference: Ref<EmbeddedImageResourceReference>,
}

/// Named payload retaining one external reference entity handle in the untagged source union.
#[derive(Clone)]
pub struct ExternalImageResourceReferenceValue {
    pub reference: Ref<ExternalImageResourceReference>,
}

/// The source's two-member reference union. The existing kind is supplied by the exact variant;
/// the enum carries no second entity runtime or synthetic serialized discriminant.
#[derive(Clone)]
pub enum ImageResourceReference {
    Embedded(EmbeddedImageResourceReferenceValue),
    External(ExternalImageResourceReferenceValue),
}

/// Detached diagnostic view of one reference resolution.
#[derive(Clone)]
pub struct ImageResourceReferenceResolutionExplanation {
    pub failure: Option<Ref<ImageResourceFailure>>,
    pub kind: ImageResourceReferenceKind,
    pub retryable: bool,
    pub state: ResourceResolutionState,
}

/// Explicit caller-owned browser-origin context replacing the source's reads of global `location`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImageUrlOriginContext {
    pub href: String,
    pub origin: String,
}

/// Executor-neutral result of a format decoder.
pub type ImageDecoderFuture = Pin<Box<dyn Future<Output = DecodedImage> + Send>>;

/// Executor-neutral result of the optional image decode fallback.
pub type ImageDecodeFallbackFuture = Pin<Box<dyn Future<Output = Option<DecodedImage>> + Send>>;

/// Executor-neutral result of a format encoder.
pub type ImageEncoderFuture = Pin<Box<dyn Future<Output = Box<Uint8Array>> + Send>>;

/// Executor-neutral result of a registered composition resolver.
pub type ImageBitmapCompositionFuture = Pin<Box<dyn Future<Output = Option<Ref<Bitmap>>> + Send>>;

/// Executor-neutral result of an external image fetch.
pub type ImageResourceFuture = Pin<Box<dyn Future<Output = Option<Ref<ImageResource>>> + Send>>;

/// Executor-neutral result of the required host URL-loader callback.
pub type HostImageResourceFuture = Pin<Box<dyn Future<Output = Ref<ImageResource>> + Send>>;

/// A per-format DOM-free image decoder.
pub type ImageDecoder = Arc<
    dyn Fn(Ref<Box<Uint8Array>>, Option<ImageDecodeOptions>) -> ImageDecoderFuture + Send + Sync,
>;

/// Optional caller decoder used after the standard capability reports an expected miss.
pub type ImageDecodeFallback = Arc<
    dyn Fn(Ref<Box<Uint8Array>>, String, Option<ImageDecodeOptions>) -> ImageDecodeFallbackFuture
        + Send
        + Sync,
>;

/// A per-format DOM-free image encoder.
pub type ImageEncoder =
    Arc<dyn Fn(Arc<DecodedImage>, Option<ImageEncodeOptions>) -> ImageEncoderFuture + Send + Sync>;

/// Synchronous format-owned decoded-pixel composer.
pub type ImageBitmapComposer =
    Arc<dyn Fn(Option<&DecodedImage>, &Uint8Array) -> Option<Ref<Bitmap>> + Send + Sync>;

/// Optional decoded-pixel join installed into embedded-reference resolution.
pub type ImageBitmapCompositionResolver = Arc<
    dyn Fn(
            &HostImageDecodeCapabilities,
            Ref<EmbeddedImageResourceReference>,
            AbortSignal,
        ) -> ImageBitmapCompositionFuture
        + Send
        + Sync,
>;

/// Caller-owned fetch seam for an external image reference. Both the reference and AbortSignal are
/// passed by shared identity; `None` is the source's expected miss.
pub type ImageResourceFetch = Arc<
    dyn Fn(Ref<ExternalImageResourceReference>, AbortSignal) -> ImageResourceFuture + Send + Sync,
>;

/// Host image materialization and URL loading capability. Optional synchronous bridges are true
/// capability absence; the required URL callback is the single portable loading boundary.
#[derive(Clone)]
pub struct HostImageCapability {
    pub create_image_from_bitmap: Option<Arc<dyn Fn(&Bitmap) -> Ref<ImageResource> + Send + Sync>>,
    pub create_image_from_surface:
        Option<Arc<dyn Fn(&Surface) -> Ref<ImageResource> + Send + Sync>>,
    pub load_image_from_url: Arc<
        dyn Fn(String, Option<ImageCrossOrigin>, Option<AbortSignal>) -> HostImageResourceFuture
            + Send
            + Sync,
    >,
    pub provider: ProviderRef,
}

/// Image capability group aggregated by the top-level host.
#[derive(Clone, Default)]
pub struct HostImageCapabilities {
    pub loader: Option<HostImageCapability>,
}

/// Host-owned measurement callback. The exact shared source identity is never unwrapped or copied.
pub type HostImageDimensionResolver =
    Arc<dyn Fn(&Ref<HostImageSource>, &mut HostImageDimensions) -> bool + Send + Sync>;

/// Explicit caller-owned state replacing the source module's hidden resolver slot. Registration is
/// ordered and last-wins; unregistering clears the current slot.
#[derive(Clone, Default)]
pub struct ImageResolverState {
    pub(crate) bitmap_composition_resolver: Option<ImageBitmapCompositionResolver>,
    pub(crate) dimension_resolver: Option<HostImageDimensionResolver>,
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the inline TS crossOrigin literal union
pub fn get_image_cross_origin_string(value: ImageCrossOrigin) -> &'static str {
    return match value {
        ImageCrossOrigin::Anonymous => "anonymous",
        ImageCrossOrigin::UseCredentials => "use-credentials",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS ImageOperation keyof union; the TS package exports no conversion function
pub fn get_image_operation_string(value: ImageOperation) -> &'static str {
    return match value {
        ImageOperation::CreateImageFromBitmap => "createImageFromBitmap",
        ImageOperation::CreateImageFromSurface => "createImageFromSurface",
        ImageOperation::LoadImageFromUrl => "loadImageFromUrl",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS ImageResourceFailureKind const union; the TS package exports no conversion function
pub fn get_image_resource_failure_kind_string(value: ImageResourceFailureKind) -> &'static str {
    return match value {
        ImageResourceFailureKind::Error => "Error",
        ImageResourceFailureKind::Unavailable => "Unavailable",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust string table for the TS ImageResourceReferenceKind const union; the TS package exports no conversion function
pub fn get_image_resource_reference_kind_string(value: ImageResourceReferenceKind) -> &'static str {
    return match value {
        ImageResourceReferenceKind::Embedded => "Embedded",
        ImageResourceReferenceKind::External => "External",
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the inline TS crossOrigin literal union
pub fn parse_image_cross_origin(value: &str) -> Option<ImageCrossOrigin> {
    return match value {
        "anonymous" => Some(ImageCrossOrigin::Anonymous),
        "use-credentials" => Some(ImageCrossOrigin::UseCredentials),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS ImageOperation keyof union; the TS package exports no conversion function
pub fn parse_image_operation(value: &str) -> Option<ImageOperation> {
    return match value {
        "createImageFromBitmap" => Some(ImageOperation::CreateImageFromBitmap),
        "createImageFromSurface" => Some(ImageOperation::CreateImageFromSurface),
        "loadImageFromUrl" => Some(ImageOperation::LoadImageFromUrl),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS ImageResourceFailureKind const union; the TS package exports no conversion function
pub fn parse_image_resource_failure_kind(value: &str) -> Option<ImageResourceFailureKind> {
    return match value {
        "Error" => Some(ImageResourceFailureKind::Error),
        "Unavailable" => Some(ImageResourceFailureKind::Unavailable),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e exact Rust parser for the TS ImageResourceReferenceKind const union; the TS package exports no conversion function
pub fn parse_image_resource_reference_kind(value: &str) -> Option<ImageResourceReferenceKind> {
    return match value {
        "Embedded" => Some(ImageResourceReferenceKind::Embedded),
        "External" => Some(ImageResourceReferenceKind::External),
        _ => None,
    };
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

impl Default for EmbeddedImageResourceReference {
    fn default() -> Self {
        return Self {
            alpha_type: AlphaType::Straight,
            bitmap_composition: None,
            bytes: Arc::new(RwLock::new(Vec::new().into_boxed_slice())),
            failure: None,
            mime_type: None,
            state: ResourceResolutionState::Unresolved,
            textures: Vec::new(),
            runtime: EntityRuntimeSlot::default(),
        };
    }
}

impl Default for ExternalImageResourceReference {
    fn default() -> Self {
        return Self {
            base_path: None,
            failure: None,
            mime_type: None,
            state: ResourceResolutionState::Unresolved,
            textures: Vec::new(),
            uri: String::new(),
            runtime: EntityRuntimeSlot::default(),
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
            .field(
                "has_bitmap_composition_resolver",
                &self.bitmap_composition_resolver.is_some(),
            )
            .field("has_dimension_resolver", &self.dimension_resolver.is_some())
            .finish();
    }
}

impl ImageCrossOrigin {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_image_cross_origin(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_image_cross_origin_string(self);
    }
}

impl ImageOperation {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_image_operation(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_image_operation_string(self);
    }
}

impl ImageResourceFailureKind {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_image_resource_failure_kind(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_image_resource_failure_kind_string(self);
    }
}

impl ImageResourceReferenceKind {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_image_resource_reference_kind(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_image_resource_reference_kind_string(self);
    }
}

flight_entity::impl_entity!(ImageResourceFailure);
flight_entity::impl_entity!(EmbeddedImageResourceReference);
flight_entity::impl_entity!(ExternalImageResourceReference);
