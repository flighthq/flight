//! `flighthq-types` — the SDK header layer.
//!
//! Shared interfaces, enums, kind identifiers, and cross-package type contracts
//! for the Flight SDK. Every public API shape is navigable from this crate.

// ---------------------------------------------------------------------------
// Submodules
// ---------------------------------------------------------------------------

pub mod alpha;
pub mod animation;
pub mod app;
pub mod app_back_request;
pub mod app_launch_kind;
pub mod app_memory_pressure;
pub mod app_state_bag;
pub mod appearance;
pub mod bitmap_filter_margin;
pub mod blend;
pub mod camera;
pub mod classic_material;
pub mod cube_face;
pub mod display;
pub mod entity;
pub mod file_permissions;
pub mod file_system_usage;
pub mod file_walk_options;
pub mod font_metrics;
pub mod frame_script;
pub mod gamepad_kind;
pub mod geometry;
pub mod glyph_extents;
pub mod image;
pub mod input;
pub mod input_state;
pub mod interaction;
pub mod ipc;
pub mod kind;
pub mod lighting;
pub mod material;
pub mod mesh;
pub mod misc;
pub mod network;
pub mod node;
pub mod node_types;
pub mod particle;
pub mod pbr_extension_material;
pub mod pbr_material;
pub mod platform;
pub mod play_mode;
pub mod power;
pub mod render;
pub mod render_viewport_2d;
pub mod resource;
pub mod resource_load;
pub mod scene_animation_path;
pub mod scene_render;
pub mod screen;
pub mod shaped_run;
pub mod share;
pub mod shell;
pub mod shortcut;
pub mod soft_keyboard;
pub mod sprite_signals;
pub mod spritesheet_format;
pub mod storage;
pub mod surface_edge_mode;
pub mod text;
pub mod text_field_signals;
pub mod texture;
pub mod timeline_frame_event;
pub mod timeline_signals;
pub mod tray;
pub mod unlit_material;
pub mod updater;

// ---------------------------------------------------------------------------
// Re-exports — bring the entire public surface to the crate root
// ---------------------------------------------------------------------------

// alpha
pub use alpha::AlphaType;

// animation
pub use animation::{
    AnimationChannel, AnimationClip, AnimationInterpolation, AnimationPlayer, AnimationTrack,
    EasingFunction, Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer,
    StopTweenOptions, Timeline, TimelineLabel, TimelineSource, Tween, TweenManager,
    TweenManagerOptions, TweenOptions, TweenPropertyDetail,
};

// app
pub use app::{AppActivationPolicy, AppLoginItem, AppLoginItemLike, AppPathKind};

// app_back_request
pub use app_back_request::AppBackRequest;

// app_launch_kind
pub use app_launch_kind::AppLaunchKind;

// app_memory_pressure
pub use app_memory_pressure::AppMemoryPressure;

// app_state_bag
pub use app_state_bag::AppStateBag;

// appearance
pub use appearance::{AppearanceFlags, HasAppearance};

// bitmap_filter_margin
pub use bitmap_filter_margin::BitmapFilterMargin;

// blend
pub use blend::BlendMode;

// camera
pub use camera::{Camera, OrthographicProjection, PerspectiveProjection, Projection};

// classic_material
pub use classic_material::{BlinnPhongMaterial, LambertMaterial, PhongMaterial};

// cube_face
pub use cube_face::{
    CUBE_FACE_NEGATIVE_X, CUBE_FACE_NEGATIVE_Y, CUBE_FACE_NEGATIVE_Z, CUBE_FACE_POSITIVE_X,
    CUBE_FACE_POSITIVE_Y, CUBE_FACE_POSITIVE_Z,
};

// lighting
pub use lighting::{
    AMBIENT_LIGHT_KIND_NAME, AREA_LIGHT_KIND_NAME, AmbientLight, AreaLight,
    DIRECTIONAL_LIGHT_KIND_NAME, DirectionalLight, ENVIRONMENT_KIND_NAME, Environment,
    HEMISPHERE_LIGHT_KIND_NAME, HemisphereLight, Light, LightColorSpace, POINT_LIGHT_KIND_NAME,
    PointLight, SPOT_LIGHT_KIND_NAME, SpotLight,
};

// mesh
pub use mesh::{
    MESH_KIND_NAME, Mesh, MeshGeometry, MeshGeometryGlData, MeshGeometryRuntime,
    MeshGeometryWgpuData, MeshIndices, MeshSubset, PrimitiveTopology, VertexAttribute,
    VertexAttributeLayout, VertexFormat, VertexSemantic,
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

// file_permissions
pub use file_permissions::FilePermissions;

// file_system_usage
pub use file_system_usage::FileSystemUsage;

// file_walk_options
pub use file_walk_options::FileWalkOptions;

// font_metrics
pub use font_metrics::FontMetrics;

// frame_script
pub use frame_script::FrameScript;

// glyph_extents
pub use glyph_extents::GlyphExtents;

// geometry
pub use geometry::{
    Aabb, BoundingSphere, Capsule, CapsuleLike, EulerOrder, Frustum, FrustumLike, Matrix, Matrix3,
    Matrix3Like, Matrix4, Matrix4Like, MatrixLike, Obb, ObbLike, Plane, Quaternion, QuaternionLike,
    Ray3D, Rectangle, RectangleLike, Vector2, Vector2Like, Vector3, Vector3Like, Vector4,
    Vector4Like,
};

// image
pub use image::{ImageChannel, ImageFormat, PixelFormat, PixelOrder};

// input
pub use input::{
    AttachInputOptions, GamepadMapping, InputGamepadAxisData, InputGamepadButtonData,
    InputGamepadConnectData, InputKeyboardData, InputManager, InputPointerData, InputSignals,
    KeyCode, KeyModifier, KeyboardEventData, MouseButton, MouseWheelMode, PointerEventData,
    PointerType, key_code, key_modifier,
};

// gamepad_kind
pub use gamepad_kind::{gamepad_axis_kind, gamepad_button_kind};

// input_state
pub use input_state::{InputKeyRepeatOptions, InputState};

// interaction
pub use interaction::{
    HitTestFunction, InteractionManager, InteractionManagerOptions, InteractionPointerOptions,
    InteractionPointerState, InteractionSignals,
};

// ipc
pub use ipc::{
    IpcBackendCapabilities, IpcChannel, IpcMessageEvent, IpcSignals, IpcTarget, IpcTimeoutError,
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
    Application, ApplicationLoopOptions, ApplicationWindow, BatchBarrier, BatchFormat, BevelFilter,
    BevelType, BitmapFilter, BloomEffect, BlurFilter, BokehDepthOfFieldEffect,
    BrightnessContrastEffect, CameraMotionBlurEffect, CapsStyle, ChannelMixerEffect,
    ChromaticAberrationEffect, ColorGradeEffect, ColorMatrixFilter, ConvolutionFilter, CrtEffect,
    DirectionalBlurEffect, DisplacementEffect, DisplacementMapFilter, DisplacementMapMode,
    DitherEffect, DropShadowFilter, ExposureEffect, FilmGrainEffect, FxaaEffect, GlitchEffect,
    GodRaysEffect, GradientBevelFilter, GradientGlowFilter, GradientType, GrayscaleEffect,
    HalftoneEffect, HueSaturationEffect, InnerGlowFilter, InnerShadowFilter, InterpolationMethod,
    InvertEffect, JointStyle, KuwaharaEffect, LensDirtEffect, LensDistortionEffect,
    LensFlareEffect, LiftGammaGainEffect, LineScaleMode, LogContext, LogData, LogDataProvider,
    LogEntry, LogFormatter, LogLevel, LogSink, LogSpan, LogTimer, LogTransportBackend,
    LookupTableGradeEffect, LoopBackend, MedianFilter, MotionBlurEffect, NodeSignals,
    OuterGlowFilter, OutlineEffect, Path, PathMesh, PixelateEffect, PixelateFilterDescriptor,
    PosterizeEffect, RadialBlurEffect, RenderEffect, Scale9Mapper, ScanlinesEffect, Scene,
    SceneAlign, SceneScaleMode, ScreenSpaceFogEffect, SepiaEffect, ShapeFillRegion, SharpenEffect,
    SharpenFilterDescriptor, SketchEffect, SmaaEffect, SpreadMethod, SsaoEffect, SsrEffect,
    StageAlign, StageDisplayState, StageQuality, StageScaleMode, SurfaceFingerprint,
    SurfaceHistogram, SurfaceMismatch, SurfaceRegion, SurfaceResizeMode, TaaEffect,
    ThresholdOperation, TiltShiftEffect, ToneMapEffect, ToneMapOperator, Velocity2D, VelocityField,
    VelocitySample, VignetteEffect, WhiteBalanceEffect, WindowBounds, WindowOptions, path_command,
    scene_node_kind,
};

// network
pub use network::{
    Network, NetworkBackend, NetworkConnectionType, NetworkReachability,
    NetworkReachabilityOptions, NetworkStatus,
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

// pbr_extension_material
pub use pbr_extension_material::{
    AnisotropyPbrMaterial, ClearcoatPbrMaterial, IridescencePbrMaterial, SheenPbrMaterial,
    SpecularGlossinessPbrMaterial, SpecularPbrMaterial, SubsurfacePbrMaterial,
    TransmissionVolumePbrMaterial,
};

// pbr_material
pub use pbr_material::{
    MaterialAlphaMode, STANDARD_PBR_MATERIAL_KIND_NAME, StandardPbrMaterial,
    StandardPbrMaterialProperties, SurfaceMaterial, SurfaceMaterialLike,
    standard_pbr_material_kind,
};

// play_mode
pub use play_mode::PlayMode;

// platform
pub use platform::{
    AmbientLightReading, App, AppBackend, AppLifecycle, AppLifecycleState, ClipboardBackend,
    ClipboardBookmark, ClipboardWatch, ClipboardWriteItem, DEVICE_FORM_FACTOR_CAR,
    DEVICE_FORM_FACTOR_DESKTOP, DEVICE_FORM_FACTOR_PHONE, DEVICE_FORM_FACTOR_TABLET,
    DEVICE_FORM_FACTOR_TV, DEVICE_FORM_FACTOR_UNKNOWN, DEVICE_FORM_FACTOR_WATCH, DeviceBackend,
    DeviceCapabilities, DeviceDisplayMetrics, DeviceFormFactor, DeviceInfo, DialogBackend,
    FileAccessMode, FileDialogFilter, FileDialogHandle, FileDialogHandleKind, FileDialogStartIn,
    FileEntry, FileStat, FileSystemBackend, FileSystemPathKind, FileWatchEvent, FileWatchEventType,
    GeoPosition, GeoPositionResult, GeolocationBackend, GeolocationErrorReason,
    GeolocationPermissionState, GeolocationRequestOptions, HapticImpactStyle,
    HapticNotificationType, HapticsBackend, HapticsCapabilities, IpcBackend, IpcInvokeFuture,
    IpcInvokeHandler, IpcMessageListener, IpcValue, LifecycleBackend, MenuBackend, MenuItemRole,
    MenuItemTemplate, MenuItemType, MessageDialogKind, MessageDialogOptions, MessageDialogResult,
    MotionReading, NotificationAction, NotificationBackend, NotificationCapabilities,
    NotificationChannel, NotificationPermission, NotificationRequest, NotificationSchedule,
    OpenDirectoryDialogOptions, OpenFileDialogOptions, OrientationReading, ParsedProtocolUrl,
    PlatformBackend, PlatformEndianness, PlatformEngine, PlatformInfo, PlatformKind, PlatformName,
    PlatformRuntime, Power, PowerBackend, PowerStatus, PressureReading, PromptDialogOptions,
    ProtocolBackend, ProtocolHandler, ProximityReading, QuaternionReading, RotationRateReading,
    SafeAreaInsets, SaveFileDialogOptions, ScheduledNotification, SensorAccuracy,
    SensorPermissionTarget, SensorReading, SensorSubscribeOptions, Sensors, SensorsBackend,
    SensorsPermissionState, ShareBackend, ShareContent, ShellBackend, StatusBar,
    StatusBarAnimation, StatusBarBackend, StatusBarInfo, StatusBarStyle, StatusBarStyleEntry,
    StatusBarStyleEntryHandle, StorageBackend, WebcamBackend, WebcamCaptureOptions, WebcamPhoto,
    WebcamSource, WebcamVideo,
};

// power
pub use power::{
    PowerBatteryHealth, PowerBatteryHealthState, PowerIdleState, PowerKeepAwakeMode,
    PowerThermalState,
};

// render
pub use render::{
    RenderCache, RenderCacheAdapterSignals, RenderCacheRefreshOptions, RenderProxy, RenderProxy2D,
    RenderProxyAdapter, RenderProxyResolver, RenderState, RenderTargetDepth,
    RenderTargetDescriptor, RenderTargetFormat, Renderer, RendererData, SceneGraphSyncPolicy,
};

// render_viewport_2d
pub use render_viewport_2d::RenderViewport2D;

// resource
pub use resource::{
    AudioChannel, AudioChannelState, AudioPlayOptions, AudioResource, AudioResourceUrl, ColorSpace,
    Font, FontResource, FontUrl, ImageResource, ResourceLoadProgress, ResourceLoader, Surface,
    TextureAtlas, TextureAtlasRegion, TextureAtlasRegionLike, Tileset, VideoChannel,
    VideoChannelState, VideoPlayOptions, VideoResource, VideoResourceUrl,
};

// resource_load
pub use resource_load::{
    ResourceLoadErrorPolicy, ResourceLoadItemError, ResourceLoadItemRetry, ResourceLoadItemStatus,
    ResourceLoadReport, ResourceLoadRetryBackoff, ResourceLoaderItemSignals, ResourceLoaderOptions,
};

// scene_animation_path
pub use scene_animation_path::SceneAnimationPath;

// scene_render
pub use scene_render::{SceneLightBlock, SceneLights, SceneRenderProxy};

// screen
pub use screen::{
    ScreenBackend, ScreenChangeEvent, ScreenChangeKind, ScreenChangeListener, ScreenChangedMetrics,
    ScreenColorSpace, ScreenDetailPermission, ScreenInfo, ScreenMode, ScreenOrientation,
    ScreenSignals, ScreenTouchSupport,
};

// share
pub use share::{ShareFile, ShareOptions, ShareResult, ShareSignals};

// shaped_run
pub use shaped_run::{ShapeDirection, ShapedGlyph, ShapedRun};

// shell
pub use shell::{
    ShellOpenExternalOptions, ShellOpenPathOptions, ShellShortcutLink, ShellShortcutWriteOperation,
};

// shortcut
pub use shortcut::{
    Accelerator, AcceleratorParseError, AcceleratorParseErrorReason, ParsedAccelerator,
    ShortcutBackend, ShortcutEvent, ShortcutModifier, ShortcutSignals,
};

// soft_keyboard
pub use soft_keyboard::{
    SOFT_KEYBOARD_RESIZE_BODY_KIND, SOFT_KEYBOARD_RESIZE_NONE_KIND, SOFT_KEYBOARD_STYLE_DARK_KIND,
    SOFT_KEYBOARD_STYLE_DEFAULT_KIND, SoftKeyboard, SoftKeyboardBackend, SoftKeyboardInfo,
    SoftKeyboardPhase, SoftKeyboardResizeMode, SoftKeyboardStyleKind, SoftKeyboardTransition,
};

// sprite_signals
pub use sprite_signals::{
    QuadBatchInstanceRemoved, QuadBatchSignals, SpriteSignals, TilemapSignals, TilemapTileChanged,
    TilemapTilesChanged,
};

// spritesheet_format
pub use spritesheet_format::{
    SPRITESHEET_FORMAT_KIND_ASEPRITE, SPRITESHEET_FORMAT_KIND_COCOS_PLIST,
    SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS, SPRITESHEET_FORMAT_KIND_STARLING,
    SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER, SpritesheetFormatKind,
};

// signal — Signal is defined in flighthq-signals (its behavior lives there);
// re-exported here so the header layer stays navigable for field declarations.
pub use flighthq_signals::{Signal, SignalConnectOptions};

// storage
pub use storage::{
    StorageChange, StorageMigration, StorageNamespace, StorageQuota, StorageSignals,
};

// surface_edge_mode
pub use surface_edge_mode::SurfaceEdgeMode;

// text
pub use text::{
    HandleTextInputKeyboardOptions, NativeTextData, NativeTextStyle, ReplaceTextInputOptions,
    RichTextContent, RichTextData, RichTextStyleSheet, SelectableRichTextManager, ShapeRunOptions,
    TextAutoSize, TextDirection, TextFormat, TextFormatAlign, TextFormatListMarker,
    TextFormatRange, TextInputHistoryEntry, TextInputManager, TextInputOptions, TextInputState,
    TextJustification, TextLabelData, TextLayoutGroup, TextLayoutParams, TextLayoutResult,
    TextLineMetrics, TextMeasureFunction, TextMetrics, TextSelectionRange, TextSelectionRectangle,
    TextShaperBackend,
};
pub use text_field_signals::{
    TextFieldChangeEvent, TextFieldLinkEvent, TextFieldScrollEvent, TextFieldSignals,
};

// timeline_frame_event
pub use timeline_frame_event::TimelineFrameEvent;

// timeline_signals
pub use timeline_signals::TimelineSignals;

// tray
pub use tray::{
    TrayBackend, TrayBalloonIconType, TrayBalloonOptions, TrayCapabilities, TrayEventData,
    TrayEventType, TrayIconBounds, TrayIconOptions,
};

// unlit_material
pub use unlit_material::{
    DepthMaterial, EmissiveMaterial, MatcapMaterial, NormalMaterial, ToonMaterial, UnlitMaterial,
    VertexColorMaterial, WireframeMaterial,
};

// updater
pub use updater::{
    AppUpdater, UpdateInfo, UpdateProgress, UpdaterBackend, UpdaterConfig, UpdaterError,
    UpdaterPhase, UpdaterSignatureConfig, UpdaterState,
};
