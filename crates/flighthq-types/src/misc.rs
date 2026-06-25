// ---------------------------------------------------------------------------
// BatchFormat
// ---------------------------------------------------------------------------

/// Which geometry accumulation pipeline a renderer submits into.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum BatchFormat {
    /// Instanced textured-quad path.
    #[default]
    Quad,
    /// Explicit vertex + index buffer path.
    VertexStream,
}

// ---------------------------------------------------------------------------
// BatchBarrier
// ---------------------------------------------------------------------------

/// Forces the open batch to flush regardless of whether the flush key changed.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum BatchBarrier {
    /// Instance or vertex buffer is full.
    Capacity,
    /// Clip state changed.
    Clip,
    /// Filter/effect needs subtree rendered to texture first.
    Filter,
    /// Drawing into or out of an offscreen render target.
    RenderTarget,
}

// ---------------------------------------------------------------------------
// StageScaleMode / StageAlign / StageDisplayState / StageQuality
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StageScaleMode {
    ExactFit,
    NoBorder,
    NoScale,
    #[default]
    ShowAll,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StageAlign {
    Bottom,
    BottomLeft,
    BottomRight,
    Left,
    Right,
    Top,
    TopLeft,
    #[default]
    TopRight,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StageDisplayState {
    Fullscreen,
    FullscreenInteractive,
    #[default]
    Normal,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum StageQuality {
    Best,
    #[default]
    High,
    Low,
    Medium,
}

// ---------------------------------------------------------------------------
// SceneScaleMode / SceneAlign
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SceneScaleMode {
    ExactFit,
    NoBorder,
    NoScale,
    #[default]
    ShowAll,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SceneAlign {
    Bottom,
    BottomLeft,
    BottomRight,
    Left,
    Right,
    Top,
    TopLeft,
    #[default]
    TopRight,
}

// ---------------------------------------------------------------------------
// Scale9Mapper
// ---------------------------------------------------------------------------

pub trait Scale9Mapper {
    fn map_x(&self, x: f32) -> f32;
    fn map_y(&self, y: f32) -> f32;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/// A scene root with scale and alignment settings.
#[derive(Clone, Debug, Default)]
pub struct Scene {
    pub align: SceneAlign,
    /// Root node id, or `None` when the scene has no content.
    pub root_id: Option<u64>,
    pub scale_mode: SceneScaleMode,
}

// ---------------------------------------------------------------------------
// LogLevel / LogEntry / LogSink
// ---------------------------------------------------------------------------

/// Log severity / verbosity level.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Default)]
pub enum LogLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    #[default]
    Info = 3,
    Debug = 4,
    Verbose = 5,
}

/// A structured log payload.
#[derive(Clone, Debug)]
pub enum LogData {
    Message(String),
    /// Key/value pairs serialized as strings for portability without serde_json.
    Structured(std::collections::HashMap<String, String>),
}

/// A single emitted log entry.
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub level: LogLevel,
    pub channel: Option<String>,
    pub data: LogData,
}

/// Receives every emitted log entry regardless of console verbosity threshold.
pub type LogSink = Box<dyn Fn(&LogEntry) + Send + Sync>;

/// A bound logging context: a channel plus base fields merged into every entry
/// emitted through it. Mirrors the TS `LogContext`. Fields are serialized as
/// strings for portability (matching [`LogData::Structured`]).
#[derive(Clone, Debug, Default)]
pub struct LogContext {
    /// The bound channel, or `None` when uncategorized.
    pub channel: Option<String>,
    pub fields: std::collections::HashMap<String, String>,
}

/// A deferred log payload. The thunk is invoked only when the entry passes the
/// level gate, so a suppressed verbose call allocates nothing. Mirrors the TS
/// `LogDataProvider`.
pub type LogDataProvider = Box<dyn Fn() -> LogData + Send + Sync>;

/// Renders an entry to a single line of text (JSON envelope or human-readable).
/// Used by sinks and transports. Mirrors the TS `LogFormatter`.
pub type LogFormatter = Box<dyn Fn(&LogEntry) -> String + Send + Sync>;

/// A named tracing span — a plain value, inert until `enter_log_span`. While
/// active, its fields merge into every emitted entry (lower priority than the
/// entry's own fields). Mirrors the TS `LogSpan`.
#[derive(Clone, Debug, Default)]
pub struct LogSpan {
    pub name: String,
    pub fields: std::collections::HashMap<String, String>,
    /// The bound channel, or `None` when uncategorized.
    pub channel: Option<String>,
}

/// A running timer started with `start_log_timer`. Pass to `end_log_timer` to
/// record elapsed time. `started_at` is a high-resolution timestamp in
/// milliseconds. Mirrors the TS `LogTimer`.
#[derive(Clone, Debug, Default)]
pub struct LogTimer {
    pub label: String,
    /// The bound channel, or `None` when uncategorized.
    pub channel: Option<String>,
    pub started_at: f64,
}

/// A line-oriented transport for file/remote log sinks. The native default is a
/// no-op; hosts register an fs-backed implementation via
/// `set_log_transport_backend`. `flush` and `dispose` default to no-ops. Mirrors
/// the TS `LogTransportBackend` (its optional `flush`/`dispose` become default
/// trait methods).
pub trait LogTransportBackend: Send + Sync {
    fn write(&self, line: &str);
    fn flush(&self) {}
    fn dispose(&self) {}
}

// ---------------------------------------------------------------------------
// Application / ApplicationWindow
// ---------------------------------------------------------------------------

use flighthq_signals::Signal;

/// Main application lifecycle entity: frame stats, run state, the registered
/// windows, and the lifecycle signals.
///
/// `on_activate` / `on_deactivate` / `on_error` / `on_fixed_update` are the
/// opt-in signals; they are `None` until [`enable_application_lifecycle_signals`]
/// allocates them (mirroring TS's `null` defaults), so an application that does
/// not need them carries no cost.
#[derive(Debug, Default)]
pub struct Application {
    /// Milliseconds elapsed in the most recent frame (clamped by `max_delta_time`).
    pub delta_time: f64,
    /// Total elapsed time in seconds since the loop started.
    pub elapsed_time: f64,
    /// Number of frames driven since the loop started.
    pub frame_count: u64,
    /// Position within the current fixed step at render time, in `[0, 1]`.
    pub interpolation_alpha: f64,
    /// Whether the loop is currently running (and not paused).
    pub is_running: bool,
    /// Opt-in: emitted when the application/window becomes active.
    pub on_activate: Option<Signal<()>>,
    /// Opt-in: emitted when the application/window becomes inactive.
    pub on_deactivate: Option<Signal<()>>,
    /// Opt-in: emitted with the error when an update/render listener panics or
    /// throws. In Rust the payload is the error message text.
    pub on_error: Option<Signal<String>>,
    pub on_exit: Signal<()>,
    /// Opt-in: emitted once per fixed step with the fixed timestep (ms).
    pub on_fixed_update: Option<Signal<f64>>,
    pub on_render: Signal<()>,
    pub on_update: Signal<f64>,
    /// The registered application windows, in registration order.
    pub windows: Vec<ApplicationWindow>,
}

/// Options for [`start_application_loop`]. Every field is optional; the defaults
/// match the TS reference: variable timestep, no frame cap, 250 ms max delta.
#[derive(Clone, Copy, Debug, Default)]
pub struct ApplicationLoopOptions {
    /// Frame-rate cap in fps when in the foreground. `None`/`0` = uncapped.
    pub target_frame_rate: Option<f64>,
    /// Frame-rate cap in fps when the page/window is backgrounded. `None`/`0` =
    /// same as foreground.
    pub background_frame_rate: Option<f64>,
    /// Fixed-timestep size in ms for `on_fixed_update`. `None`/`0` = disabled
    /// (pure variable mode).
    pub fixed_time_step: Option<f64>,
    /// Maximum delta in ms per frame; clamps huge gaps after a tab restore.
    /// Defaults to 250.
    pub max_delta_time: Option<f64>,
    /// Spiral-of-death guard: maximum fixed-update iterations per frame.
    /// Defaults to 5.
    pub max_updates_per_frame: Option<u32>,
}

/// Host loop backend seam — the clock the application loop reads frame
/// timestamps from. `now` returns a monotonic timestamp in milliseconds.
///
/// TS divergence (recorded): the TS `LoopBackend` also carries
/// `requestFrame`/`cancelFrame` because the browser loop self-schedules through
/// `requestAnimationFrame`. The Rust loop is host-pumped — the native host event
/// loop drives each frame via [`run_application_frame`] — so the only piece the
/// loop needs from the backend is the clock. The scheduling pair is TS-specific
/// and intentionally omitted here.
pub trait LoopBackend: Send + Sync {
    fn now(&self) -> f64;
}

/// An OS window entity.
#[derive(Clone, Debug, PartialEq)]
pub struct ApplicationWindow {
    pub title: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub device_pixel_ratio: f32,
    pub minimized: bool,
    pub maximized: bool,
    pub fullscreen: bool,
    pub focused: bool,
    pub visible: bool,
    pub resizable: bool,
    pub always_on_top: bool,
    pub skip_taskbar: bool,
    pub opacity: f32,
    pub icon: String,
    pub min_width: f32,
    pub min_height: f32,
    pub max_width: f32,
    pub max_height: f32,
}

impl Default for ApplicationWindow {
    fn default() -> Self {
        Self {
            title: String::new(),
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 600.0,
            device_pixel_ratio: 1.0,
            minimized: false,
            maximized: false,
            fullscreen: false,
            focused: false,
            visible: true,
            resizable: true,
            always_on_top: false,
            skip_taskbar: false,
            opacity: 1.0,
            icon: String::new(),
            min_width: 0.0,
            min_height: 0.0,
            max_width: -1.0,
            max_height: -1.0,
        }
    }
}

/// Options for opening a new window.
#[derive(Clone, Debug, Default)]
pub struct WindowOptions {
    pub title: Option<String>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub resizable: Option<bool>,
    pub always_on_top: Option<bool>,
    pub fullscreen: Option<bool>,
    pub minimized: Option<bool>,
    pub maximized: Option<bool>,
    pub visible: Option<bool>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
    pub max_width: Option<f32>,
    pub max_height: Option<f32>,
    pub center: bool,
    pub frame: Option<bool>,
    pub transparent: Option<bool>,
}

#[derive(Copy, Clone, Debug, Default)]
pub struct WindowBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

// ---------------------------------------------------------------------------
// SurfaceFingerprint / SurfaceHistogram / SurfaceMismatch / SurfaceRegion
// ---------------------------------------------------------------------------

/// A coarse downscaled RGB fingerprint for visual-regression checks.
#[derive(Clone, Debug)]
pub struct SurfaceFingerprint {
    pub grid_size: u32,
    /// Row-major averaged cells, 3 bytes (R, G, B) each.
    pub cells: Vec<u8>,
}

/// Per-channel pixel value histogram.
#[derive(Clone, Debug, Default)]
pub struct SurfaceHistogram {
    pub alpha: Vec<u32>,
    pub blue: Vec<u32>,
    pub green: Vec<u32>,
    pub red: Vec<u32>,
}

/// Result of a tolerant pixel comparison between two surfaces.
#[derive(Copy, Clone, Debug, Default)]
pub struct SurfaceMismatch {
    pub mismatched_pixels: u32,
    pub total_pixels: u32,
    pub fraction: f32,
    pub max_channel_delta: u8,
}

/// A rectangular sub-region of a `Surface`.
#[derive(Clone, Debug)]
pub struct SurfaceRegion {
    pub height: u32,
    pub surface: crate::resource::Surface,
    pub width: u32,
    pub x: u32,
    pub y: u32,
}

/// Resize filter quality.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SurfaceResizeMode {
    Bicubic,
    Bilinear,
    #[default]
    Nearest,
}

// ---------------------------------------------------------------------------
// ThresholdOperation
// ---------------------------------------------------------------------------

/// Comparison operator for threshold pixel operations.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ThresholdOperation {
    NotEqual,
    LessThan,
    LessEqual,
    Equal,
    GreaterThan,
    GreaterEqual,
}

// ---------------------------------------------------------------------------
// Path / PathCommand / PathMesh
// ---------------------------------------------------------------------------

/// Verb codes for a `Path` command stream.
pub mod path_command {
    pub const NO_OP: u8 = 0;
    pub const MOVE_TO: u8 = 1;
    pub const LINE_TO: u8 = 2;
    pub const CURVE_TO: u8 = 3;
    pub const WIDE_MOVE_TO: u8 = 4;
    pub const WIDE_LINE_TO: u8 = 5;
    pub const CUBIC_CURVE_TO: u8 = 6;
}

/// A vector path: verb stream, coordinate stream, and fill rule.
#[derive(Clone, Debug, Default)]
pub struct Path {
    pub commands: Vec<u8>,
    pub data: Vec<f32>,
    pub winding: crate::node_types::PathWinding,
}

/// A triangulated fill produced from a `Path`.
#[derive(Clone, Debug, Default)]
pub struct PathMesh {
    pub vertices: Vec<f32>,
    pub indices: Vec<u32>,
}

// ---------------------------------------------------------------------------
// Shape fill / velocity types
// ---------------------------------------------------------------------------

/// A resolved solid-color filled region from a `Shape`.
#[derive(Clone, Debug)]
pub struct ShapeFillRegion {
    pub path: Path,
    pub color: u32,
    pub alpha: f32,
}

// ---------------------------------------------------------------------------
// Velocity types
// ---------------------------------------------------------------------------

/// A 2D velocity vector.
#[derive(Copy, Clone, Debug, Default)]
pub struct Velocity2D {
    pub x: f32,
    pub y: f32,
}

/// Per-node velocity sample within a `VelocityField`.
#[derive(Clone, Debug, Default)]
pub struct VelocitySample {
    pub previous_world_transform: Option<crate::geometry::Matrix>,
    pub velocity: Velocity2D,
    pub last_frame_id: u64,
    pub explicit_frame_id: u64,
}

/// Per-frame velocity accumulator.
#[derive(Debug, Default)]
pub struct VelocityField {
    /// Samples keyed by a stable u64 id derived from node identity.
    pub samples: std::collections::HashMap<u64, VelocitySample>,
    pub frame_id: u64,
}

// ---------------------------------------------------------------------------
// NodeSignals
// ---------------------------------------------------------------------------

/// Signals fired when a node's children change.
#[derive(Debug, Default)]
pub struct NodeSignals {
    pub on_child_added: Signal<u64>,
    pub on_child_removed: Signal<u64>,
    pub on_children_changed: Signal<()>,
    pub on_children_order_changed: Signal<()>,
    pub on_parent_changed: Signal<()>,
}

// ---------------------------------------------------------------------------
// WorldNode
// ---------------------------------------------------------------------------

use crate::kind::KindId;

pub fn world_node_kind() -> KindId {
    static ID: std::sync::OnceLock<KindId> = std::sync::OnceLock::new();
    *ID.get_or_init(KindId::new)
}

// ---------------------------------------------------------------------------
// RenderEffect (post-processing effects)
// ---------------------------------------------------------------------------

// Anti-aliasing
#[derive(Clone, Debug, Default)]
pub struct FxaaEffect {
    pub edge_threshold: Option<f32>,
    pub subpixel: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SmaaEffect {
    pub threshold: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct TaaEffect {
    pub feedback: Option<f32>,
}

// HDR / tone
#[derive(Clone, Debug, Default)]
pub struct BloomEffect {
    pub threshold: Option<f32>,
    pub intensity: Option<f32>,
    pub radius: Option<f32>,
    pub passes: Option<u32>,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ToneMapOperator {
    #[default]
    Reinhard,
    Aces,
    Filmic,
    Agx,
    Uncharted2,
}

#[derive(Clone, Debug, Default)]
pub struct ToneMapEffect {
    pub operator: Option<ToneMapOperator>,
    pub exposure: Option<f32>,
    pub white: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ExposureEffect {
    pub exposure: Option<f32>,
}

// Color grading
#[derive(Clone, Debug, Default)]
pub struct ColorGradeEffect {
    pub exposure: Option<f32>,
    pub contrast: Option<f32>,
    pub saturation: Option<f32>,
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
    pub brightness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct LiftGammaGainEffect {
    pub lift: Option<u32>,
    pub gamma: Option<u32>,
    pub gain: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct ChannelMixerEffect {
    /// 3×4 row-major RGB→RGB plus offset.
    pub matrix: Vec<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct LookupTableGradeEffect {
    pub size: Option<u32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct WhiteBalanceEffect {
    pub temperature: Option<f32>,
    pub tint: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct PosterizeEffect {
    pub levels: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct BrightnessContrastEffect {
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct HueSaturationEffect {
    pub hue: Option<f32>,
    pub saturation: Option<f32>,
    pub lightness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct GrayscaleEffect {
    pub intensity: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SepiaEffect {
    pub intensity: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct InvertEffect {
    pub intensity: Option<f32>,
}

// Lens
#[derive(Clone, Debug, Default)]
pub struct VignetteEffect {
    pub intensity: Option<f32>,
    pub radius: Option<f32>,
    pub softness: Option<f32>,
    pub color: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct ChromaticAberrationEffect {
    pub intensity: Option<f32>,
    pub radial: Option<bool>,
}

#[derive(Clone, Debug, Default)]
pub struct LensDistortionEffect {
    pub amount: Option<f32>,
    pub scale: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct LensFlareEffect {
    pub threshold: Option<f32>,
    pub intensity: Option<f32>,
    pub ghosts: Option<u32>,
    pub halo: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct LensDirtEffect {
    pub intensity: Option<f32>,
    pub threshold: Option<f32>,
    pub seed: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct DisplacementEffect {
    pub intensity: Option<f32>,
    pub frequency: Option<f32>,
    pub seed: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct BokehDepthOfFieldEffect {
    pub focus_distance: Option<f32>,
    pub focus_range: Option<f32>,
    pub max_blur: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct TiltShiftEffect {
    pub center: Option<f32>,
    pub width: Option<f32>,
    pub blur: Option<f32>,
}

// Motion
#[derive(Clone, Debug, Default)]
pub struct CameraMotionBlurEffect {
    pub intensity: Option<f32>,
    pub samples: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct DirectionalBlurEffect {
    pub angle: Option<f32>,
    pub length: Option<f32>,
    pub samples: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct MotionBlurEffect {
    pub intensity: Option<f32>,
    pub samples: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct RadialBlurEffect {
    pub center_x: Option<f32>,
    pub center_y: Option<f32>,
    pub strength: Option<f32>,
    pub samples: Option<u32>,
}

// Atmospheric / depth
#[derive(Clone, Debug, Default)]
pub struct ScreenSpaceFogEffect {
    pub color: Option<u32>,
    pub near: Option<f32>,
    pub far: Option<f32>,
    pub density: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct GodRaysEffect {
    pub center_x: Option<f32>,
    pub center_y: Option<f32>,
    pub density: Option<f32>,
    pub decay: Option<f32>,
    pub weight: Option<f32>,
    pub exposure: Option<f32>,
    pub samples: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct SsaoEffect {
    pub radius: Option<f32>,
    pub intensity: Option<f32>,
    pub bias: Option<f32>,
    pub samples: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct SsrEffect {
    pub max_distance: Option<f32>,
    pub resolution: Option<f32>,
    pub steps: Option<u32>,
}

// Stylization
#[derive(Clone, Debug, Default)]
pub struct FilmGrainEffect {
    pub intensity: Option<f32>,
    pub size: Option<f32>,
    pub seed: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct GlitchEffect {
    pub intensity: Option<f32>,
    pub block_size: Option<f32>,
    pub color_shift: Option<f32>,
    pub seed: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct ScanlinesEffect {
    pub count: Option<u32>,
    pub intensity: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct CrtEffect {
    pub curvature: Option<f32>,
    pub scanline_intensity: Option<f32>,
    pub vignette: Option<f32>,
    pub aberration: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct PixelateEffect {
    pub size: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct HalftoneEffect {
    pub scale: Option<f32>,
    pub angle: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct DitherEffect {
    pub levels: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct OutlineEffect {
    pub threshold: Option<f32>,
    pub thickness: Option<f32>,
    pub color: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct SharpenEffect {
    pub amount: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct KuwaharaEffect {
    pub radius: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SketchEffect {
    pub strength: Option<f32>,
}

/// Any post-processing render effect.
#[derive(Clone, Debug)]
pub enum RenderEffect {
    Bloom(BloomEffect),
    BokehDepthOfField(BokehDepthOfFieldEffect),
    BrightnessContrast(BrightnessContrastEffect),
    CameraMotionBlur(CameraMotionBlurEffect),
    ChannelMixer(ChannelMixerEffect),
    ChromaticAberration(ChromaticAberrationEffect),
    ColorGrade(ColorGradeEffect),
    Crt(CrtEffect),
    DirectionalBlur(DirectionalBlurEffect),
    Displacement(DisplacementEffect),
    Dither(DitherEffect),
    Exposure(ExposureEffect),
    FilmGrain(FilmGrainEffect),
    Fxaa(FxaaEffect),
    Glitch(GlitchEffect),
    GodRays(GodRaysEffect),
    Grayscale(GrayscaleEffect),
    Halftone(HalftoneEffect),
    HueSaturation(HueSaturationEffect),
    Invert(InvertEffect),
    Kuwahara(KuwaharaEffect),
    LensDirt(LensDirtEffect),
    LensDistortion(LensDistortionEffect),
    LensFlare(LensFlareEffect),
    LiftGammaGain(LiftGammaGainEffect),
    LookupTableGrade(LookupTableGradeEffect),
    MotionBlur(MotionBlurEffect),
    Outline(OutlineEffect),
    Pixelate(PixelateEffect),
    Posterize(PosterizeEffect),
    RadialBlur(RadialBlurEffect),
    Scanlines(ScanlinesEffect),
    ScreenSpaceFog(ScreenSpaceFogEffect),
    Sepia(SepiaEffect),
    Sharpen(SharpenEffect),
    Sketch(SketchEffect),
    Smaa(SmaaEffect),
    Ssao(SsaoEffect),
    Ssr(SsrEffect),
    Taa(TaaEffect),
    TiltShift(TiltShiftEffect),
    ToneMap(ToneMapEffect),
    Vignette(VignetteEffect),
    WhiteBalance(WhiteBalanceEffect),
}

// ---------------------------------------------------------------------------
// BitmapFilter
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct BevelFilter {
    pub angle: Option<f32>,
    pub bevel_type: Option<BevelType>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub distance: Option<f32>,
    pub highlight_alpha: Option<f32>,
    pub highlight_color: Option<u32>,
    pub knockout: Option<bool>,
    pub quality: Option<u32>,
    pub shadow_alpha: Option<f32>,
    pub shadow_color: Option<u32>,
    pub strength: Option<f32>,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum BevelType {
    #[default]
    Full,
    Inner,
    Outer,
}

#[derive(Clone, Debug, Default)]
pub struct BlurFilter {
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ColorMatrixFilter {
    pub matrix: Vec<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ConvolutionFilter {
    pub bias: Option<f32>,
    pub clamp: Option<bool>,
    pub color: Option<u32>,
    pub divisor: Option<f32>,
    pub matrix: Vec<f32>,
    pub matrix_x: u32,
    pub matrix_y: u32,
    pub preserve_alpha: Option<bool>,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum DisplacementMapMode {
    Clamp,
    Color,
    Ignore,
    #[default]
    Wrap,
}

#[derive(Clone, Debug, Default)]
pub struct DisplacementMapFilter {
    pub alpha: Option<f32>,
    pub color: Option<u32>,
    pub component_x: Option<u8>,
    pub component_y: Option<u8>,
    pub mode: Option<DisplacementMapMode>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct DropShadowFilter {
    pub alpha: Option<f32>,
    pub angle: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub distance: Option<f32>,
    pub hide_object: Option<bool>,
    pub knockout: Option<bool>,
    pub quality: Option<u32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct GradientBevelFilter {
    pub alphas: Vec<f32>,
    pub angle: Option<f32>,
    pub bevel_type: Option<BevelType>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub colors: Vec<u32>,
    pub distance: Option<f32>,
    pub quality: Option<u32>,
    pub ratios: Vec<f32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct GradientGlowFilter {
    pub alphas: Vec<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub colors: Vec<u32>,
    pub quality: Option<u32>,
    pub ratios: Vec<f32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct InnerGlowFilter {
    pub alpha: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub quality: Option<u32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct InnerShadowFilter {
    pub alpha: Option<f32>,
    pub angle: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub distance: Option<f32>,
    pub quality: Option<u32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct MedianFilter {
    pub radius: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct OuterGlowFilter {
    pub alpha: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub color: Option<u32>,
    pub knockout: Option<bool>,
    pub quality: Option<u32>,
    pub strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct PixelateFilterDescriptor {
    pub block_size: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SharpenFilterDescriptor {
    pub amount: Option<f32>,
    pub blur_x: Option<f32>,
    pub blur_y: Option<f32>,
    pub quality: Option<u32>,
}

/// Any bitmap filter variant.
#[derive(Clone, Debug)]
pub enum BitmapFilter {
    Bevel(BevelFilter),
    Blur(BlurFilter),
    ColorMatrix(ColorMatrixFilter),
    Convolution(ConvolutionFilter),
    DisplacementMap(DisplacementMapFilter),
    DropShadow(DropShadowFilter),
    GradientBevel(GradientBevelFilter),
    GradientGlow(GradientGlowFilter),
    InnerGlow(InnerGlowFilter),
    InnerShadow(InnerShadowFilter),
    Median(MedianFilter),
    OuterGlow(OuterGlowFilter),
    Pixelate(PixelateFilterDescriptor),
    Sharpen(SharpenFilterDescriptor),
}

// ---------------------------------------------------------------------------
// ShapeCommand types
// ---------------------------------------------------------------------------

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum CapsStyle {
    #[default]
    None,
    Round,
    Square,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum GradientType {
    #[default]
    Linear,
    Radial,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum InterpolationMethod {
    #[default]
    LinearRgb,
    Rgb,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum JointStyle {
    Bevel,
    Miter,
    #[default]
    Round,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum LineScaleMode {
    Horizontal,
    None,
    #[default]
    Normal,
    Vertical,
}

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SpreadMethod {
    #[default]
    Pad,
    Reflect,
    Repeat,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_context_default_is_uncategorized_and_empty() {
        let context = LogContext::default();
        assert_eq!(context.channel, None);
        assert!(context.fields.is_empty());
    }

    #[test]
    fn log_span_default_is_inert() {
        let span = LogSpan::default();
        assert_eq!(span.name, "");
        assert_eq!(span.channel, None);
        assert!(span.fields.is_empty());
    }

    #[test]
    fn log_timer_default_starts_at_zero() {
        assert_eq!(LogTimer::default().started_at, 0.0);
    }
}
