//! `flighthq-types` — the SDK header layer.
//!
//! Shared interfaces, enums, kind identifiers, and cross-package type contracts
//! for the Flight SDK. Every public API shape is navigable from this crate.

// ---------------------------------------------------------------------------
// Submodules
// ---------------------------------------------------------------------------

pub mod alpha;
pub mod animation;
pub mod appearance;
pub mod blend;
pub mod camera;
pub mod display;
pub mod entity;
pub mod geometry;
pub mod image;
pub mod input;
pub mod interaction;
pub mod kind;
pub mod lighting;
pub mod material;
pub mod mesh;
pub mod misc;
pub mod node;
pub mod node_types;
pub mod particle;
pub mod platform;
pub mod render;
pub mod resource;
pub mod text;
pub mod texture;

// ---------------------------------------------------------------------------
// Re-exports — bring the entire public surface to the crate root
// ---------------------------------------------------------------------------

// alpha
pub use alpha::AlphaType;

// animation
pub use animation::{
    EasingFunction, Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer,
    StopTweenOptions, Timeline, TimelineLabel, TimelineSource, Tween, TweenManager,
    TweenManagerOptions, TweenOptions, TweenPropertyDetail,
};

// appearance
pub use appearance::{AppearanceFlags, HasAppearance};

// blend
pub use blend::BlendMode;

// camera
pub use camera::{Camera, OrthographicProjection, PerspectiveProjection, Projection};

// lighting
pub use lighting::{
    AMBIENT_LIGHT_KIND_NAME, AREA_LIGHT_KIND_NAME, AmbientLight, AreaLight,
    DIRECTIONAL_LIGHT_KIND_NAME, DirectionalLight, ENVIRONMENT_KIND_NAME, Environment,
    HEMISPHERE_LIGHT_KIND_NAME, HemisphereLight, Light, LightColorSpace, POINT_LIGHT_KIND_NAME,
    PointLight, SPOT_LIGHT_KIND_NAME, SpotLight,
};

// mesh
pub use mesh::{
    MESH_KIND_NAME, MeshGeometry, MeshGeometryGlData, MeshGeometryRuntime, MeshGeometryWgpuData,
    MeshIndices, MeshSubset, PrimitiveTopology, VertexAttribute, VertexAttributeLayout,
    VertexFormat, VertexSemantic,
};

// texture
pub use texture::{CubeTexture, Sampler, Texture, TextureColorSpace, TextureFilter, TextureWrap};

// display
pub use display::{
    BitmapData, HtmlViewData, MovieClipData, MovieClipSignals, QuadBatchData, QuadTransformType,
    RenderViewData, Scale9ShapeData, ShapeData, SpriteDisplayObjectData, StageData, StageSignals,
    TilemapData, VideoData, bitmap_kind, display_object_kind, html_view_kind, movie_clip_kind,
    native_text_kind, particle_emitter_kind, quad_batch_kind, render_view_kind, rich_text_kind,
    scale9_shape_kind, shape_kind, sprite_kind, stage_kind, text_label_kind, tilemap_kind,
    video_kind,
};

// entity
pub use entity::{BaseRuntime, Entity, EntityRuntime};

// geometry
pub use geometry::{
    Aabb, Matrix, Matrix3, Matrix3Like, Matrix4, Matrix4Like, MatrixLike, Rectangle, RectangleLike,
    Vector2, Vector2Like, Vector3, Vector3Like, Vector4, Vector4Like,
};

// image
pub use image::{ImageChannel, ImageFormat, PixelFormat, PixelOrder};

// input
pub use input::{
    AttachInputOptions, InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData,
    InputKeyboardData, InputManager, InputPointerData, InputSignals, KeyCode, KeyModifier,
    KeyboardEventData, MouseButton, MouseWheelMode, PointerEventData, PointerType, key_code,
    key_modifier,
};

// interaction
pub use interaction::{
    HitTestFunction, InteractionManager, InteractionManagerOptions, InteractionPointerOptions,
    InteractionPointerState, InteractionSignals,
};

// kind
pub use kind::KindId;

// material
pub use material::{
    ColorTransform, ColorTransformLike, ColorTransformMaterial, DefaultMaterialKind, Material,
    MaterialData, MaterialLike, UniformColorTransformMaterial,
};

// misc
pub use misc::{
    Application, ApplicationWindow, BatchBarrier, BatchFormat, BevelFilter, BevelType,
    BitmapFilter, BloomEffect, BlurFilter, BokehDepthOfFieldEffect, BrightnessContrastEffect,
    CameraMotionBlurEffect, CapsStyle, ChannelMixerEffect, ChromaticAberrationEffect,
    ColorGradeEffect, ColorMatrixFilter, ConvolutionFilter, CrtEffect, DirectionalBlurEffect,
    DisplacementEffect, DisplacementMapFilter, DisplacementMapMode, DitherEffect, DropShadowFilter,
    ExposureEffect, FilmGrainEffect, FxaaEffect, GlitchEffect, GodRaysEffect, GradientBevelFilter,
    GradientGlowFilter, GradientType, GrayscaleEffect, HalftoneEffect, HueSaturationEffect,
    InnerGlowFilter, InnerShadowFilter, InterpolationMethod, InvertEffect, JointStyle,
    KuwaharaEffect, LensDirtEffect, LensDistortionEffect, LensFlareEffect, LiftGammaGainEffect,
    LineScaleMode, LogData, LogEntry, LogLevel, LogSink, LookupTableGradeEffect, MedianFilter,
    MotionBlurEffect, NodeSignals, OuterGlowFilter, OutlineEffect, Path, PathMesh, PixelateEffect,
    PixelateFilterDescriptor, PosterizeEffect, RadialBlurEffect, RenderEffect, Scale9Mapper,
    ScanlinesEffect, Scene, SceneAlign, SceneScaleMode, ScreenSpaceFogEffect, SepiaEffect,
    ShapeFillRegion, SharpenEffect, SharpenFilterDescriptor, SketchEffect, SmaaEffect,
    SpreadMethod, SsaoEffect, SsrEffect, StageAlign, StageDisplayState, StageQuality,
    StageScaleMode, SurfaceFingerprint, SurfaceHistogram, SurfaceMismatch, SurfaceRegion,
    SurfaceResizeMode, TaaEffect, ThresholdOperation, TiltShiftEffect, ToneMapEffect,
    ToneMapOperator, Velocity2D, VelocityField, VelocitySample, VignetteEffect, WhiteBalanceEffect,
    WindowBounds, WindowOptions, path_command, world_node_kind,
};

// node
pub use node::{
    ClipRegion, HasAppearanceTrait, HasBoundsRectangle, HasClip, HasColorTransform, HasMaterial,
    HasTransform2D, HasTransform3D, NodeTraits, PathWinding, Spatial2DNode,
};

// particle
pub use particle::{
    AttractorForce, CircleCollider, ColliderMode, CollisionResponse, ColorKeyframe, CurveKeyframe,
    DragForce, ForceFalloff, ParticleBlendMode, ParticleCollider, ParticleConfigIssue,
    ParticleConfigIssueSeverity, ParticleCurve, ParticleEmitterCallbacks, ParticleEmitterConfig,
    ParticleEmitterData, ParticleEmitterShape, ParticleEmitterState, ParticleForce,
    ParticleObjectsState, ParticleObjectsUpdateOptions, PlaneCollider, RectangleCollider,
    TurbulenceForce, VortexForce, WindForce, WorldTransform2D,
};

// platform
pub use platform::{
    App, AppBackend, AppLifecycle, AppLifecycleState, AppUpdater, ClipboardBackend,
    ClipboardBookmark, DeviceBackend, DeviceInfo, DialogBackend, FileDialogFilter, FileEntry,
    FileStat, FileSystemBackend, FileSystemPathKind, FileWatchEvent, FileWatchEventType,
    GeoPosition, GeolocationBackend, GeolocationRequestOptions, HapticImpactStyle,
    HapticNotificationType, HapticsBackend, IpcBackend, LifecycleBackend, MenuBackend,
    MenuItemRole, MenuItemTemplate, MenuItemType, MessageDialogKind, MessageDialogOptions,
    MessageDialogResult, MotionReading, Network, NetworkBackend, NetworkConnectionType,
    NetworkStatus, NotificationAction, NotificationBackend, NotificationRequest,
    OpenFileDialogOptions, OrientationReading, PlatformBackend, PlatformInfo, PlatformKind,
    PlatformName, Power, PowerBackend, PowerStatus, ProtocolBackend, ProtocolHandler,
    SafeAreaInsets, SaveFileDialogOptions, ScreenBackend, ScreenInfo, Sensors, SensorsBackend,
    ShareBackend, ShareContent, ShellBackend, ShortcutBackend, SoftKeyboard, SoftKeyboardBackend,
    SoftKeyboardInfo, StatusBarBackend, StatusBarStyle, StorageBackend, TrayBackend, TrayEventType,
    TrayIconOptions, UpdateInfo, UpdaterBackend, WebcamBackend, WebcamCaptureOptions, WebcamPhoto,
    WebcamSource, WebcamVideo,
};

// render
pub use render::{
    RenderCache, RenderCacheAdapterSignals, RenderCacheRefreshOptions, RenderProxy, RenderProxy2D,
    RenderProxyAdapter, RenderProxyResolver, RenderState, RenderTargetDepth,
    RenderTargetDescriptor, RenderTargetFormat, Renderer, RendererData, SceneGraphSyncPolicy,
};

// resource
pub use resource::{
    AudioChannel, AudioChannelState, AudioPlayOptions, AudioResource, AudioResourceUrl, ColorSpace,
    Font, FontResource, FontUrl, ImageResource, ResourceLoadProgress, ResourceLoader, Surface,
    TextureAtlas, TextureAtlasRegion, TextureAtlasRegionLike, Tileset, VideoChannel,
    VideoChannelState, VideoPlayOptions, VideoResource, VideoResourceUrl,
};

// signal — Signal is defined in flighthq-signals (its behavior lives there);
// re-exported here so the header layer stays navigable for field declarations.
pub use flighthq_signals::{Signal, SignalConnectOptions};

// text
pub use text::{
    HandleTextInputKeyboardOptions, NativeTextData, NativeTextStyle, ReplaceTextInputOptions,
    RichTextContent, RichTextData, RichTextStyleSheet, SelectableRichTextManager, TextAutoSize,
    TextFormat, TextFormatAlign, TextFormatRange, TextInputManager, TextInputOptions,
    TextInputState, TextLabelData, TextLayoutGroup, TextLayoutParams, TextLayoutResult,
    TextLineMetrics, TextMeasureFunction, TextMetrics, TextSelectionRange, TextSelectionRectangle,
};
