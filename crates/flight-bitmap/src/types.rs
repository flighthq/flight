use flight_entity::{EntityRuntimeSlot, Uint8Array};

// Types shared across flight-bitmap modules.
// These correspond to types imported from @flighthq/types/contract in the TS codebase.

/// Alpha representation for bitmap pixel data.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AlphaType {
    Straight,
    Premultiplied,
}

impl Default for AlphaType {
    fn default() -> Self {
        AlphaType::Straight
    }
}

/// Edge mode for out-of-bounds pixel sampling.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapEdgeMode {
    Transparent,
    Clamp,
    Wrap,
    Mirror,
}

impl Default for BitmapEdgeMode {
    fn default() -> Self {
        BitmapEdgeMode::Transparent
    }
}

/// Resize / sampling interpolation mode.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BitmapResizeMode {
    Nearest,
    Bilinear,
    Bicubic,
}

impl Default for BitmapResizeMode {
    fn default() -> Self {
        BitmapResizeMode::Bilinear
    }
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

impl Default for BitmapCompositeMode {
    fn default() -> Self {
        BitmapCompositeMode::Normal
    }
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

impl Default for PixelOrder {
    fn default() -> Self {
        PixelOrder::Rgba
    }
}

/// Gradient spread mode.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GradientSpread {
    Pad,
    Repeat,
    Reflect,
}

impl Default for GradientSpread {
    fn default() -> Self {
        GradientSpread::Pad
    }
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

impl Default for DisplacementMode {
    fn default() -> Self {
        DisplacementMode::Wrap
    }
}

/// Bevel type for clipping.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BevelType {
    Inner,
    Outer,
    Both,
}

impl Default for BevelType {
    fn default() -> Self {
        BevelType::Inner
    }
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
}

impl Default for BitmapReadbackBlockReason {
    fn default() -> Self {
        BitmapReadbackBlockReason::Ok
    }
}

/// Constant identifying a Bitmap as a texture source kind.
pub const BITMAP_TEXTURE_SOURCE_KIND: u32 = 1;

// ---------------------------------------------------------------------------
// Structs
// ---------------------------------------------------------------------------

/// Core bitmap: RGBA pixel buffer with metadata.
#[derive(Clone, Debug)]
pub struct Bitmap {
    runtime: EntityRuntimeSlot,
    pub alpha_type: AlphaType,
    pub gamut: String,
    pub data: Box<Uint8Array>,
    pub format: String,
    pub height: u32,
    pub kind: u32,
    pub version: u32,
    pub width: u32,
}

impl Default for Bitmap {
    fn default() -> Self {
        return Bitmap {
            runtime: EntityRuntimeSlot::default(),
            alpha_type: AlphaType::Straight,
            gamut: "srgb".into(),
            data: Box::default(),
            format: "rgba8unorm".into(),
            height: 0,
            kind: BITMAP_TEXTURE_SOURCE_KIND,
            version: 0,
            width: 0,
        };
    }
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

/// Axis-aligned rectangle with floating-point coordinates.
#[derive(Clone, Debug, Default)]
pub struct RectangleLike {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Bitmap mismatch summary.
#[derive(Clone, Debug, Default)]
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

/// Coarse fingerprint for regression gating.
#[derive(Clone, Debug)]
pub struct BitmapFingerprint {
    runtime: EntityRuntimeSlot,
    pub grid_size: u32,
    pub cells: Vec<u8>,
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

impl Default for BitmapBoxBlurOptions {
    fn default() -> Self {
        BitmapBoxBlurOptions {
            radius_x: None,
            radius_y: None,
            passes: None,
        }
    }
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
    pub type_: Option<BevelType>,
    pub intensity: Option<f32>,
    pub highlight_color: Option<u32>,
    pub shadow_color: Option<u32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
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
    pub type_: Option<BevelType>,
    pub intensity: Option<f32>,
    pub radius_x: Option<f32>,
    pub radius_y: Option<f32>,
    pub passes: Option<i32>,
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

impl Default for BitmapResizeOptions {
    fn default() -> Self {
        BitmapResizeOptions {
            mode: None,
            edge_mode: None,
            premultiplied: None,
        }
    }
}

/// Explanation for encode failure.
#[derive(Clone, Debug)]
pub struct BitmapEncodeFailureExplanation {
    pub format: ImageFormat,
    pub reason: String,
}

/// Color scale/bias transform parameters (normalized-linear).
#[derive(Clone, Debug)]
pub struct ColorScaleBiasLike {
    pub red_scale: f32,
    pub green_scale: f32,
    pub blue_scale: f32,
    pub alpha_scale: f32,
    pub red_bias: f32,
    pub green_bias: f32,
    pub blue_bias: f32,
    pub alpha_bias: f32,
}

impl Default for ColorScaleBiasLike {
    fn default() -> Self {
        ColorScaleBiasLike {
            red_scale: 1.0,
            green_scale: 1.0,
            blue_scale: 1.0,
            alpha_scale: 1.0,
            red_bias: 0.0,
            green_bias: 0.0,
            blue_bias: 0.0,
            alpha_bias: 0.0,
        }
    }
}

/// Readback explanation.
#[derive(Clone, Debug)]
pub struct BitmapReadbackExplanation {
    pub readable: bool,
    pub reason: BitmapReadbackBlockReason,
}

/// Readback resolution.
#[derive(Clone, Debug)]
pub struct BitmapReadbackResolution {
    pub bitmap: Option<Bitmap>,
    pub reason: BitmapReadbackBlockReason,
}

// ---------------------------------------------------------------------------
// Host capability placeholders
// ---------------------------------------------------------------------------

/// Placeholder for host bitmap readback capability.
#[derive(Clone, Debug)]
pub struct HostBitmapReadbackCapability {
    pub read_bitmap: fn(source: &HostImageSource, width: u32, height: u32, mode: BitmapReadbackMode) -> BitmapReadbackResolution,
}

/// Placeholder for host bitmap encode capability.
#[derive(Clone, Debug)]
pub struct HostBitmapEncodeCapability {
    pub encode_bitmap: fn(source: &Bitmap, format: ImageFormat, quality: f32) -> Option<Vec<u8>>,
    pub supported_formats: Vec<ImageFormat>,
}

/// Placeholder for host image source.
#[derive(Clone, Debug, Default)]
pub struct HostImageSource;

/// Placeholder for image resource.
#[derive(Clone, Debug)]
pub struct ImageResource {
    pub source: HostImageSource,
    pub width: u32,
    pub height: u32,
}

// ---------------------------------------------------------------------------
// Helper: clamp a value to u8 range (0..=255)
// ---------------------------------------------------------------------------

/// Clamp and round an f32 to u8 (0..=255).
pub(crate) fn clamp_u8(v: f32) -> u8 {
    v.round().max(0.0).min(255.0) as u8
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

flight_entity::impl_entity!(Bitmap);
flight_entity::impl_entity!(BitmapFingerprint);
