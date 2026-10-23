use std::fmt;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use flight_entity::{Entity, EntityRuntimeSlot, Uint8Array};
use flight_host::{HostImageSource, ProviderRef};
pub(crate) use flight_texture::{AlphaType, PixelFormat, TextureGamut};
use flight_texture::{TextureSource, TextureSourceFields};

// Types shared across flight-bitmap modules.
// These correspond to types imported from @flighthq/types/contract in the TS codebase.

/// Edge mode for out-of-bounds pixel sampling.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapEdgeMode {
    Transparent,
    Clamp,
    Wrap,
    Mirror,
}

/// Resize / sampling interpolation mode.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapResizeMode {
    Nearest,
    Bilinear,
    Bicubic,
}

/// Composite blending / Porter-Duff mode.
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum BitmapCompositeMode {
    Normal = 0,
    Multiply = 1,
    Screen = 2,
    Add = 3,
    Subtract = 4,
    Darken = 5,
    Lighten = 6,
    Difference = 7,
    Exclusion = 8,
    Overlay = 9,
    HardLight = 10,
    SoftLight = 11,
    ColorDodge = 12,
    ColorBurn = 13,
    Invert = 14,
    SourceOver = 15,
    DestinationOver = 16,
    SourceIn = 17,
    DestinationIn = 18,
    SourceOut = 19,
    DestinationOut = 20,
    SourceAtop = 21,
    DestinationAtop = 22,
    Xor = 23,
    Copy = 24,
    Clear = 25,
}

/// RGBA image channel index.
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum ImageChannel {
    Red = 0,
    Green = 1,
    Blue = 2,
    Alpha = 3,
}

/// Pixel byte ordering.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PixelOrder {
    Rgba,
    Bgra,
    Argb,
    Abgr,
}

/// Gradient spread mode.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GradientSpread {
    Pad,
    Repeat,
    Reflect,
}

/// Image encoding format.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ImageFormat {
    Png,
    Jpeg,
}

/// Threshold comparison operation.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ThresholdOperation {
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    Equal,
    NotEqual,
}

/// Displacement map legacy mode (when edgeMode is None).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DisplacementMode {
    Wrap,
    Clamp,
    Ignore,
    Color,
}

/// Which side of the source edge a bitmap bevel or gradient bevel draws on (TS `BitmapBevelType`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapBevelType {
    Inner,
    Outer,
    Both,
}

/// Readback mode for bitmap capture.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapReadbackMode {
    Bitmap,
    Probe,
}

/// Readback block reason.
#[derive(Clone, Debug, PartialEq)]
pub enum BitmapReadbackBlockReason {
    Ok,
    EmptySize,
    TaintedSource,
    NoCanvas,
    BackendNotInstalled,
}

/// The reasons a readback host can report (TS `BitmapReadbackBackendReason`): the block reasons less
/// `backend-not-installed` and `empty-size`, which only the portable side decides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BitmapReadbackBackendReason {
    NoCanvas,
    Ok,
    TaintedSource,
}

/// The texture-source kind a Bitmap declares (TS `BitmapTextureSourceKind`): an open registry key.
pub const BITMAP_TEXTURE_SOURCE_KIND: &str = "bitmap";

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

/// Mutable, CPU-readable pixel bytes (TS `Bitmap extends TextureSource`). The shared texture-source
/// facts (entity identity, alpha type, gamut, dimensions, open `kind`, version) are the composed
/// `TextureSourceFields`, reached through `Deref`; `data` is the RGBA8 pixel payload (clamped-u8
/// stores) and `format` its channel order.
#[derive(Clone, Debug)]
pub struct Bitmap {
    pub(crate) fields: TextureSourceFields,
    pub data: Box<Uint8Array>,
    pub format: PixelFormat,
}

/// A rectangular sub-region of a Bitmap, referencing the bitmap by index or
/// carrying a clone depending on context. In the Rust-as-IR pattern we keep
/// the bitmap inline so that free functions can mutate through the region.
#[derive(Clone, Debug)]
pub struct BitmapRegion {
    pub bitmap: Bitmap,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Axis-aligned rectangle with floating-point coordinates.
#[derive(Clone, Debug, Default)]
// flight-lint: allow(f64) RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle
pub struct RectangleLike {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Bitmap mismatch summary.
#[derive(Clone, Debug, Default)]
// flight-lint: allow(f64) BitmapMismatch.fraction mirrors TS number; pixel-count ratio exceeding f32 exact range
pub struct BitmapMismatch {
    pub mismatched_pixels: u32,
    pub total_pixels: u32,
    pub fraction: f64,
    pub max_channel_delta: u32,
}

/// Per-channel histogram (256 bins each).
#[derive(Clone, Debug)]
pub struct BitmapHistogram {
    pub red: Vec<u32>,
    pub green: Vec<u32>,
    pub blue: Vec<u32>,
    pub alpha: Vec<u32>,
}

/// Coarse fingerprint for regression gating.
#[derive(Clone, Debug)]
pub struct BitmapFingerprint {
    runtime: EntityRuntimeSlot,
    pub grid_size: u32,
    pub cells: Vec<u8>,
}

// ---------------------------------------------------------------------------
// Options structs
// ---------------------------------------------------------------------------

/// Options for box blur.
#[derive(Clone, Debug)]
pub struct BitmapBoxBlurOptions {
    pub radius_x: Option<i32>,
    pub radius_y: Option<i32>,
    pub passes: Option<i32>,
}

/// Options for shadow blur passes (shared by shadow/glow/bevel).
#[derive(Clone, Debug, Default)]
pub struct BitmapShadowBlurOptions {
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for bevel effect.
#[derive(Clone, Debug)]
pub struct BitmapBevelOptions {
    pub angle: Option<f32>,
    pub distance: Option<f32>,
    pub type_: Option<BitmapBevelType>,
    pub intensity: Option<f32>,
    pub highlight_color: Option<u32>,
    pub shadow_color: Option<u32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for convolution.
#[derive(Clone, Debug)]
pub struct BitmapConvolutionOptions {
    pub matrix: Vec<f32>,
    pub matrix_x: i32,
    pub matrix_y: i32,
    pub divisor: Option<f32>,
    pub bias: Option<f32>,
    pub edge: Option<BitmapEdgeMode>,
    pub preserve_alpha: Option<bool>,
}

/// Options for displacement map.
#[derive(Clone, Debug)]
pub struct BitmapDisplacementMapOptions {
    pub map: BitmapRegion,
    pub component_x: Option<u32>,
    pub component_y: Option<u32>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub edge_mode: Option<BitmapEdgeMode>,
    pub mode: Option<DisplacementMode>,
    pub fill_color: Option<u32>,
}

/// Options for drop shadow.
#[derive(Clone, Debug, Default)]
pub struct BitmapDropShadowOptions {
    pub color: Option<u32>,
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for glow.
#[derive(Clone, Debug, Default)]
pub struct BitmapGlowOptions {
    pub color: Option<u32>,
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for inner glow.
#[derive(Clone, Debug, Default)]
pub struct BitmapInnerGlowOptions {
    pub color: Option<u32>,
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for inner shadow.
#[derive(Clone, Debug, Default)]
pub struct BitmapInnerShadowOptions {
    pub color: Option<u32>,
    pub intensity: Option<f32>,
    pub offset_x: Option<i32>,
    pub offset_y: Option<i32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for sharpen.
#[derive(Clone, Debug, Default)]
pub struct BitmapSharpenOptions {
    pub amount: Option<f32>,
    pub radius_x: Option<i32>,
    pub radius_y: Option<i32>,
    pub passes: Option<i32>,
}

/// Options for gradient bevel.
#[derive(Clone, Debug)]
pub struct BitmapGradientBevelOptions {
    pub angle: Option<f32>,
    pub distance: Option<f32>,
    pub type_: Option<BitmapBevelType>,
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for gradient glow.
#[derive(Clone, Debug, Default)]
pub struct BitmapGradientGlowOptions {
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
}

/// Options for resize.
#[derive(Clone, Debug)]
pub struct BitmapResizeOptions {
    pub mode: Option<BitmapResizeMode>,
    pub edge_mode: Option<BitmapEdgeMode>,
    pub premultiplied: Option<bool>,
}

/// Explanation for encode failure.
#[derive(Clone, Debug)]
pub struct BitmapEncodeFailureExplanation {
    pub format: ImageFormat,
    pub reason: String,
}

/// Readback explanation.
#[derive(Clone, Debug)]
pub struct BitmapReadbackExplanation {
    pub readable: bool,
    pub reason: BitmapReadbackBlockReason,
}

/// What a readback host returns (TS `BitmapReadbackOutcome`): the materialized bitmap on a full read,
/// and the backend's reason.
#[derive(Clone, Debug)]
pub struct BitmapReadbackOutcome {
    pub bitmap: Option<Bitmap>,
    pub reason: BitmapReadbackBackendReason,
}

/// Readback resolution: the host outcome, or a portable short circuit (`EmptySize`).
#[derive(Clone, Debug)]
pub struct BitmapReadbackResolution {
    pub bitmap: Option<Bitmap>,
    pub reason: BitmapReadbackBlockReason,
}

// ---------------------------------------------------------------------------
// Host capability placeholders
// ---------------------------------------------------------------------------

/// The bitmap capability group (TS `HostBitmapCapabilities`). An omitted slot is capability absence.
#[derive(Clone, Default)]
pub struct HostBitmapCapabilities {
    pub encode: Option<HostBitmapEncodeCapability>,
    pub readback: Option<HostBitmapReadbackCapability>,
}

/// A host's CPU readback of an image source (TS `HostBitmapReadbackCapability`). `read_bitmap`
/// receives the exact shared source, the capture size and the mode (`Probe` settles refusal with one
/// pixel and never allocates a Bitmap; `Bitmap` performs the full read).
#[derive(Clone)]
pub struct HostBitmapReadbackCapability {
    pub provider: ProviderRef,
    pub read_bitmap: Arc<
        dyn Fn(&Arc<HostImageSource>, u32, u32, BitmapReadbackMode) -> BitmapReadbackOutcome
            + Send
            + Sync,
    >,
}

/// Synchronous Bitmap encoding by a host or native codec (TS `HostBitmapEncodeCapability`).
/// `encode_bitmap` returns the encoded bytes on every successful invocation; `supported_formats` is
/// plain capability data, so a caller can explain the unsupported-format sentinel without invoking the
/// encoder. A host failure is the source's throw (a panic), not a sentinel.
#[derive(Clone)]
pub struct HostBitmapEncodeCapability {
    pub provider: ProviderRef,
    pub encode_bitmap: Arc<dyn Fn(&Bitmap, ImageFormat, f32) -> Box<Uint8Array> + Send + Sync>,
    pub supported_formats: Vec<ImageFormat>,
}

/// Resolve an edge coordinate. Returns None for transparent out-of-bounds.
pub(crate) fn resolve_edge(v: i32, size: i32, mode: BitmapEdgeMode) -> Option<i32> {
    if v >= 0 && v < size {
        return Some(v);
    }
    match mode {
        BitmapEdgeMode::Clamp => Some(v.max(0).min(size - 1)),
        BitmapEdgeMode::Wrap => {
            let m = ((v % size) + size) % size;
            Some(m)
        }
        BitmapEdgeMode::Mirror => {
            let period = 2 * size;
            let wrapped = ((v % period) + period) % period;
            if wrapped < size {
                Some(wrapped)
            } else {
                Some(period - 1 - wrapped)
            }
        }
        BitmapEdgeMode::Transparent => None,
    }
}

impl Default for BitmapEdgeMode {
    fn default() -> Self {
        BitmapEdgeMode::Transparent
    }
}

impl Default for BitmapResizeMode {
    fn default() -> Self {
        BitmapResizeMode::Bilinear
    }
}

impl Default for BitmapCompositeMode {
    fn default() -> Self {
        BitmapCompositeMode::Normal
    }
}

impl Default for PixelOrder {
    fn default() -> Self {
        PixelOrder::Rgba
    }
}

impl Default for GradientSpread {
    fn default() -> Self {
        GradientSpread::Pad
    }
}

impl Default for DisplacementMode {
    fn default() -> Self {
        DisplacementMode::Wrap
    }
}

impl Default for BitmapBevelType {
    fn default() -> Self {
        BitmapBevelType::Inner
    }
}

impl Default for BitmapReadbackBlockReason {
    fn default() -> Self {
        BitmapReadbackBlockReason::Ok
    }
}

impl Default for Bitmap {
    fn default() -> Self {
        let make: fn() -> TextureSourceFields = TextureSourceFields::default;
        let mut fields = make();
        fields.kind = BITMAP_TEXTURE_SOURCE_KIND.to_string();
        return Bitmap {
            fields,
            data: Box::default(),
            format: PixelFormat::Rgba8Unorm,
        };
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl Deref for Bitmap {
    type Target = TextureSourceFields;
    fn deref(&self) -> &TextureSourceFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 field composition exposes TextureSourceFields directly
impl DerefMut for Bitmap {
    fn deref_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D12 Entity implementation delegates the composed runtime slot
impl Entity for Bitmap {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }
    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

// flight-lint: allow(sugar-delegates) D16 open TextureSource family binding over the composed fields
impl TextureSource for Bitmap {
    fn texture_source_fields(&self) -> &TextureSourceFields {
        return &self.fields;
    }
    fn texture_source_fields_mut(&mut self) -> &mut TextureSourceFields {
        return &mut self.fields;
    }
}

impl Default for BitmapRegion {
    fn default() -> Self {
        BitmapRegion {
            bitmap: Bitmap::default(),
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        }
    }
}

impl Default for BitmapHistogram {
    fn default() -> Self {
        BitmapHistogram {
            red: vec![0; 256],
            green: vec![0; 256],
            blue: vec![0; 256],
            alpha: vec![0; 256],
        }
    }
}

impl Default for BitmapFingerprint {
    fn default() -> Self {
        return BitmapFingerprint {
            runtime: EntityRuntimeSlot::default(),
            grid_size: 0,
            cells: Vec::new(),
        };
    }
}

impl Default for BitmapBoxBlurOptions {
    fn default() -> Self {
        BitmapBoxBlurOptions {
            radius_x: None,
            radius_y: None,
            passes: None,
        }
    }
}

impl Default for BitmapBevelOptions {
    fn default() -> Self {
        BitmapBevelOptions {
            angle: None,
            distance: None,
            type_: None,
            intensity: None,
            highlight_color: None,
            shadow_color: None,
            radius_x: None,
            radius_y: None,
            passes: None,
        }
    }
}

impl Default for BitmapGradientBevelOptions {
    fn default() -> Self {
        BitmapGradientBevelOptions {
            angle: None,
            distance: None,
            type_: None,
            intensity: None,
            radius_x: None,
            radius_y: None,
            passes: None,
        }
    }
}

impl Default for BitmapResizeOptions {
    fn default() -> Self {
        BitmapResizeOptions {
            mode: None,
            edge_mode: None,
            premultiplied: None,
        }
    }
}

flight_entity::impl_entity!(BitmapFingerprint);

// flight-lint: allow(sugar-delegates) trait boilerplate: the readback callback is a closure, so Debug names the capability only
impl fmt::Debug for HostBitmapReadbackCapability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("HostBitmapReadbackCapability")
            .finish_non_exhaustive();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the encode callback is a closure, so Debug reports the supported formats
impl fmt::Debug for HostBitmapEncodeCapability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("HostBitmapEncodeCapability")
            .field("supported_formats", &self.supported_formats)
            .finish_non_exhaustive();
    }
}
