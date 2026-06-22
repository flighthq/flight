//! Plain-data render-effect descriptor types.
//!
//! Each effect is a data struct with a corresponding `create_*` constructor in
//! its domain module.  The discriminant tag is carried by the [`RenderEffect`]
//! enum rather than a string field (Rust's enum is the idiomatic equivalent of
//! a TS tagged-union).
//!
//! Color fields are packed RGBA integers (`0xRRGGBBAA`), exactly as in the TS
//! layer.  Per-backend recipe code unpacks them before uploading as uniforms.

// ---------------------------------------------------------------------------
// Anti-aliasing
// ---------------------------------------------------------------------------

/// Fast Approximate Anti-Aliasing: luminance edge detection + directional
/// blend.  `edge_threshold` gates edge detection (lower = more edges).
#[derive(Clone, Debug, Default)]
pub struct FxaaEffect {
    /// Edge contrast threshold; lower catches more edges.  Default 0.0312.
    pub edge_threshold: Option<f32>,
    pub subpixel: Option<f32>,
}

/// Subpixel Morphological Anti-Aliasing (single-pass approximation).
#[derive(Clone, Debug, Default)]
pub struct SmaaEffect {
    pub threshold: Option<f32>,
}

/// Temporal Anti-Aliasing placeholder.  Requires a history buffer + motion
/// vectors; the current implementation is a passthrough copy.
#[derive(Clone, Debug, Default)]
pub struct TaaEffect {
    /// History blend factor.  Default 0.1.
    pub feedback: Option<f32>,
}

// ---------------------------------------------------------------------------
// HDR / tone
// ---------------------------------------------------------------------------

/// Bloom: bright-pass → blur → additive composite.  Requires an HDR target.
#[derive(Clone, Debug, Default)]
pub struct BloomEffect {
    /// Bright-pass cutoff in linear light.  Default 0.8.
    pub threshold: Option<f32>,
    /// Additive strength.  Default 1.0.
    pub intensity: Option<f32>,
    /// Blur radius of the bloom branch.  Default 8.0.
    pub radius: Option<f32>,
    /// Blur quality passes.  Default 1.
    pub passes: Option<u32>,
}

/// Tone-mapping operator variants.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ToneMapOperator {
    #[default]
    Aces,
    Reinhard,
    Filmic,
    Agx,
    Uncharted2,
}

/// Tone-map: compress HDR color into displayable range.
#[derive(Clone, Debug, Default)]
pub struct ToneMapEffect {
    pub operator: Option<ToneMapOperator>,
    /// Pre-tone-map exposure multiplier.  Default 1.0.
    pub exposure: Option<f32>,
    /// White point (Reinhard extended / filmic).
    pub white: Option<f32>,
}

/// Exposure: scale linear color by `2^exposure`.  Requires an HDR target.
#[derive(Clone, Debug, Default)]
pub struct ExposureEffect {
    /// Stops, applied as `2^exposure`.  Default 0.0.
    pub exposure: Option<f32>,
}

// ---------------------------------------------------------------------------
// Color grading
// ---------------------------------------------------------------------------

/// Combined color grade: exposure, brightness, contrast, saturation, and
/// temperature/tint.
#[derive(Clone, Debug, Default)]
pub struct ColorGradeEffect {
    pub exposure: Option<f32>,
    pub contrast: Option<f32>,
    pub saturation: Option<f32>,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
    pub brightness: Option<f32>,
}

/// Lift/Gamma/Gain: per-channel shadows/midtones/highlights control.
/// Color values are packed RGBA integers; neutral values:
/// lift `0x000000ff`, gamma `0x808080ff`, gain `0xffffffff`.
#[derive(Clone, Debug, Default)]
pub struct LiftGammaGainEffect {
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

/// Channel mixer: apply a 3×4 row-major RGB→RGB matrix plus per-row offset.
#[derive(Clone, Debug)]
pub struct ChannelMixerEffect {
    /// 12 floats: `[r_r, r_g, r_b, r_offset, g_r, g_g, g_b, g_offset, b_r, b_g, b_b, b_offset]`.
    pub matrix: [f32; 12],
}

impl Default for ChannelMixerEffect {
    fn default() -> Self {
        // Identity channel mixer
        Self {
            matrix: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        }
    }
}

/// 3-D LUT (look-up table) color grade.
#[derive(Clone, Debug, Default)]
pub struct LookupTableGradeEffect {
    /// Cube size of the LUT (e.g. 16, 32).
    pub size: Option<u32>,
    pub strength: Option<f32>,
}

/// White balance: warm/cool temperature and magenta/green tint.
#[derive(Clone, Debug, Default)]
pub struct WhiteBalanceEffect {
    /// -1..1 warm/cool.
    pub temperature: Option<f32>,
    /// -1..1 magenta/green.
    pub tint: Option<f32>,
}

/// Posterize: per-channel quantization into discrete steps.
#[derive(Clone, Debug, Default)]
pub struct PosterizeEffect {
    /// Per-channel quantization steps.  Default 8.
    pub levels: Option<u32>,
}

/// Brightness/contrast: shift then scale about mid-grey.
#[derive(Clone, Debug, Default)]
pub struct BrightnessContrastEffect {
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}

/// Hue/saturation/lightness: shift hue (degrees), scale saturation, offset
/// lightness.
#[derive(Clone, Debug, Default)]
pub struct HueSaturationEffect {
    /// Hue rotation in degrees.
    pub hue: Option<f32>,
    pub saturation: Option<f32>,
    pub lightness: Option<f32>,
}

/// Grayscale: mix toward luminance by `intensity`.
#[derive(Clone, Debug, Default)]
pub struct GrayscaleEffect {
    /// 0..1 mix.  Default 1.0.
    pub intensity: Option<f32>,
}

/// Sepia: mix toward a sepia matrix transform.
#[derive(Clone, Debug, Default)]
pub struct SepiaEffect {
    pub intensity: Option<f32>,
}

/// Invert: mix toward `1 - rgb`.
#[derive(Clone, Debug, Default)]
pub struct InvertEffect {
    pub intensity: Option<f32>,
}

// ---------------------------------------------------------------------------
// Lens
// ---------------------------------------------------------------------------

/// Vignette: darken toward screen edges.  `color` is a packed RGBA integer;
/// default `0x000000ff`.
#[derive(Clone, Debug, Default)]
pub struct VignetteEffect {
    pub intensity: Option<f32>,
    pub radius: Option<f32>,
    pub softness: Option<f32>,
    /// Packed RGBA.  Default `0x000000ff`.
    pub color: Option<u32>,
}

/// Chromatic aberration: RGB channel fringing.
#[derive(Clone, Debug, Default)]
pub struct ChromaticAberrationEffect {
    pub intensity: Option<f32>,
    /// Increase toward screen edges (lens-like).  Default `true`.
    pub radial: Option<bool>,
}

/// Lens distortion: radial barrel (+) or pincushion (-) warp.
#[derive(Clone, Debug, Default)]
pub struct LensDistortionEffect {
    /// Positive = barrel, negative = pincushion.
    pub amount: Option<f32>,
    pub scale: Option<f32>,
}

/// Lens flare: ghost samples + halo from bright scene regions.
/// Requires an HDR target for the full effect.
#[derive(Clone, Debug, Default)]
pub struct LensFlareEffect {
    pub threshold: Option<f32>,
    pub intensity: Option<f32>,
    pub ghosts: Option<u32>,
    pub halo: Option<f32>,
}

/// Lens dirt: procedural smudges that brighten where the scene is bright.
#[derive(Clone, Debug, Default)]
pub struct LensDirtEffect {
    /// Brightness added through the dirt.  Default 1.0.
    pub intensity: Option<f32>,
    /// Scene luminance above which dirt catches light.  Default 0.55.
    pub threshold: Option<f32>,
    /// Smudge layout seed.
    pub seed: Option<f32>,
}

/// Displacement / heat-haze: warp sample UV by an animated sine field.
#[derive(Clone, Debug, Default)]
pub struct DisplacementEffect {
    /// Max warp in pixels.  Default 8.0.
    pub intensity: Option<f32>,
    /// Wave count across the frame.  Default 12.0.
    pub frequency: Option<f32>,
    /// Animate frame to frame.
    pub seed: Option<f32>,
}

/// Bokeh depth-of-field: disc blur scaled by circle of confusion.
/// Requires a depth attachment for the real per-pixel CoC path.
#[derive(Clone, Debug, Default)]
pub struct BokehDepthOfFieldEffect {
    pub focus_distance: Option<f32>,
    pub focus_range: Option<f32>,
    pub max_blur: Option<f32>,
}

/// Tilt-shift: keep a horizontal focus band sharp, blur above and below.
#[derive(Clone, Debug, Default)]
pub struct TiltShiftEffect {
    /// 0..1 focus-band centre on Y.  Default 0.5.
    pub center: Option<f32>,
    /// Focus band height.
    pub width: Option<f32>,
    pub blur: Option<f32>,
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/// Camera motion blur: radial/zoom smear scaled by `intensity`.
#[derive(Clone, Debug, Default)]
pub struct CameraMotionBlurEffect {
    pub intensity: Option<f32>,
    pub samples: Option<u32>,
}

/// Directional blur: accumulate taps stepped along `angle`.
#[derive(Clone, Debug, Default)]
pub struct DirectionalBlurEffect {
    /// Angle in radians.
    pub angle: Option<f32>,
    pub length: Option<f32>,
    pub samples: Option<u32>,
}

/// Per-object motion blur from the scene velocity buffer.
/// Falls back to a passthrough copy when no velocity texture is available.
#[derive(Clone, Debug, Default)]
pub struct MotionBlurEffect {
    pub intensity: Option<f32>,
    pub samples: Option<u32>,
}

/// Radial blur: smear toward a screen-space centre point.
#[derive(Clone, Debug, Default)]
pub struct RadialBlurEffect {
    /// 0..1 horizontal centre.  Default 0.5.
    pub center_x: Option<f32>,
    /// 0..1 vertical centre.  Default 0.5.
    pub center_y: Option<f32>,
    pub strength: Option<f32>,
    pub samples: Option<u32>,
}

// ---------------------------------------------------------------------------
// Atmospheric / depth
// ---------------------------------------------------------------------------

/// Screen-space fog: blend scene toward fog color by depth (or Y-gradient
/// fallback when no depth attachment is present).
#[derive(Clone, Debug, Default)]
pub struct ScreenSpaceFogEffect {
    /// Packed RGBA.  Default `0xc8d2dcff`.
    pub color: Option<u32>,
    pub near: Option<f32>,
    pub far: Option<f32>,
    pub density: Option<f32>,
}

/// God rays: radial light scattering from a screen-space light position.
#[derive(Clone, Debug, Default)]
pub struct GodRaysEffect {
    /// 0..1 horizontal light position.  Default 0.5.
    pub center_x: Option<f32>,
    /// 0..1 vertical light position.  Default 0.5.
    pub center_y: Option<f32>,
    pub density: Option<f32>,
    pub decay: Option<f32>,
    pub weight: Option<f32>,
    pub exposure: Option<f32>,
    pub samples: Option<u32>,
}

/// Screen-space ambient occlusion (color-only approximation until depth is
/// wired).
#[derive(Clone, Debug, Default)]
pub struct SsaoEffect {
    pub radius: Option<f32>,
    pub intensity: Option<f32>,
    pub bias: Option<f32>,
    pub samples: Option<u32>,
}

/// Screen-space reflections (passthrough until depth + normals are wired).
#[derive(Clone, Debug, Default)]
pub struct SsrEffect {
    pub max_distance: Option<f32>,
    pub resolution: Option<f32>,
    pub steps: Option<u32>,
}

// ---------------------------------------------------------------------------
// Stylization
// ---------------------------------------------------------------------------

/// Film grain: animated luminance noise.
#[derive(Clone, Debug, Default)]
pub struct FilmGrainEffect {
    pub intensity: Option<f32>,
    pub size: Option<f32>,
    pub seed: Option<f32>,
}

/// Digital glitch: horizontal tear blocks, RGB channel separation, and
/// scanline corruption.  `seed` animates frame to frame.
#[derive(Clone, Debug, Default)]
pub struct GlitchEffect {
    /// Overall strength 0..1.
    pub intensity: Option<f32>,
    /// Height in pixels of a tear block.  Default 24.
    pub block_size: Option<f32>,
    /// RGB channel separation in pixels at full tear.  Default 8.
    pub color_shift: Option<f32>,
    /// Animate frame to frame.
    pub seed: Option<f32>,
}

/// Horizontal scanlines: alternating bright/dark rows.
#[derive(Clone, Debug, Default)]
pub struct ScanlinesEffect {
    pub count: Option<f32>,
    pub intensity: Option<f32>,
}

/// CRT monitor simulation: curvature, scanlines, vignette, chromatic
/// aberration.
#[derive(Clone, Debug, Default)]
pub struct CrtEffect {
    pub curvature: Option<f32>,
    pub scanline_intensity: Option<f32>,
    pub vignette: Option<f32>,
    pub aberration: Option<f32>,
}

/// Pixelate: downsample into large blocks.
#[derive(Clone, Debug, Default)]
pub struct PixelateEffect {
    /// Block size in pixels.
    pub size: Option<f32>,
}

/// Halftone: convert to a dot pattern.
#[derive(Clone, Debug, Default)]
pub struct HalftoneEffect {
    pub scale: Option<f32>,
    pub angle: Option<f32>,
}

/// Dither: reduce color depth with ordered dithering.
#[derive(Clone, Debug, Default)]
pub struct DitherEffect {
    pub levels: Option<u32>,
}

/// Outline: detect and highlight edges.
#[derive(Clone, Debug, Default)]
pub struct OutlineEffect {
    pub threshold: Option<f32>,
    pub thickness: Option<f32>,
    /// Packed RGBA.
    pub color: Option<u32>,
}

/// Sharpen: increase local contrast via an unsharp-mask.
#[derive(Clone, Debug, Default)]
pub struct SharpenEffect {
    pub amount: Option<f32>,
}

/// Kuwahara: oil-painting stylization via per-quadrant variance minimization.
#[derive(Clone, Debug, Default)]
pub struct KuwaharaEffect {
    pub radius: Option<u32>,
}

/// Sketch / pencil drawing: edge-based dark-on-light strokes.
#[derive(Clone, Debug, Default)]
pub struct SketchEffect {
    pub strength: Option<f32>,
}

// ---------------------------------------------------------------------------
// RenderEffect enum
// ---------------------------------------------------------------------------

/// The complete set of render-effect intents.  The Rust enum replaces the TS
/// tagged-union; the discriminant carries the type information.
#[derive(Clone, Debug)]
pub enum RenderEffect {
    // Anti-aliasing
    Fxaa(FxaaEffect),
    Smaa(SmaaEffect),
    Taa(TaaEffect),

    // HDR / tone
    Bloom(BloomEffect),
    Exposure(ExposureEffect),
    ToneMap(ToneMapEffect),

    // Color grading
    BrightnessContrast(BrightnessContrastEffect),
    ChannelMixer(ChannelMixerEffect),
    ColorGrade(ColorGradeEffect),
    Grayscale(GrayscaleEffect),
    HueSaturation(HueSaturationEffect),
    Invert(InvertEffect),
    LiftGammaGain(LiftGammaGainEffect),
    LookupTableGrade(LookupTableGradeEffect),
    Posterize(PosterizeEffect),
    Sepia(SepiaEffect),
    WhiteBalance(WhiteBalanceEffect),

    // Lens
    BokehDepthOfField(BokehDepthOfFieldEffect),
    ChromaticAberration(ChromaticAberrationEffect),
    Displacement(DisplacementEffect),
    LensDirt(LensDirtEffect),
    LensDistortion(LensDistortionEffect),
    LensFlare(LensFlareEffect),
    TiltShift(TiltShiftEffect),
    Vignette(VignetteEffect),

    // Motion
    CameraMotionBlur(CameraMotionBlurEffect),
    DirectionalBlur(DirectionalBlurEffect),
    MotionBlur(MotionBlurEffect),
    RadialBlur(RadialBlurEffect),

    // Atmospheric / depth
    GodRays(GodRaysEffect),
    ScreenSpaceFog(ScreenSpaceFogEffect),
    Ssao(SsaoEffect),
    Ssr(SsrEffect),

    // Stylization
    Crt(CrtEffect),
    Dither(DitherEffect),
    FilmGrain(FilmGrainEffect),
    Glitch(GlitchEffect),
    Halftone(HalftoneEffect),
    Kuwahara(KuwaharaEffect),
    Outline(OutlineEffect),
    Pixelate(PixelateEffect),
    Scanlines(ScanlinesEffect),
    Sharpen(SharpenEffect),
    Sketch(SketchEffect),
}
