//! SDL event-loop, native-resource, and capability implementation.

//! flight-compiler: target-native

// flight-lint: allow-file(contract-vocabulary, f64, hidden-state, sugar-delegates) This native host owns SDL and GPU platform values, Flight's f64 geometry/clock boundary, its monotonic clock, and queued native commands

use std::any::Any;
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::{CString, c_void};
use std::fmt;
use std::marker::PhantomData;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::thread::ThreadId;
use std::time::{Duration, Instant};

use flight_app::{
    AppFrameCallback, AppUnsubscribe, HostAppLoopCapability, HostWindowAppearanceCapability,
    HostWindowCapabilities, HostWindowFocusCapability, HostWindowFullscreenCapability,
    HostWindowGeometryCapability, HostWindowLifecycleCapability,
    HostWindowSizeConstraintsCapability, HostWindowStateCapability, HostWindowVisibilityCapability,
    HostWindowZOrderCapability, WindowBounds, WindowCloseRequestListener, WindowMoveListener,
    WindowOptions, WindowResizeListener,
};
use flight_geometry::Vector2;
use flight_host::{
    FrameRequestHandle, HostSpawnCapability, InputIngressSource, NativeSurfaceHandle,
    NativeWindowHandle, ProviderRef, WgpuDevice,
};
use flight_input::{
    GamepadMapping, HostInputIngressCapability, InputGamepadConnectData, InputIngressAttach,
    InputIngressSink,
};
use flight_lifecycle::{
    AppLaunchKind, AppLifecycleState, HostLifecycleCapability, LifecycleListener,
    LifecycleUnsubscribe,
};
use flight_render_gl::GlContextToken;
use flight_render_wgpu::{
    WgpuCanvasConfiguration, WgpuCanvasContext, WgpuCanvasFrame, WgpuCanvasFrameError,
    WgpuNativeDevice, acquire_wgpu_native_surface_frame, configure_wgpu_native_surface,
    create_wgpu_native_device, create_wgpu_surface_context, get_wgpu_texture_format,
    get_wgpu_texture_format_name, present_wgpu_native_surface_frame,
};
use flight_screen::{
    HostScreenCapabilities, HostScreenQueryCapability, ScreenInfo, create_screen_info,
};
use flight_surface::{
    GlContextOptions, HostGlCapabilities, HostGlCapability, HostSurfaceCapabilities,
    HostSurfaceDisplayCapability, HostSurfaceResizeCapability, HostWgpuCapabilities,
    HostWgpuCapability, SurfaceBase, SurfaceRef, WgpuHostAcquisition, WgpuHostAcquisitionOptions,
    WgpuHostAcquisitionOwnership, WgpuPresentationSurface, WgpuProviderFuture,
    WgpuSurfaceAttachResult, WgpuSurfaceAttachment, allocate_surface, create_wgpu_host_acquisition,
    get_surface_handle,
};
use futures::executor::block_on;
use raw_window_handle::{HasDisplayHandle, HasWindowHandle};
use sdl3::event::{Event, WindowEvent};
use sdl3::gamepad::Gamepad;
use sdl3::joystick::JoystickId;
use sdl3::keyboard::Mod;
use sdl3::mouse::{MouseButton, MouseState};
use sdl3::video::{Display, GLContext, GLProfile, SwapInterval, Window, WindowPos};
use sdl3::{EventPump, GamepadSubsystem, Sdl, VideoSubsystem};

use crate::{
    SdlGamepadIdMap, build_sdl_gamepad_axis_data, build_sdl_gamepad_button_data,
    build_sdl_keyboard_data, build_sdl_pointer_data, build_sdl_text_data, build_sdl_touch_data,
    build_sdl_trigger_data, build_sdl_wheel_data, connect_sdl_gamepad_id,
    create_sdl_gamepad_id_map, disconnect_sdl_gamepad_id, get_sdl_gamepad_id,
    translate_sdl_mouse_button,
};

/// Selects the one renderer initialized for an SDL host.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SdlHostRenderBackend {
    Gl,
    #[default]
    Wgpu,
}

/// Options applied before the host creates its one native window.
#[derive(Clone, Debug, PartialEq)]
pub struct SdlHostOptions {
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub visible: bool,
    pub render_backend: SdlHostRenderBackend,
    pub gl_context_options: Option<GlContextOptions>,
}

/// Structured host failure; [`explain_sdl_host_failure`] supplies the user-facing diagnostic.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SdlHostFailure {
    pub kind: SdlHostFailureKind,
    pub message: String,
}

/// The stage at which host creation or execution failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SdlHostFailureKind {
    Adapter,
    Device,
    EventPump,
    Gamepad,
    GlContext,
    RawHandle,
    RunLoop,
    Sdl,
    Surface,
    Thread,
    Video,
    Window,
}

/// Result of one non-blocking SDL event pump.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SdlPumpStatus {
    Continue,
    Exit(i32),
}

struct ProviderIdentity;

struct SdlSurfaceIdentity;

struct InputAttachment {
    active: AtomicBool,
    sink: InputIngressSink,
}

#[derive(Default)]
struct InputAttachments {
    gamepad: Vec<Arc<InputAttachment>>,
    keyboard: Vec<Arc<InputAttachment>>,
    pointer: Vec<Arc<InputAttachment>>,
    relative_pointer: Vec<Arc<InputAttachment>>,
    text: Vec<Arc<InputAttachment>>,
    wheel: Vec<Arc<InputAttachment>>,
}

struct CloseSubscription {
    active: AtomicBool,
    close: Arc<dyn Fn() + Send + Sync>,
    request: WindowCloseRequestListener,
}

struct Listener<T: ?Sized> {
    active: AtomicBool,
    callback: Arc<T>,
}

struct GlSubscription {
    active: AtomicBool,
    lost: Arc<dyn Fn() + Send + Sync>,
    _restored: Arc<dyn Fn() + Send + Sync>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InputAttachmentKind {
    Gamepad,
    Keyboard,
    Pointer,
    RelativePointer,
    Text,
    Wheel,
}

enum SdlWindowCommand {
    AlwaysOnTop(bool),
    Center,
    Close,
    Configure {
        title: String,
        width: f32,
        height: f32,
        resizable: bool,
        fullscreen: bool,
        minimized: bool,
        maximized: bool,
        visible: bool,
    },
    Focus,
    Fullscreen(bool),
    Hide,
    Maximize,
    Minimize,
    Position(i32, i32),
    ReconfigureWgpu(u32, u32),
    Restore,
    SetMaximumSize(u32, u32),
    SetMinimumSize(u32, u32),
    SetResizable(bool),
    SetSize(u32, u32),
    SetTitle(String),
    TextInput(bool),
    Show,
}

struct SdlWgpuSurfaceOwner {
    surface: wgpu::Surface<'static>,
}

#[derive(Clone)]
struct SdlWgpuShared {
    owner: Weak<SdlWgpuSurfaceOwner>,
    configuration: Arc<Mutex<wgpu::SurfaceConfiguration>>,
    native: WgpuNativeDevice,
    device: WgpuDevice,
    context: flight_host::WgpuSurfaceContext,
    format: wgpu::TextureFormat,
}

struct SdlWgpuNativeResources {
    _instance: wgpu::Instance,
    _adapter: wgpu::Adapter,
    owner: Arc<SdlWgpuSurfaceOwner>,
    shared: SdlWgpuShared,
}

struct SdlWgpuCanvasContext {
    owner: Weak<SdlWgpuSurfaceOwner>,
    alive: Arc<AtomicBool>,
}

struct ProviderState {
    provider: ProviderRef,
    source_handle: Arc<dyn Any + Send + Sync>,
    backend: SdlHostRenderBackend,
    alive: Arc<AtomicBool>,
    start: Instant,
    lifecycle: AtomicU32,
    exit_code: AtomicI32,
    window_x: AtomicI32,
    window_y: AtomicI32,
    logical_width: AtomicU32,
    logical_height: AtomicU32,
    physical_width: AtomicU32,
    physical_height: AtomicU32,
    scale_factor: AtomicU32,
    next_frame_handle: AtomicI32,
    frame_callbacks: Mutex<BTreeMap<i32, AppFrameCallback>>,
    input: Mutex<InputAttachments>,
    modifiers: Mutex<Mod>,
    pointer_position: Mutex<(f32, f32)>,
    pointer_buttons: AtomicU32,
    touch_ids: Mutex<BTreeMap<u64, i32>>,
    primary_touch: Mutex<Option<u64>>,
    gamepads: Mutex<BTreeMap<i32, InputGamepadConnectData>>,
    trigger_buttons: Mutex<BTreeMap<(i32, i32), bool>>,
    commands: Mutex<Vec<SdlWindowCommand>>,
    screens: Mutex<Vec<ScreenInfo>>,
    close_listeners: Mutex<Vec<Arc<CloseSubscription>>>,
    lifecycle_listeners: Mutex<Vec<Arc<Listener<dyn Fn() + Send + Sync>>>>,
    move_listeners: Mutex<Vec<Arc<Listener<dyn Fn(f32, f32) + Send + Sync>>>>,
    resize_listeners: Mutex<Vec<Arc<Listener<dyn Fn(f32, f32, f64) + Send + Sync>>>>,
    gl_subscriptions: Mutex<Vec<Arc<GlSubscription>>>,
    gpu: Option<SdlWgpuShared>,
    gl_options: Option<GlContextOptions>,
    gl_token: Option<flight_host::GlContext>,
}

struct SdlNativeState {
    process_slot: bool,
    sdl: Option<Sdl>,
    video: Option<VideoSubsystem>,
    gamepad: Option<GamepadSubsystem>,
    event_pump: Option<EventPump>,
    gamepads: BTreeMap<JoystickId, Gamepad>,
    gamepad_ids: SdlGamepadIdMap,
    gpu: Option<SdlWgpuNativeResources>,
    gl_context: Option<GLContext>,
    window: Option<Window>,
}

static SDL_HOST_LIVE: AtomicBool = AtomicBool::new(false);

/// Owns one SDL context, window, event pump, and the capabilities backed by that window.
pub struct SdlHost {
    created_thread: ThreadId,
    native: SdlNativeState,
    state: Arc<ProviderState>,
    window_capabilities: HostWindowCapabilities,
    app_loop_capability: HostAppLoopCapability,
    lifecycle_capability: HostLifecycleCapability,
    screen_capabilities: HostScreenCapabilities,
    input_ingress_capability: HostInputIngressCapability,
    surface_capabilities: HostSurfaceCapabilities,
    wgpu_capabilities: HostWgpuCapabilities,
    gl_capabilities: HostGlCapabilities,
    input_source: InputIngressSource,
    native_window: NativeWindowHandle,
    surface: SurfaceRef,
    _not_send: PhantomData<Rc<()>>,
}

fn create_app_loop_capability(state: &Arc<ProviderState>) -> HostAppLoopCapability {
    let request_state = state.clone();
    let cancel_state = state.clone();
    let now_state = state.clone();
    return HostAppLoopCapability {
        provider: state.provider.clone(),
        now: Arc::new(move || now_state.now()),
        request_frame: Arc::new(move |callback| {
            let handle = request_state
                .next_frame_handle
                .fetch_add(1, Ordering::AcqRel)
                .max(1);
            request_state
                .frame_callbacks
                .lock()
                .unwrap()
                .insert(handle, callback);
            FrameRequestHandle(handle)
        }),
        cancel_frame: Arc::new(move |handle| {
            cancel_state
                .frame_callbacks
                .lock()
                .unwrap()
                .remove(&handle.0);
        }),
    };
}

fn create_gl_capabilities(state: &Arc<ProviderState>) -> HostGlCapabilities {
    let Some(token) = state.gl_token.clone() else {
        return HostGlCapabilities::default();
    };
    let create_state = state.clone();
    let acquire_state = state.clone();
    let release_state = state.clone();
    let subscribe_state = state.clone();
    return HostGlCapabilities {
        context: Some(HostGlCapability {
            provider: state.provider.clone(),
            create: Arc::new(move |_window, width, height, options| {
                if !create_state.alive.load(Ordering::Acquire)
                    || !create_state.matches_gl_options(options)
                {
                    return None;
                }
                create_state
                    .physical_width
                    .store(width.max(0.0) as u32, Ordering::Release);
                create_state
                    .physical_height
                    .store(height.max(0.0) as u32, Ordering::Release);
                Some(NativeSurfaceHandle {
                    provider: create_state.provider.clone(),
                    handle: create_state.source_handle.clone(),
                })
            }),
            acquire: Arc::new(move |surface, options| {
                if !acquire_state.alive.load(Ordering::Acquire)
                    || !acquire_state.is_our_surface(surface)
                    || !acquire_state.matches_gl_options(options)
                {
                    return None;
                }
                Some(token.clone())
            }),
            release: Arc::new(move |surface| {
                if release_state.is_our_surface(surface) {
                    // The SDL native context belongs to the host, not an acquisition record.
                }
            }),
            subscribe: Arc::new(move |surface, lost, restored| {
                if !subscribe_state.is_our_surface(surface) {
                    return Arc::new(|| {});
                }
                let subscription = Arc::new(GlSubscription {
                    active: AtomicBool::new(true),
                    lost,
                    _restored: restored,
                });
                subscribe_state
                    .gl_subscriptions
                    .lock()
                    .unwrap()
                    .push(subscription.clone());
                Arc::new(move || subscription.active.store(false, Ordering::Release))
            }),
        }),
    };
}

fn create_gpu_resources(
    provider: ProviderRef,
    alive: Arc<AtomicBool>,
    window: &Window,
) -> Result<SdlWgpuNativeResources, SdlHostFailure> {
    let instance = wgpu::Instance::default();
    let raw_display_handle = window
        .display_handle()
        .map_err(|error| failure(SdlHostFailureKind::RawHandle, error))?
        .as_raw();
    let raw_window_handle = window
        .window_handle()
        .map_err(|error| failure(SdlHostFailureKind::RawHandle, error))?
        .as_raw();
    // SAFETY: SdlNativeState is the sole strong owner of this surface and explicitly drops it
    // before its SDL Window. The raw display/window handles remain valid throughout that interval.
    let surface = unsafe {
        instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle {
            raw_display_handle: Some(raw_display_handle),
            raw_window_handle,
        })
    }
    .map_err(|error| failure(SdlHostFailureKind::Surface, error))?;
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::None,
        force_fallback_adapter: false,
        compatible_surface: Some(&surface),
        ..wgpu::RequestAdapterOptions::default()
    }))
    .map_err(|error| failure(SdlHostFailureKind::Adapter, error))?;
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("flight-host-sdl-device"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits()),
        ..wgpu::DeviceDescriptor::default()
    }))
    .map_err(|error| failure(SdlHostFailureKind::Device, error))?;
    let (width, height) = window.size_in_pixels();
    let mut configuration = surface
        .get_default_config(&adapter, width.max(1), height.max(1))
        .ok_or_else(|| {
            failure(
                SdlHostFailureKind::Surface,
                "the selected adapter has no presentation configuration",
            )
        })?;
    if configuration.format.is_srgb()
        && let Some(format) = surface
            .get_capabilities(&adapter)
            .formats
            .into_iter()
            .find(|format| !format.is_srgb())
    {
        configuration.format = format;
    }
    surface.configure(&device, &configuration);
    let format = configuration.format;
    let owner = Arc::new(SdlWgpuSurfaceOwner { surface });
    let configuration = Arc::new(Mutex::new(configuration));
    let native = create_wgpu_native_device(device, queue, create_host_spawn(provider.clone()));
    let device = WgpuDevice {
        provider: provider.clone(),
        handle: Arc::new(native.clone()),
    };
    let canvas: Arc<dyn WgpuCanvasContext> = Arc::new(SdlWgpuCanvasContext {
        owner: Arc::downgrade(&owner),
        alive: alive.clone(),
    });
    let context = create_wgpu_surface_context(provider, canvas);
    let shared = SdlWgpuShared {
        owner: Arc::downgrade(&owner),
        configuration,
        native,
        device,
        context,
        format,
    };
    return Ok(SdlWgpuNativeResources {
        _instance: instance,
        _adapter: adapter,
        owner,
        shared,
    });
}

fn create_host_spawn(provider: ProviderRef) -> HostSpawnCapability {
    return HostSpawnCapability {
        provider,
        spawn: Arc::new(|future| {
            std::thread::spawn(move || block_on(future));
        }),
    };
}

fn create_input_ingress_capability(state: &Arc<ProviderState>) -> HostInputIngressCapability {
    return HostInputIngressCapability {
        provider: state.provider.clone(),
        attach_gamepad: attach_input(state.clone(), InputAttachmentKind::Gamepad),
        attach_keyboard: attach_input(state.clone(), InputAttachmentKind::Keyboard),
        attach_pointer: attach_input(state.clone(), InputAttachmentKind::Pointer),
        attach_relative_pointer: attach_input(state.clone(), InputAttachmentKind::RelativePointer),
        attach_text: attach_input(state.clone(), InputAttachmentKind::Text),
        attach_wheel: attach_input(state.clone(), InputAttachmentKind::Wheel),
    };
}

fn create_lifecycle_capability(state: &Arc<ProviderState>) -> HostLifecycleCapability {
    let get_state = state.clone();
    let subscribe_state = state.clone();
    return HostLifecycleCapability {
        get_state: Arc::new(move || get_state.lifecycle()),
        subscribe: Arc::new(move |callback: LifecycleListener| {
            let listener = Arc::new(Listener {
                active: AtomicBool::new(true),
                callback,
            });
            subscribe_state
                .lifecycle_listeners
                .lock()
                .unwrap()
                .push(listener.clone());
            let release: LifecycleUnsubscribe = Arc::new(move || {
                listener.active.store(false, Ordering::Release);
            });
            release
        }),
        get_launch_kind: Some(Arc::new(|| AppLaunchKind::Cold)),
        subscribe_memory_warning: None,
    };
}

fn create_screen_capabilities(state: &Arc<ProviderState>) -> HostScreenCapabilities {
    let all_state = state.clone();
    let primary_state = state.clone();
    let cursor_state = state.clone();
    return HostScreenCapabilities {
        query: Some(HostScreenQueryCapability {
            provider: state.provider.clone(),
            destroy: None,
            get_screens: Arc::new(move |out| {
                *out = all_state.screens.lock().unwrap().clone();
            }),
            get_primary_screen: Arc::new(move |out| {
                *out = primary_state
                    .screens
                    .lock()
                    .unwrap()
                    .iter()
                    .find(|screen| screen.is_primary)
                    .cloned()
                    .unwrap_or_else(create_screen_info);
            }),
            get_cursor_position: Arc::new(move |out: &mut Vector2| {
                let (x, y) = *cursor_state.pointer_position.lock().unwrap();
                out.x = f64::from(cursor_state.window_x.load(Ordering::Acquire)) + f64::from(x);
                out.y = f64::from(cursor_state.window_y.load(Ordering::Acquire)) + f64::from(y);
            }),
        }),
        ..HostScreenCapabilities::default()
    };
}

/// Creates one SDL context, window, event pump, and selected renderer backend.
pub fn create_sdl_host(options: &SdlHostOptions) -> Result<SdlHost, SdlHostFailure> {
    if SDL_HOST_LIVE
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(failure(
            SdlHostFailureKind::Sdl,
            "another flight-host-sdl instance is already live; SDL event ownership is process-global",
        ));
    }
    let result = create_sdl_host_claimed(options);
    if result.is_err() {
        SDL_HOST_LIVE.store(false, Ordering::Release);
    }
    return result;
}

fn create_sdl_host_claimed(options: &SdlHostOptions) -> Result<SdlHost, SdlHostFailure> {
    let sdl = sdl3::init().map_err(|error| failure(SdlHostFailureKind::Sdl, error))?;
    let video = sdl
        .video()
        .map_err(|error| failure(SdlHostFailureKind::Video, error))?;
    let gamepad = sdl
        .gamepad()
        .map_err(|error| failure(SdlHostFailureKind::Gamepad, error))?;
    let event_pump = sdl
        .event_pump()
        .map_err(|error| failure(SdlHostFailureKind::EventPump, error))?;
    if options.render_backend == SdlHostRenderBackend::Gl {
        configure_gl_attributes(&video, options.gl_context_options.as_ref(), true);
    }
    let mut builder = video.window(
        &options.title,
        options.width.max(1.0) as u32,
        options.height.max(1.0) as u32,
    );
    builder.high_pixel_density().resizable();
    if !options.visible {
        builder.hidden();
    }
    match options.render_backend {
        SdlHostRenderBackend::Gl => {
            builder.opengl();
        }
        SdlHostRenderBackend::Wgpu => {
            builder.metal_view();
        }
    }
    let window = match builder.build() {
        Ok(window) => window,
        Err(error)
            if options.render_backend == SdlHostRenderBackend::Gl
                && error.to_string().contains("matching GLX visual") =>
        {
            eprintln!(
                "flight-host-sdl OpenGL context note: the GLX display rejected an sRGB window visual; retrying with the same core context and a linear default framebuffer"
            );
            configure_gl_attributes(&video, options.gl_context_options.as_ref(), false);
            builder
                .build()
                .map_err(|error| failure(SdlHostFailureKind::Window, error))?
        }
        Err(error) => return Err(failure(SdlHostFailureKind::Window, error)),
    };

    let provider: ProviderRef = Arc::new(ProviderIdentity);
    let identity: Arc<SdlSurfaceIdentity> = Arc::new(SdlSurfaceIdentity);
    let source_handle: Arc<dyn Any + Send + Sync> = identity;
    let alive = Arc::new(AtomicBool::new(true));
    let (gl_context, gl_token, gpu) = match options.render_backend {
        SdlHostRenderBackend::Gl => {
            let context = window
                .gl_create_context()
                .map_err(|error| failure(SdlHostFailureKind::GlContext, error))?;
            window
                .gl_make_current(&context)
                .map_err(|error| failure(SdlHostFailureKind::GlContext, error))?;
            let desynchronized = options
                .gl_context_options
                .as_ref()
                .and_then(|options| options.context_attributes.as_ref())
                .and_then(|attributes| attributes.desynchronized)
                .unwrap_or(false);
            let swap_interval = if desynchronized {
                SwapInterval::Immediate
            } else {
                SwapInterval::VSync
            };
            // SDL documents swap-interval refusal as a valid platform outcome; rendering remains usable.
            let _ = video.gl_set_swap_interval(swap_interval);
            let token = flight_host::GlContext {
                provider: provider.clone(),
                handle: Arc::new(GlContextToken {
                    get_proc_address: Arc::new(sdl_gl_get_proc_address),
                }),
            };
            (Some(context), Some(token), None)
        }
        SdlHostRenderBackend::Wgpu => (
            None,
            None,
            Some(create_gpu_resources(
                provider.clone(),
                alive.clone(),
                &window,
            )?),
        ),
    };
    let (window_x, window_y) = window.position();
    let (logical_width, logical_height) = window.size();
    let (physical_width, physical_height) = window.size_in_pixels();
    let state = Arc::new(ProviderState {
        provider: provider.clone(),
        source_handle: source_handle.clone(),
        backend: options.render_backend,
        alive,
        start: Instant::now(),
        lifecycle: AtomicU32::new(AppLifecycleState::Active as u32),
        exit_code: AtomicI32::new(0),
        window_x: AtomicI32::new(window_x),
        window_y: AtomicI32::new(window_y),
        logical_width: AtomicU32::new(logical_width),
        logical_height: AtomicU32::new(logical_height),
        physical_width: AtomicU32::new(physical_width),
        physical_height: AtomicU32::new(physical_height),
        scale_factor: AtomicU32::new(window.display_scale().to_bits()),
        next_frame_handle: AtomicI32::new(1),
        frame_callbacks: Mutex::new(BTreeMap::new()),
        input: Mutex::new(InputAttachments::default()),
        modifiers: Mutex::new(Mod::NOMOD),
        pointer_position: Mutex::new((0.0, 0.0)),
        pointer_buttons: AtomicU32::new(0),
        touch_ids: Mutex::new(BTreeMap::new()),
        primary_touch: Mutex::new(None),
        gamepads: Mutex::new(BTreeMap::new()),
        trigger_buttons: Mutex::new(BTreeMap::new()),
        commands: Mutex::new(Vec::new()),
        screens: Mutex::new(screens_from_video(&video)),
        close_listeners: Mutex::new(Vec::new()),
        lifecycle_listeners: Mutex::new(Vec::new()),
        move_listeners: Mutex::new(Vec::new()),
        resize_listeners: Mutex::new(Vec::new()),
        gl_subscriptions: Mutex::new(Vec::new()),
        gpu: gpu.as_ref().map(|gpu| gpu.shared.clone()),
        gl_options: options.gl_context_options.clone(),
        gl_token,
    });
    let window_capabilities = create_window_capabilities(&state);
    let app_loop_capability = create_app_loop_capability(&state);
    let lifecycle_capability = create_lifecycle_capability(&state);
    let screen_capabilities = create_screen_capabilities(&state);
    let input_ingress_capability = create_input_ingress_capability(&state);
    let surface_capabilities = create_surface_capabilities(&state);
    let wgpu_capabilities = create_wgpu_capabilities(&state);
    let gl_capabilities = create_gl_capabilities(&state);
    let input_source = InputIngressSource {
        provider: provider.clone(),
        handle: source_handle.clone(),
    };
    let native_window = NativeWindowHandle {
        provider: provider.clone(),
        handle: source_handle.clone(),
    };
    let surface = allocate_surface::<SurfaceBase>(Some(NativeSurfaceHandle {
        provider,
        handle: source_handle,
    }));
    let native = SdlNativeState {
        process_slot: true,
        sdl: Some(sdl),
        video: Some(video),
        gamepad: Some(gamepad),
        event_pump: Some(event_pump),
        gamepads: BTreeMap::new(),
        gamepad_ids: create_sdl_gamepad_id_map(),
        gpu,
        gl_context,
        window: Some(window),
    };
    let mut host = SdlHost {
        created_thread: std::thread::current().id(),
        native,
        state,
        window_capabilities,
        app_loop_capability,
        lifecycle_capability,
        screen_capabilities,
        input_ingress_capability,
        surface_capabilities,
        wgpu_capabilities,
        gl_capabilities,
        input_source,
        native_window,
        surface,
        _not_send: PhantomData,
    };
    host.open_initial_gamepads()?;
    return Ok(host);
}

/// Builds the plain options record consumed by [`create_sdl_host`].
pub fn create_sdl_host_options(
    title: &str,
    width: f64,
    height: f64,
    visible: bool,
    render_backend: SdlHostRenderBackend,
) -> SdlHostOptions {
    return SdlHostOptions {
        title: title.to_string(),
        width,
        height,
        visible,
        render_backend,
        gl_context_options: None,
    };
}

/// Returns an owned reference to the host's canonical window surface.
pub fn create_sdl_host_surface(host: &SdlHost) -> SurfaceRef {
    return host.surface.clone();
}

fn create_surface_capabilities(state: &Arc<ProviderState>) -> HostSurfaceCapabilities {
    let resize_state = state.clone();
    let display_state = state.clone();
    return HostSurfaceCapabilities {
        resize: Some(HostSurfaceResizeCapability {
            provider: state.provider.clone(),
            resize: Arc::new(move |surface, width, height| {
                if resize_state.is_our_surface(surface) {
                    resize_state.set_physical_size(width.max(0.0) as u32, height.max(0.0) as u32);
                }
            }),
        }),
        display: Some(HostSurfaceDisplayCapability {
            provider: state.provider.clone(),
            set_display_size: Arc::new(move |surface, width, height| {
                if display_state.is_our_surface(surface) {
                    display_state.enqueue(SdlWindowCommand::SetSize(
                        width.max(1.0) as u32,
                        height.max(1.0) as u32,
                    ));
                }
            }),
        }),
    };
}

fn create_wgpu_capabilities(state: &Arc<ProviderState>) -> HostWgpuCapabilities {
    let Some(gpu) = &state.gpu else {
        return HostWgpuCapabilities::default();
    };
    let create_state = state.clone();
    let acquire_state = state.clone();
    let attach_state = state.clone();
    let support_state = state.clone();
    let device = gpu.device.clone();
    let context = gpu.context.clone();
    let format = gpu.format;
    return HostWgpuCapabilities {
        context: Some(HostWgpuCapability {
            provider: state.provider.clone(),
            create: Arc::new(move |_window, width, height| {
                if !create_state.alive.load(Ordering::Acquire) {
                    return None;
                }
                create_state.set_physical_size(width.max(0.0) as u32, height.max(0.0) as u32);
                Some(NativeSurfaceHandle {
                    provider: create_state.provider.clone(),
                    handle: create_state.source_handle.clone(),
                })
            }),
            acquire: Arc::new(move |surface, options: &WgpuHostAcquisitionOptions| {
                let result = if !acquire_state.alive.load(Ordering::Acquire)
                    || acquire_state
                        .gpu
                        .as_ref()
                        .and_then(|gpu| gpu.owner.upgrade())
                        .is_none()
                    || !acquire_state.is_our_surface(surface)
                    || options
                        .format
                        .as_ref()
                        .is_some_and(|requested| get_wgpu_texture_format(requested) != Some(format))
                {
                    Err(flight_entity::FlightError {
                        kind: flight_entity::FlightErrorKind::NotSupportedError,
                        message: "the surface, format, or live backend does not belong to this SDL wgpu host".to_string(),
                    })
                } else {
                    let mut acquisition = create_wgpu_host_acquisition();
                    acquisition.context = context.clone();
                    acquisition.device = device.clone();
                    acquisition.format = get_wgpu_texture_format_name(format).to_string();
                    acquisition.ownership = WgpuHostAcquisitionOwnership::Flight;
                    acquisition.surface = live_presentation_surface(acquire_state.clone());
                    Ok(acquisition)
                };
                let future: WgpuProviderFuture<WgpuHostAcquisition> =
                    Box::pin(async move { result });
                future
            }),
            attach_surface: Arc::new(move |surface, attachment: &WgpuSurfaceAttachment| {
                let gpu = attach_state.gpu.as_ref()?;
                if !attach_state.alive.load(Ordering::Acquire)
                    || gpu.owner.upgrade().is_none()
                    || !attach_state.is_our_surface(surface)
                    || !Arc::ptr_eq(&attachment.device.provider, &attach_state.provider)
                    || !Arc::ptr_eq(&attachment.device.handle, &gpu.device.handle)
                    || get_wgpu_texture_format(&attachment.format) != Some(gpu.format)
                {
                    return None;
                }
                Some(WgpuSurfaceAttachResult {
                    context: gpu.context.clone(),
                    surface: live_presentation_surface(attach_state.clone()),
                })
            }),
            is_supported: Arc::new(move || {
                support_state.alive.load(Ordering::Acquire)
                    && support_state
                        .gpu
                        .as_ref()
                        .and_then(|gpu| gpu.owner.upgrade())
                        .is_some()
            }),
            release: Arc::new(|_acquisition| {}),
        }),
    };
}

fn create_window_capabilities(state: &Arc<ProviderState>) -> HostWindowCapabilities {
    let provider = state.provider.clone();
    let appearance_state = state.clone();
    let appearance = HostWindowAppearanceCapability {
        provider: provider.clone(),
        set_icon: None,
        set_opacity: None,
        set_title: Arc::new(move |_window, title| {
            appearance_state.enqueue(SdlWindowCommand::SetTitle(title.to_string()));
        }),
    };

    let focus_state = state.clone();
    let focus = HostWindowFocusCapability {
        provider: provider.clone(),
        focus: Arc::new(move |_window| focus_state.enqueue(SdlWindowCommand::Focus)),
    };

    let fullscreen_state = state.clone();
    let fullscreen = HostWindowFullscreenCapability {
        provider: provider.clone(),
        set_fullscreen: Arc::new(move |_window, enabled| {
            fullscreen_state.enqueue(SdlWindowCommand::Fullscreen(enabled));
        }),
    };

    let bounds_state = state.clone();
    let center_state = state.clone();
    let position_state = state.clone();
    let size_state = state.clone();
    let geometry = HostWindowGeometryCapability {
        provider: provider.clone(),
        center: Some(Arc::new(move |_window| {
            center_state.enqueue(SdlWindowCommand::Center)
        })),
        get_bounds: Arc::new(move |out: &mut WindowBounds, _window| {
            out.x = bounds_state.window_x.load(Ordering::Acquire) as f32;
            out.y = bounds_state.window_y.load(Ordering::Acquire) as f32;
            out.width = bounds_state.logical_width() as f32;
            out.height = bounds_state.logical_height() as f32;
        }),
        set_position: Arc::new(move |_window, x, y| {
            position_state.enqueue(SdlWindowCommand::Position(x as i32, y as i32));
        }),
        set_size: Arc::new(move |_window, width, height| {
            size_state.enqueue(SdlWindowCommand::SetSize(
                width.max(1.0) as u32,
                height.max(1.0) as u32,
            ));
        }),
        subscribe_move: Some(Arc::new({
            let state = state.clone();
            move |callback: WindowMoveListener| {
                let (listener, release) = active_listener(callback);
                state.move_listeners.lock().unwrap().push(listener);
                release
            }
        })),
        subscribe_resize: Some(Arc::new({
            let state = state.clone();
            move |_target, callback: WindowResizeListener| {
                let (listener, release) = active_listener(callback);
                state.resize_listeners.lock().unwrap().push(listener);
                release
            }
        })),
    };

    let close_state = state.clone();
    let open_state = state.clone();
    let lifecycle = HostWindowLifecycleCapability {
        provider: provider.clone(),
        close: Arc::new(move |_window| close_state.enqueue(SdlWindowCommand::Close)),
        open: Arc::new(move |window, _options: &WindowOptions| {
            let window = window.read().unwrap();
            open_state.enqueue(SdlWindowCommand::Configure {
                title: window.title.clone(),
                width: window.width,
                height: window.height,
                resizable: window.resizable,
                fullscreen: window.fullscreen,
                minimized: window.minimized,
                maximized: window.maximized,
                visible: window.visible,
            });
            true
        }),
        subscribe_close: Some(Arc::new({
            let state = state.clone();
            move |request, close| {
                let subscription = Arc::new(CloseSubscription {
                    active: AtomicBool::new(true),
                    close,
                    request,
                });
                state
                    .close_listeners
                    .lock()
                    .unwrap()
                    .push(subscription.clone());
                Arc::new(move || subscription.active.store(false, Ordering::Release))
            }
        })),
    };

    let maximum_state = state.clone();
    let minimum_state = state.clone();
    let resizable_state = state.clone();
    let size_constraints = HostWindowSizeConstraintsCapability {
        provider: provider.clone(),
        set_maximum_size: Arc::new(move |_window, width, height| {
            maximum_state.enqueue(SdlWindowCommand::SetMaximumSize(
                width.max(1.0) as u32,
                height.max(1.0) as u32,
            ));
        }),
        set_minimum_size: Arc::new(move |_window, width, height| {
            minimum_state.enqueue(SdlWindowCommand::SetMinimumSize(
                width.max(1.0) as u32,
                height.max(1.0) as u32,
            ));
        }),
        set_resizable: Some(Arc::new(move |_window, value| {
            resizable_state.enqueue(SdlWindowCommand::SetResizable(value));
        })),
    };

    let maximize_state = state.clone();
    let minimize_state = state.clone();
    let restore_state = state.clone();
    let window_state = HostWindowStateCapability {
        provider: provider.clone(),
        maximize: Arc::new(move |_window| maximize_state.enqueue(SdlWindowCommand::Maximize)),
        minimize: Arc::new(move |_window| minimize_state.enqueue(SdlWindowCommand::Minimize)),
        restore: Arc::new(move |_window| restore_state.enqueue(SdlWindowCommand::Restore)),
    };

    let hide_state = state.clone();
    let show_state = state.clone();
    let visibility = HostWindowVisibilityCapability {
        provider: provider.clone(),
        hide: Arc::new(move |_window| hide_state.enqueue(SdlWindowCommand::Hide)),
        show: Arc::new(move |_window| show_state.enqueue(SdlWindowCommand::Show)),
        subscribe_visibility: None,
    };

    let z_state = state.clone();
    let z_order = HostWindowZOrderCapability {
        provider,
        set_always_on_top: Arc::new(move |_window, enabled| {
            z_state.enqueue(SdlWindowCommand::AlwaysOnTop(enabled));
        }),
    };

    return HostWindowCapabilities {
        appearance: Some(appearance),
        focus: Some(focus),
        fullscreen: Some(fullscreen),
        geometry: Some(geometry),
        lifecycle: Some(lifecycle),
        size_constraints: Some(size_constraints),
        state: Some(window_state),
        visibility: Some(visibility),
        z_order: Some(z_order),
        ..HostWindowCapabilities::default()
    };
}

fn active_listener<T: ?Sized + Send + Sync + 'static>(
    callback: Arc<T>,
) -> (Arc<Listener<T>>, AppUnsubscribe) {
    let listener = Arc::new(Listener {
        active: AtomicBool::new(true),
        callback,
    });
    let release_listener = listener.clone();
    let release: AppUnsubscribe = Arc::new(move || {
        release_listener.active.store(false, Ordering::Release);
    });
    return (listener, release);
}

fn attach_input(state: Arc<ProviderState>, kind: InputAttachmentKind) -> InputIngressAttach {
    return Arc::new(move |source, sink, _options| {
        if !state.is_our_source(source) {
            return Arc::new(|| {});
        }
        let attachment = Arc::new(InputAttachment {
            active: AtomicBool::new(true),
            sink: sink.clone(),
        });
        let start_text_input = {
            let mut input = state.input.lock().unwrap();
            let start = kind == InputAttachmentKind::Text && !input.has_active(kind);
            input.list_mut(kind).push(attachment.clone());
            start
        };
        if start_text_input {
            state.enqueue(SdlWindowCommand::TextInput(true));
        }
        if kind == InputAttachmentKind::Gamepad && (sink.is_enabled)() {
            for data in state.gamepads.lock().unwrap().values() {
                (sink.gamepad_connect)(data);
            }
        }
        let release_state = state.clone();
        return Arc::new(move || {
            if !attachment.active.swap(false, Ordering::AcqRel) {
                return;
            }
            if kind == InputAttachmentKind::Text
                && !release_state.input.lock().unwrap().has_active(kind)
            {
                release_state.enqueue(SdlWindowCommand::TextInput(false));
            }
        });
    });
}

fn configure_gl_attributes(
    video: &VideoSubsystem,
    options: Option<&GlContextOptions>,
    request_srgb: bool,
) {
    let attributes = options.and_then(|options| options.context_attributes.as_ref());
    let antialias = options
        .and_then(|options| options.antialias)
        .or_else(|| attributes.and_then(|attributes| attributes.antialias))
        .unwrap_or(false);
    let alpha = attributes
        .and_then(|attributes| attributes.alpha)
        .unwrap_or(false);
    let depth = attributes
        .and_then(|attributes| attributes.depth)
        .unwrap_or(true);
    let stencil = attributes
        .and_then(|attributes| attributes.stencil)
        .unwrap_or(false);
    let accelerated = attributes
        .and_then(|attributes| attributes.fail_if_major_performance_caveat)
        .unwrap_or(false);
    let gl = video.gl_attr();
    gl.reset();
    gl.set_context_profile(GLProfile::Core);
    #[cfg(target_os = "macos")]
    {
        gl.set_context_version(4, 1);
        gl.set_context_flags().forward_compatible().set();
    }
    #[cfg(not(target_os = "macos"))]
    gl.set_context_version(3, 3);
    gl.set_red_size(8);
    gl.set_green_size(8);
    gl.set_blue_size(8);
    gl.set_alpha_size(if alpha { 8 } else { 0 });
    gl.set_depth_size(if depth { 24 } else { 0 });
    gl.set_stencil_size(if stencil { 8 } else { 0 });
    gl.set_double_buffer(true);
    gl.set_framebuffer_srgb_compatible(request_srgb);
    if accelerated {
        gl.set_accelerated_visual(true);
    }
    gl.set_multisample_buffers(u8::from(antialias));
    gl.set_multisample_samples(if antialias { 4 } else { 0 });
}

/// Ends the host's lifetime on the creator thread.
pub fn destroy_sdl_host(mut host: SdlHost) -> Result<(), SdlHostFailure> {
    require_creator_thread(&host)?;
    host.shutdown();
    drop(host);
    return Ok(());
}

fn display_to_screen(display: &Display, primary: bool, index: usize) -> Option<ScreenInfo> {
    let bounds = display.get_bounds().ok()?;
    let work = display.get_usable_bounds().unwrap_or(bounds);
    let scale = f64::from(display.get_content_scale().unwrap_or(1.0).max(f32::EPSILON));
    let mut screen = create_screen_info();
    screen.id = index as f64 + 1.0;
    screen.x = f64::from(bounds.x()) / scale;
    screen.y = f64::from(bounds.y()) / scale;
    screen.width = f64::from(bounds.width()) / scale;
    screen.height = f64::from(bounds.height()) / scale;
    screen.work_width = f64::from(work.width()) / scale;
    screen.work_height = f64::from(work.height()) / scale;
    screen.scale_factor = scale;
    screen.is_primary = primary;
    screen.physical_width = f64::from(bounds.width());
    screen.physical_height = f64::from(bounds.height());
    screen.label = display.get_name().unwrap_or_default();
    return Some(screen);
}

/// Produces a stable creation/run diagnostic without ambient SDL last-error state.
pub fn explain_sdl_host_failure(failure: &SdlHostFailure) -> String {
    let stage = match failure.kind {
        SdlHostFailureKind::Adapter => "GPU adapter selection",
        SdlHostFailureKind::Device => "GPU device creation",
        SdlHostFailureKind::EventPump => "SDL event-pump creation",
        SdlHostFailureKind::Gamepad => "SDL gamepad initialization",
        SdlHostFailureKind::GlContext => "SDL OpenGL context",
        SdlHostFailureKind::RawHandle => "SDL raw-window-handle extraction",
        SdlHostFailureKind::RunLoop => "SDL blocking run loop",
        SdlHostFailureKind::Sdl => "SDL process initialization",
        SdlHostFailureKind::Surface => "wgpu presentation-surface creation",
        SdlHostFailureKind::Thread => "host thread contract",
        SdlHostFailureKind::Video => "SDL video initialization",
        SdlHostFailureKind::Window => "SDL native window creation",
    };
    return format!("flight-host-sdl {stage} failed: {}", failure.message);
}

/// Explains whether the SDL polling loop remains live.
pub fn explain_sdl_pump_status(status: SdlPumpStatus) -> &'static str {
    return match status {
        SdlPumpStatus::Continue => "the SDL host is alive",
        SdlPumpStatus::Exit(_) => "the SDL host event loop exited",
    };
}

fn failure(kind: SdlHostFailureKind, message: impl ToString) -> SdlHostFailure {
    return SdlHostFailure {
        kind,
        message: message.to_string(),
    };
}

/// Borrows the frame scheduling capability.
pub fn get_sdl_host_app_loop_capability(host: &SdlHost) -> &HostAppLoopCapability {
    return &host.app_loop_capability;
}

/// Borrows the aggregate GL capability group.
pub fn get_sdl_host_gl_capabilities(host: &SdlHost) -> &HostGlCapabilities {
    return &host.gl_capabilities;
}

/// Borrows the selected GL context capability, when this is a GL host.
pub fn get_sdl_host_gl_capability(host: &SdlHost) -> Option<&HostGlCapability> {
    return host.gl_capabilities.context.as_ref();
}

/// Borrows keyboard, pointer, wheel, text, touch, and gamepad ingress.
pub fn get_sdl_host_input_ingress_capability(host: &SdlHost) -> &HostInputIngressCapability {
    return &host.input_ingress_capability;
}

/// Borrows the host-owned input source used with SDK attach functions.
pub fn get_sdl_host_input_source(host: &SdlHost) -> &InputIngressSource {
    return &host.input_source;
}

/// Borrows the application lifecycle capability.
pub fn get_sdl_host_lifecycle_capability(host: &SdlHost) -> &HostLifecycleCapability {
    return &host.lifecycle_capability;
}

/// Borrows the opaque native window identity.
pub fn get_sdl_host_native_window(host: &SdlHost) -> &NativeWindowHandle {
    return &host.native_window;
}

/// Borrows the monitor/screen capability group.
pub fn get_sdl_host_screen_capabilities(host: &SdlHost) -> &HostScreenCapabilities {
    return &host.screen_capabilities;
}

/// Borrows the filled monitor and cursor query capability.
pub fn get_sdl_host_screen_query_capability(host: &SdlHost) -> Option<&HostScreenQueryCapability> {
    return host.screen_capabilities.query.as_ref();
}

/// Borrows logical/backing surface resize capabilities.
pub fn get_sdl_host_surface_capabilities(host: &SdlHost) -> &HostSurfaceCapabilities {
    return &host.surface_capabilities;
}

/// Borrows the filled logical display-size capability.
pub fn get_sdl_host_surface_display_capability(
    host: &SdlHost,
) -> Option<&HostSurfaceDisplayCapability> {
    return host.surface_capabilities.display.as_ref();
}

/// Borrows the filled backing-size reconfiguration capability.
pub fn get_sdl_host_surface_resize_capability(
    host: &SdlHost,
) -> Option<&HostSurfaceResizeCapability> {
    return host.surface_capabilities.resize.as_ref();
}

/// Borrows the aggregate wgpu capability group.
pub fn get_sdl_host_wgpu_capabilities(host: &SdlHost) -> &HostWgpuCapabilities {
    return &host.wgpu_capabilities;
}

/// Borrows the selected wgpu capability, when this is a wgpu host.
pub fn get_sdl_host_wgpu_capability(host: &SdlHost) -> Option<&HostWgpuCapability> {
    return host.wgpu_capabilities.context.as_ref();
}

/// Borrows the host-owned wgpu device, when this is a wgpu host.
pub fn get_sdl_host_wgpu_device(host: &SdlHost) -> Option<&WgpuDevice> {
    return host.state.gpu.as_ref().map(|gpu| &gpu.device);
}

/// Borrows the filled window appearance capability.
pub fn get_sdl_host_window_appearance_capability(
    host: &SdlHost,
) -> Option<&HostWindowAppearanceCapability> {
    return host.window_capabilities.appearance.as_ref();
}

/// Borrows the filled window capability group.
pub fn get_sdl_host_window_capabilities(host: &SdlHost) -> &HostWindowCapabilities {
    return &host.window_capabilities;
}

/// Borrows the filled window focus capability.
pub fn get_sdl_host_window_focus_capability(host: &SdlHost) -> Option<&HostWindowFocusCapability> {
    return host.window_capabilities.focus.as_ref();
}

/// Borrows the filled window fullscreen capability.
pub fn get_sdl_host_window_fullscreen_capability(
    host: &SdlHost,
) -> Option<&HostWindowFullscreenCapability> {
    return host.window_capabilities.fullscreen.as_ref();
}

/// Borrows the filled window geometry capability.
pub fn get_sdl_host_window_geometry_capability(
    host: &SdlHost,
) -> Option<&HostWindowGeometryCapability> {
    return host.window_capabilities.geometry.as_ref();
}

/// Borrows the filled window lifecycle capability.
pub fn get_sdl_host_window_lifecycle_capability(
    host: &SdlHost,
) -> Option<&HostWindowLifecycleCapability> {
    return host.window_capabilities.lifecycle.as_ref();
}

/// Borrows the filled window size-constraints capability.
pub fn get_sdl_host_window_size_constraints_capability(
    host: &SdlHost,
) -> Option<&HostWindowSizeConstraintsCapability> {
    return host.window_capabilities.size_constraints.as_ref();
}

/// Borrows the filled window state capability.
pub fn get_sdl_host_window_state_capability(host: &SdlHost) -> Option<&HostWindowStateCapability> {
    return host.window_capabilities.state.as_ref();
}

/// Borrows the filled window visibility capability.
pub fn get_sdl_host_window_visibility_capability(
    host: &SdlHost,
) -> Option<&HostWindowVisibilityCapability> {
    return host.window_capabilities.visibility.as_ref();
}

/// Borrows the filled window z-order capability.
pub fn get_sdl_host_window_z_order_capability(
    host: &SdlHost,
) -> Option<&HostWindowZOrderCapability> {
    return host.window_capabilities.z_order.as_ref();
}

fn live_presentation_surface(state: Arc<ProviderState>) -> WgpuPresentationSurface {
    let width_state = state.clone();
    return WgpuPresentationSurface {
        width: Arc::new(move || width_state.physical_width.load(Ordering::Acquire) as f32),
        height: Arc::new(move || state.physical_height.load(Ordering::Acquire) as f32),
    };
}

/// Makes the selected SDL OpenGL context current on the creator thread.
pub fn make_sdl_host_gl_context_current(host: &SdlHost) -> Result<(), SdlHostFailure> {
    require_creator_thread(host)?;
    if host.state.backend != SdlHostRenderBackend::Gl {
        return Err(failure(
            SdlHostFailureKind::GlContext,
            "this SDL host selected the wgpu backend",
        ));
    }
    let window = host.native.window.as_ref().ok_or_else(|| {
        failure(
            SdlHostFailureKind::GlContext,
            "the SDL window is no longer live",
        )
    })?;
    let context = host.native.gl_context.as_ref().ok_or_else(|| {
        failure(
            SdlHostFailureKind::GlContext,
            "the SDL GL context is no longer live",
        )
    })?;
    window
        .gl_make_current(context)
        .map_err(|error| failure(SdlHostFailureKind::GlContext, error))?;
    return Ok(());
}

fn mouse_state_to_mask(state: &MouseState) -> u32 {
    return u32::from(state.left())
        | (u32::from(state.right()) << 1)
        | (u32::from(state.middle()) << 2)
        | (u32::from(state.x1()) << 3)
        | (u32::from(state.x2()) << 4);
}

/// Swaps the GL window buffers on the creator thread.
pub fn present_sdl_host_gl(host: &SdlHost) -> Result<(), SdlHostFailure> {
    require_creator_thread(host)?;
    if host.state.backend != SdlHostRenderBackend::Gl {
        return Err(failure(
            SdlHostFailureKind::GlContext,
            "this SDL host selected the wgpu backend",
        ));
    }
    host.native
        .window
        .as_ref()
        .ok_or_else(|| {
            failure(
                SdlHostFailureKind::GlContext,
                "the SDL window is no longer live",
            )
        })?
        .gl_swap_window();
    return Ok(());
}

/// Polls pending SDL commands and events without taking over the caller's loop.
pub fn pump_sdl_host(host: &mut SdlHost) -> Result<SdlPumpStatus, SdlHostFailure> {
    require_creator_thread(host)?;
    if !host.state.alive.load(Ordering::Acquire) {
        return Ok(SdlPumpStatus::Exit(
            host.state.exit_code.load(Ordering::Acquire),
        ));
    }
    host.drain_commands();
    let events: Vec<Event> = host
        .native
        .event_pump
        .as_mut()
        .ok_or_else(|| {
            failure(
                SdlHostFailureKind::EventPump,
                "the SDL event pump is no longer live",
            )
        })?
        .poll_iter()
        .collect();
    for event in events {
        host.dispatch_event(event)?;
    }
    host.state.fire_scheduled_frames();
    return Ok(if host.state.alive.load(Ordering::Acquire) {
        SdlPumpStatus::Continue
    } else {
        SdlPumpStatus::Exit(host.state.exit_code.load(Ordering::Acquire))
    });
}

fn require_creator_thread(host: &SdlHost) -> Result<(), SdlHostFailure> {
    if host.created_thread != std::thread::current().id() {
        return Err(failure(
            SdlHostFailureKind::Thread,
            "create, pump, run, destroy, make-current, and present must execute on the creating thread",
        ));
    }
    return Ok(());
}

/// Runs SDL's polling loop until `frame` returns false or the host exits.
pub fn run_sdl_host(
    host: &mut SdlHost,
    mut frame: impl FnMut(f64) -> bool,
) -> Result<(), SdlHostFailure> {
    require_creator_thread(host)?;
    loop {
        if matches!(pump_sdl_host(host)?, SdlPumpStatus::Exit(_)) {
            return Ok(());
        }
        if !frame(host.state.now()) {
            host.state.alive.store(false, Ordering::Release);
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(1));
    }
}

fn screens_from_video(video: &VideoSubsystem) -> Vec<ScreenInfo> {
    let primary = video.get_primary_display().ok();
    return video
        .displays()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter_map(|(index, display)| {
            display_to_screen(&display, primary.as_ref() == Some(&display), index)
        })
        .collect();
}

fn sdl_gl_get_proc_address(name: &str) -> *const c_void {
    let Ok(name) = CString::new(name) else {
        return std::ptr::null();
    };
    let pointer = unsafe { sdl3::sys::video::SDL_GL_GetProcAddress(name.as_ptr()) };
    return pointer.map_or(std::ptr::null(), |function| {
        function as *const () as *const c_void
    });
}

impl Default for SdlHostOptions {
    fn default() -> Self {
        return Self {
            title: "Flight".to_string(),
            width: 800.0,
            height: 600.0,
            visible: true,
            render_backend: SdlHostRenderBackend::Wgpu,
            gl_context_options: None,
        };
    }
}

impl fmt::Display for SdlHostFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&explain_sdl_host_failure(self));
    }
}

impl std::error::Error for SdlHostFailure {}

impl InputAttachments {
    fn has_active(&self, kind: InputAttachmentKind) -> bool {
        return self
            .list(kind)
            .iter()
            .any(|attachment| attachment.active.load(Ordering::Acquire));
    }

    fn list(&self, kind: InputAttachmentKind) -> Vec<Arc<InputAttachment>> {
        return match kind {
            InputAttachmentKind::Gamepad => self.gamepad.clone(),
            InputAttachmentKind::Keyboard => self.keyboard.clone(),
            InputAttachmentKind::Pointer => self.pointer.clone(),
            InputAttachmentKind::RelativePointer => self.relative_pointer.clone(),
            InputAttachmentKind::Text => self.text.clone(),
            InputAttachmentKind::Wheel => self.wheel.clone(),
        };
    }

    fn list_mut(&mut self, kind: InputAttachmentKind) -> &mut Vec<Arc<InputAttachment>> {
        return match kind {
            InputAttachmentKind::Gamepad => &mut self.gamepad,
            InputAttachmentKind::Keyboard => &mut self.keyboard,
            InputAttachmentKind::Pointer => &mut self.pointer,
            InputAttachmentKind::RelativePointer => &mut self.relative_pointer,
            InputAttachmentKind::Text => &mut self.text,
            InputAttachmentKind::Wheel => &mut self.wheel,
        };
    }
}

impl WgpuCanvasContext for SdlWgpuCanvasContext {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        if !self.alive.load(Ordering::Acquire) {
            return;
        }
        if let Some(owner) = self.owner.upgrade() {
            configure_wgpu_native_surface(&owner.surface, configuration);
        }
    }

    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
        if !self.alive.load(Ordering::Acquire) {
            return Err(WgpuCanvasFrameError::Lost);
        }
        let owner = self.owner.upgrade().ok_or(WgpuCanvasFrameError::Lost)?;
        return acquire_wgpu_native_surface_frame(&owner.surface);
    }

    fn present(&self, device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
        if self.alive.load(Ordering::Acquire) && self.owner.upgrade().is_some() {
            present_wgpu_native_surface_frame(device, frame);
        }
    }

    fn unconfigure(&self) {}
}

impl ProviderState {
    fn enqueue(&self, command: SdlWindowCommand) {
        if self.alive.load(Ordering::Acquire) {
            self.commands.lock().unwrap().push(command);
        }
    }

    fn fire_scheduled_frames(&self) {
        let callbacks = {
            let mut callbacks = self.frame_callbacks.lock().unwrap();
            std::mem::take(&mut *callbacks)
        };
        let now = self.now();
        for callback in callbacks.into_values() {
            callback(now);
        }
    }

    fn input_sinks(&self, kind: InputAttachmentKind) -> Vec<InputIngressSink> {
        return self
            .input
            .lock()
            .unwrap()
            .list(kind)
            .into_iter()
            .filter(|attachment| attachment.active.load(Ordering::Acquire))
            .map(|attachment| attachment.sink.clone())
            .filter(|sink| (sink.is_enabled)())
            .collect();
    }

    fn is_our_source(&self, source: &InputIngressSource) -> bool {
        return Arc::ptr_eq(&self.provider, &source.provider)
            && Arc::ptr_eq(&self.source_handle, &source.handle);
    }

    fn is_our_surface(&self, surface: &SurfaceRef) -> bool {
        let borrowed = surface.read().unwrap();
        let Some(handle) = get_surface_handle(&*borrowed) else {
            return false;
        };
        return Arc::ptr_eq(&self.provider, &handle.provider)
            && Arc::ptr_eq(&self.source_handle, &handle.handle);
    }

    fn lifecycle(&self) -> AppLifecycleState {
        return match self.lifecycle.load(Ordering::Acquire) {
            value if value == AppLifecycleState::Active as u32 => AppLifecycleState::Active,
            value if value == AppLifecycleState::Inactive as u32 => AppLifecycleState::Inactive,
            _ => AppLifecycleState::Background,
        };
    }

    fn logical_height(&self) -> u32 {
        return self.logical_height.load(Ordering::Acquire);
    }

    fn logical_width(&self) -> u32 {
        return self.logical_width.load(Ordering::Acquire);
    }

    fn matches_gl_options(&self, options: Option<&GlContextOptions>) -> bool {
        return options == self.gl_options.as_ref();
    }

    fn now(&self) -> f64 {
        return self.start.elapsed().as_secs_f64() * 1_000.0;
    }

    fn set_lifecycle(&self, state: AppLifecycleState) {
        let encoded = state as u32;
        if self.lifecycle.swap(encoded, Ordering::AcqRel) == encoded {
            return;
        }
        for listener in self.lifecycle_listeners.lock().unwrap().clone() {
            if listener.active.load(Ordering::Acquire) {
                (listener.callback)();
            }
        }
    }

    fn set_physical_size(&self, width: u32, height: u32) {
        self.physical_width.store(width, Ordering::Release);
        self.physical_height.store(height, Ordering::Release);
        if self.backend == SdlHostRenderBackend::Wgpu {
            self.enqueue(SdlWindowCommand::ReconfigureWgpu(width, height));
        }
    }

    fn shutdown(&self) {
        if !self.alive.swap(false, Ordering::AcqRel) {
            return;
        }
        self.frame_callbacks.lock().unwrap().clear();
        *self.input.lock().unwrap() = InputAttachments::default();
        self.commands.lock().unwrap().clear();
        for subscription in self.gl_subscriptions.lock().unwrap().clone() {
            if subscription.active.swap(false, Ordering::AcqRel) {
                (subscription.lost)();
            }
        }
    }
}

impl SdlNativeState {
    fn reconfigure_wgpu(&mut self, width: u32, height: u32) {
        let Some(gpu) = &self.gpu else {
            return;
        };
        if width == 0 || height == 0 {
            return;
        }
        let mut configuration = gpu.shared.configuration.lock().unwrap();
        configuration.width = width;
        configuration.height = height;
        gpu.owner
            .surface
            .configure(&gpu.shared.native.device, &configuration);
    }

    fn shutdown(&mut self) {
        // The unsafe wgpu surface is released before the raw SDL window handles it references.
        self.gpu.take();
        if self.gl_context.is_some() {
            if let Some(video) = &self.video {
                let _ = video.gl_release_current_context();
            }
            self.gl_context.take();
        }
        self.gamepads.clear();
        self.event_pump.take();
        if let (Some(video), Some(window)) = (&self.video, &self.window) {
            let text_input = video.text_input();
            if text_input.is_active(window) {
                text_input.stop(window);
            }
        }
        self.window.take();
        self.gamepad.take();
        self.video.take();
        self.sdl.take();
        if self.process_slot {
            self.process_slot = false;
            SDL_HOST_LIVE.store(false, Ordering::Release);
        }
    }
}

impl Drop for SdlNativeState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl SdlHost {
    fn apply_command(&mut self, command: SdlWindowCommand) {
        match command {
            SdlWindowCommand::ReconfigureWgpu(width, height) => {
                self.native.reconfigure_wgpu(width, height);
                return;
            }
            SdlWindowCommand::Close => {
                self.state.alive.store(false, Ordering::Release);
                if let Some(window) = &mut self.native.window {
                    window.hide();
                }
                return;
            }
            SdlWindowCommand::TextInput(enabled) => {
                if let (Some(video), Some(window)) = (&self.native.video, &self.native.window) {
                    let text_input = video.text_input();
                    if enabled && !text_input.is_active(window) {
                        text_input.start(window);
                    } else if !enabled && text_input.is_active(window) {
                        text_input.stop(window);
                    }
                }
                return;
            }
            _ => {}
        }
        let Some(window) = &mut self.native.window else {
            return;
        };
        match command {
            SdlWindowCommand::AlwaysOnTop(enabled) => unsafe {
                sdl3::sys::video::SDL_SetWindowAlwaysOnTop(window.raw(), enabled);
            },
            SdlWindowCommand::Center => {
                window.set_position(WindowPos::Centered, WindowPos::Centered);
            }
            SdlWindowCommand::Configure {
                title,
                width,
                height,
                resizable,
                fullscreen,
                minimized,
                maximized,
                visible,
            } => {
                let _ = window.set_title(&title);
                let _ = window.set_size(width.max(1.0) as u32, height.max(1.0) as u32);
                unsafe {
                    sdl3::sys::video::SDL_SetWindowResizable(window.raw(), resizable);
                }
                let _ = window.set_fullscreen(fullscreen);
                if minimized {
                    window.minimize();
                } else if maximized {
                    window.maximize();
                } else {
                    window.restore();
                }
                if visible {
                    window.show();
                } else {
                    window.hide();
                }
            }
            SdlWindowCommand::Focus => {
                window.raise();
            }
            SdlWindowCommand::Fullscreen(enabled) => {
                let _ = window.set_fullscreen(enabled);
            }
            SdlWindowCommand::Hide => {
                window.hide();
            }
            SdlWindowCommand::Maximize => {
                window.maximize();
            }
            SdlWindowCommand::Minimize => {
                window.minimize();
            }
            SdlWindowCommand::Position(x, y) => {
                window.set_position(WindowPos::Positioned(x), WindowPos::Positioned(y));
            }
            SdlWindowCommand::Restore => {
                window.restore();
            }
            SdlWindowCommand::SetMaximumSize(width, height) => {
                let _ = window.set_maximum_size(width, height);
            }
            SdlWindowCommand::SetMinimumSize(width, height) => {
                let _ = window.set_minimum_size(width, height);
            }
            SdlWindowCommand::SetResizable(enabled) => unsafe {
                sdl3::sys::video::SDL_SetWindowResizable(window.raw(), enabled);
            },
            SdlWindowCommand::SetSize(width, height) => {
                let _ = window.set_size(width, height);
            }
            SdlWindowCommand::SetTitle(title) => {
                let _ = window.set_title(&title);
            }
            SdlWindowCommand::Show => {
                window.show();
            }
            SdlWindowCommand::Close
            | SdlWindowCommand::ReconfigureWgpu(_, _)
            | SdlWindowCommand::TextInput(_) => {}
        }
        self.refresh_window_snapshot();
    }

    fn dispatch_close_request(&self) {
        let listeners = self.state.close_listeners.lock().unwrap().clone();
        let vetoed = listeners
            .iter()
            .any(|listener| listener.active.load(Ordering::Acquire) && (listener.request)());
        if vetoed {
            return;
        }
        self.state.alive.store(false, Ordering::Release);
        for listener in listeners {
            if listener.active.load(Ordering::Acquire) {
                (listener.close)();
            }
        }
    }

    fn dispatch_event(&mut self, event: Event) -> Result<(), SdlHostFailure> {
        match event {
            Event::Quit { .. } | Event::AppTerminating { .. } => {
                self.state.alive.store(false, Ordering::Release);
            }
            Event::AppWillEnterBackground { .. } | Event::AppDidEnterBackground { .. } => {
                self.state.set_lifecycle(AppLifecycleState::Background);
            }
            Event::AppWillEnterForeground { .. } | Event::AppDidEnterForeground { .. } => {
                self.state.set_lifecycle(AppLifecycleState::Active);
            }
            Event::Window {
                window_id,
                win_event,
                ..
            } if self.is_our_window(window_id) => self.dispatch_window_event(win_event),
            Event::KeyDown {
                timestamp,
                window_id,
                keycode,
                scancode,
                keymod,
                repeat,
                ..
            } if self.is_our_window(window_id) => {
                *self.state.modifiers.lock().unwrap() = keymod;
                let data = build_sdl_keyboard_data(keycode, scancode, keymod, repeat, timestamp);
                for sink in self.state.input_sinks(InputAttachmentKind::Keyboard) {
                    (sink.key_down)(&data);
                }
            }
            Event::KeyUp {
                timestamp,
                window_id,
                keycode,
                scancode,
                keymod,
                repeat,
                ..
            } if self.is_our_window(window_id) => {
                *self.state.modifiers.lock().unwrap() = keymod;
                let data = build_sdl_keyboard_data(keycode, scancode, keymod, repeat, timestamp);
                for sink in self.state.input_sinks(InputAttachmentKind::Keyboard) {
                    (sink.key_up)(&data);
                }
            }
            Event::TextInput {
                window_id, text, ..
            } if self.is_our_window(window_id) => {
                let data = build_sdl_text_data(&text, false);
                for sink in self.state.input_sinks(InputAttachmentKind::Text) {
                    (sink.text_input)(&data);
                }
            }
            Event::TextEditing {
                window_id, text, ..
            } if self.is_our_window(window_id) => {
                let data = build_sdl_text_data(&text, true);
                for sink in self.state.input_sinks(InputAttachmentKind::Text) {
                    (sink.text_edit)(&data);
                }
            }
            Event::MouseMotion {
                timestamp,
                window_id,
                mousestate,
                x,
                y,
                xrel,
                yrel,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_mouse_motion(timestamp, &mousestate, x, y, xrel, yrel);
            }
            Event::MouseButtonDown {
                timestamp,
                window_id,
                mouse_btn,
                x,
                y,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_mouse_button(timestamp, mouse_btn, x, y, true);
            }
            Event::MouseButtonUp {
                timestamp,
                window_id,
                mouse_btn,
                x,
                y,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_mouse_button(timestamp, mouse_btn, x, y, false);
            }
            Event::MouseWheel {
                timestamp,
                window_id,
                x,
                y,
                direction,
                mouse_x,
                mouse_y,
                ..
            } if self.is_our_window(window_id) => {
                let data = build_sdl_wheel_data(
                    mouse_x,
                    mouse_y,
                    x,
                    y,
                    direction,
                    self.state.pointer_buttons.load(Ordering::Acquire),
                    *self.state.modifiers.lock().unwrap(),
                    timestamp,
                );
                for sink in self.state.input_sinks(InputAttachmentKind::Wheel) {
                    (sink.wheel)(&data);
                }
            }
            Event::FingerDown {
                timestamp,
                finger_id,
                x,
                y,
                dx,
                dy,
                pressure,
                window_id,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_touch(
                    timestamp,
                    finger_id,
                    x,
                    y,
                    dx,
                    dy,
                    pressure,
                    TouchPhase::Down,
                );
            }
            Event::FingerMotion {
                timestamp,
                finger_id,
                x,
                y,
                dx,
                dy,
                pressure,
                window_id,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_touch(
                    timestamp,
                    finger_id,
                    x,
                    y,
                    dx,
                    dy,
                    pressure,
                    TouchPhase::Move,
                );
            }
            Event::FingerUp {
                timestamp,
                finger_id,
                x,
                y,
                dx,
                dy,
                pressure,
                window_id,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_touch(timestamp, finger_id, x, y, dx, dy, pressure, TouchPhase::Up);
            }
            Event::FingerCanceled {
                timestamp,
                finger_id,
                x,
                y,
                dx,
                dy,
                pressure,
                window_id,
                ..
            } if self.is_our_window(window_id) => {
                self.dispatch_touch(
                    timestamp,
                    finger_id,
                    x,
                    y,
                    dx,
                    dy,
                    pressure,
                    TouchPhase::Cancel,
                );
            }
            Event::GamepadAdded { which, .. } => self.open_gamepad(which)?,
            Event::GamepadRemoved { which, .. } => self.remove_gamepad(which),
            Event::GamepadAxisMotion {
                timestamp,
                which,
                axis,
                value,
            } => self.dispatch_gamepad_axis(timestamp, which, axis, value),
            Event::GamepadButtonDown {
                timestamp,
                which,
                button,
            } => self.dispatch_gamepad_button(timestamp, which, button, true),
            Event::GamepadButtonUp {
                timestamp,
                which,
                button,
            } => self.dispatch_gamepad_button(timestamp, which, button, false),
            _ => {}
        }
        return Ok(());
    }

    fn dispatch_gamepad_axis(
        &self,
        timestamp: u64,
        which: JoystickId,
        axis: sdl3::gamepad::Axis,
        value: i16,
    ) {
        let Some(gamepad) = get_sdl_gamepad_id(&self.native.gamepad_ids, which) else {
            return;
        };
        if let Some(data) = build_sdl_gamepad_axis_data(gamepad, axis, value, timestamp) {
            for sink in self.state.input_sinks(InputAttachmentKind::Gamepad) {
                (sink.gamepad_axis_move)(&data);
            }
        } else if let Some(data) = build_sdl_trigger_data(gamepad, axis, value, timestamp) {
            const TRIGGER_PRESS_THRESHOLD: f32 = 0.5;
            let pressed = data.value >= TRIGGER_PRESS_THRESHOLD;
            let key = (gamepad, data.button);
            let transitioned = {
                let mut trigger_buttons = self.state.trigger_buttons.lock().unwrap();
                let previous = trigger_buttons.get(&key).copied().unwrap_or(false);
                if previous == pressed {
                    false
                } else {
                    if pressed {
                        trigger_buttons.insert(key, true);
                    } else {
                        trigger_buttons.remove(&key);
                    }
                    true
                }
            };
            if !transitioned {
                return;
            }
            for sink in self.state.input_sinks(InputAttachmentKind::Gamepad) {
                if pressed {
                    (sink.gamepad_button_down)(&data);
                } else {
                    (sink.gamepad_button_up)(&data);
                }
            }
        }
    }

    fn dispatch_gamepad_button(
        &self,
        timestamp: u64,
        which: JoystickId,
        button: sdl3::gamepad::Button,
        pressed: bool,
    ) {
        let Some(gamepad) = get_sdl_gamepad_id(&self.native.gamepad_ids, which) else {
            return;
        };
        let Some(data) = build_sdl_gamepad_button_data(gamepad, button, pressed, timestamp) else {
            return;
        };
        for sink in self.state.input_sinks(InputAttachmentKind::Gamepad) {
            if pressed {
                (sink.gamepad_button_down)(&data);
            } else {
                (sink.gamepad_button_up)(&data);
            }
        }
    }

    fn dispatch_mouse_button(
        &self,
        timestamp: u64,
        mouse_button: MouseButton,
        x: f32,
        y: f32,
        pressed: bool,
    ) {
        let button = translate_sdl_mouse_button(mouse_button);
        let buttons = if pressed {
            self.state
                .pointer_buttons
                .fetch_or(button.mask, Ordering::AcqRel)
                | button.mask
        } else {
            self.state
                .pointer_buttons
                .fetch_and(!button.mask, Ordering::AcqRel)
                & !button.mask
        };
        *self.state.pointer_position.lock().unwrap() = (x, y);
        let mut data = build_sdl_pointer_data(
            x,
            y,
            0.0,
            0.0,
            buttons,
            *self.state.modifiers.lock().unwrap(),
            timestamp,
        );
        data.button = button.button;
        data.pressure = if pressed { 0.5 } else { 0.0 };
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            if pressed {
                (sink.pointer_down)(&data);
            } else {
                (sink.pointer_up)(&data);
            }
        }
    }

    fn dispatch_mouse_motion(
        &self,
        timestamp: u64,
        mouse_state: &MouseState,
        x: f32,
        y: f32,
        x_relative: f32,
        y_relative: f32,
    ) {
        let buttons = mouse_state_to_mask(mouse_state);
        self.state.pointer_buttons.store(buttons, Ordering::Release);
        *self.state.pointer_position.lock().unwrap() = (x, y);
        let data = build_sdl_pointer_data(
            x,
            y,
            x_relative,
            y_relative,
            buttons,
            *self.state.modifiers.lock().unwrap(),
            timestamp,
        );
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            (sink.pointer_move)(&data);
        }
        for sink in self.state.input_sinks(InputAttachmentKind::RelativePointer) {
            (sink.pointer_move_relative)(&data);
        }
    }

    fn dispatch_resize_listeners(&self) {
        let width = self.state.logical_width() as f32;
        let height = self.state.logical_height() as f32;
        let scale = f64::from(f32::from_bits(
            self.state.scale_factor.load(Ordering::Acquire),
        ));
        for listener in self.state.resize_listeners.lock().unwrap().clone() {
            if listener.active.load(Ordering::Acquire) {
                (listener.callback)(width, height, scale);
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn dispatch_touch(
        &self,
        timestamp: u64,
        finger: u64,
        x: f32,
        y: f32,
        delta_x: f32,
        delta_y: f32,
        pressure: f32,
        phase: TouchPhase,
    ) {
        let pointer_id = {
            let mut ids = self.state.touch_ids.lock().unwrap();
            if let Some(pointer_id) = ids.get(&finger) {
                *pointer_id
            } else {
                let used: BTreeSet<i32> = ids.values().copied().collect();
                let pointer_id = (1..).find(|id| !used.contains(id)).unwrap_or(i32::MAX);
                ids.insert(finger, pointer_id);
                pointer_id
            }
        };
        let is_primary = {
            let mut primary = self.state.primary_touch.lock().unwrap();
            if primary.is_none() {
                *primary = Some(finger);
            }
            *primary == Some(finger)
        };
        let active = matches!(phase, TouchPhase::Down | TouchPhase::Move);
        let data = build_sdl_touch_data(
            pointer_id,
            x,
            y,
            delta_x,
            delta_y,
            pressure,
            f64::from(self.state.logical_width()),
            f64::from(self.state.logical_height()),
            is_primary,
            active,
            *self.state.modifiers.lock().unwrap(),
            timestamp,
        );
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            match phase {
                TouchPhase::Down => (sink.pointer_down)(&data),
                TouchPhase::Move => (sink.pointer_move)(&data),
                TouchPhase::Up => (sink.pointer_up)(&data),
                TouchPhase::Cancel => (sink.pointer_cancel)(&data),
            }
        }
        if matches!(phase, TouchPhase::Up | TouchPhase::Cancel) {
            self.state.touch_ids.lock().unwrap().remove(&finger);
            let mut primary = self.state.primary_touch.lock().unwrap();
            if *primary == Some(finger) {
                *primary = self.state.touch_ids.lock().unwrap().keys().next().copied();
            }
        }
    }

    fn dispatch_window_event(&mut self, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => self.dispatch_close_request(),
            WindowEvent::FocusGained => self.state.set_lifecycle(AppLifecycleState::Active),
            WindowEvent::FocusLost => {
                self.state.set_lifecycle(AppLifecycleState::Inactive);
                self.release_pointer_buttons();
            }
            WindowEvent::Moved(x, y) => {
                self.state.window_x.store(x, Ordering::Release);
                self.state.window_y.store(y, Ordering::Release);
                for listener in self.state.move_listeners.lock().unwrap().clone() {
                    if listener.active.load(Ordering::Acquire) {
                        (listener.callback)(x as f32, y as f32);
                    }
                }
            }
            WindowEvent::Resized(width, height) => {
                self.state
                    .logical_width
                    .store(width.max(0) as u32, Ordering::Release);
                self.state
                    .logical_height
                    .store(height.max(0) as u32, Ordering::Release);
                self.dispatch_resize_listeners();
            }
            WindowEvent::PixelSizeChanged(width, height) => {
                let width = width.max(0) as u32;
                let height = height.max(0) as u32;
                self.state.physical_width.store(width, Ordering::Release);
                self.state.physical_height.store(height, Ordering::Release);
                self.native.reconfigure_wgpu(width, height);
            }
            WindowEvent::DisplayChanged(_) => self.refresh_screens(),
            WindowEvent::Shown
            | WindowEvent::Hidden
            | WindowEvent::Minimized
            | WindowEvent::Maximized
            | WindowEvent::Restored
            | WindowEvent::EnterFullscreen
            | WindowEvent::LeaveFullscreen => self.refresh_window_snapshot(),
            _ => {}
        }
    }

    fn drain_commands(&mut self) {
        let commands = {
            let mut commands = self.state.commands.lock().unwrap();
            std::mem::take(&mut *commands)
        };
        for command in commands {
            self.apply_command(command);
        }
    }

    fn is_our_window(&self, window_id: u32) -> bool {
        return self
            .native
            .window
            .as_ref()
            .is_some_and(|window| window.id() == window_id);
    }

    fn open_gamepad(&mut self, joystick: JoystickId) -> Result<(), SdlHostFailure> {
        if self.native.gamepads.contains_key(&joystick) {
            return Ok(());
        }
        let subsystem = self.native.gamepad.as_ref().ok_or_else(|| {
            failure(
                SdlHostFailureKind::Gamepad,
                "the SDL gamepad subsystem is no longer live",
            )
        })?;
        let gamepad = subsystem
            .open(joystick)
            .map_err(|error| failure(SdlHostFailureKind::Gamepad, error))?;
        let id = connect_sdl_gamepad_id(&mut self.native.gamepad_ids, joystick);
        let label = gamepad
            .name()
            .unwrap_or_else(|| format!("SDL gamepad {}", subsystem.guid_for_id(joystick)));
        let data = InputGamepadConnectData {
            gamepad: id,
            id: label,
            mapping: GamepadMapping::Standard,
        };
        self.native.gamepads.insert(joystick, gamepad);
        self.state.gamepads.lock().unwrap().insert(id, data.clone());
        for sink in self.state.input_sinks(InputAttachmentKind::Gamepad) {
            (sink.gamepad_connect)(&data);
        }
        return Ok(());
    }

    fn open_initial_gamepads(&mut self) -> Result<(), SdlHostFailure> {
        let joysticks = self
            .native
            .gamepad
            .as_ref()
            .ok_or_else(|| {
                failure(
                    SdlHostFailureKind::Gamepad,
                    "the SDL gamepad subsystem is no longer live",
                )
            })?
            .gamepads()
            .map_err(|error| failure(SdlHostFailureKind::Gamepad, error))?;
        for joystick in joysticks {
            self.open_gamepad(joystick)?;
        }
        return Ok(());
    }

    fn refresh_screens(&self) {
        if let Some(video) = &self.native.video {
            *self.state.screens.lock().unwrap() = screens_from_video(video);
        }
    }

    fn refresh_window_snapshot(&mut self) {
        let Some(window) = &self.native.window else {
            return;
        };
        let (x, y) = window.position();
        let (logical_width, logical_height) = window.size();
        let (physical_width, physical_height) = window.size_in_pixels();
        self.state.window_x.store(x, Ordering::Release);
        self.state.window_y.store(y, Ordering::Release);
        self.state
            .logical_width
            .store(logical_width, Ordering::Release);
        self.state
            .logical_height
            .store(logical_height, Ordering::Release);
        self.state
            .physical_width
            .store(physical_width, Ordering::Release);
        self.state
            .physical_height
            .store(physical_height, Ordering::Release);
        self.state
            .scale_factor
            .store(window.display_scale().to_bits(), Ordering::Release);
        self.native
            .reconfigure_wgpu(physical_width, physical_height);
    }

    fn release_pointer_buttons(&self) {
        let buttons = self.state.pointer_buttons.swap(0, Ordering::AcqRel);
        if buttons == 0 {
            return;
        }
        let (x, y) = *self.state.pointer_position.lock().unwrap();
        let data =
            build_sdl_pointer_data(x, y, 0.0, 0.0, 0, *self.state.modifiers.lock().unwrap(), 0);
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            (sink.pointer_cancel)(&data);
        }
    }

    fn remove_gamepad(&mut self, joystick: JoystickId) {
        self.native.gamepads.remove(&joystick);
        let Some(id) = disconnect_sdl_gamepad_id(&mut self.native.gamepad_ids, joystick) else {
            return;
        };
        let Some(data) = self.state.gamepads.lock().unwrap().remove(&id) else {
            return;
        };
        self.state
            .trigger_buttons
            .lock()
            .unwrap()
            .retain(|(gamepad, _), _| *gamepad != id);
        for sink in self.state.input_sinks(InputAttachmentKind::Gamepad) {
            (sink.gamepad_disconnect)(&data);
        }
    }

    fn shutdown(&mut self) {
        self.state.shutdown();
        self.native.shutdown();
    }
}

impl Drop for SdlHost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Clone, Copy)]
enum TouchPhase {
    Cancel,
    Down,
    Move,
    Up,
}
