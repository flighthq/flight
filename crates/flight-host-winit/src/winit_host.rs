//! Event-loop and capability implementation.

//! flight-compiler: target-native

// flight-lint: allow-file(contract-vocabulary, f64, hidden-state, sugar-delegates) This native host owns winit and wgpu platform values, Flight's f64 geometry/clock boundary, its required monotonic clock, and ApplicationHandler trait plumbing

use std::any::Any;
use std::collections::BTreeMap;
use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock, Weak};
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
use flight_input::{HostInputIngressCapability, InputIngressAttach, InputIngressSink};
use flight_lifecycle::{
    AppLaunchKind, AppLifecycleState, HostLifecycleCapability, LifecycleListener,
    LifecycleUnsubscribe,
};
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
    HostSurfaceCapabilities, HostSurfaceDisplayCapability, HostSurfaceResizeCapability,
    HostWgpuCapability, SurfaceBase, SurfaceRef, WgpuHostAcquisition, WgpuHostAcquisitionOptions,
    WgpuHostAcquisitionOwnership, WgpuPresentationSurface, WgpuProviderFuture,
    WgpuSurfaceAttachResult, WgpuSurfaceAttachment, allocate_surface, create_wgpu_host_acquisition,
    get_surface_handle,
};
use futures::executor::block_on;
use winit::application::ApplicationHandler;
use winit::dpi::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize};
use winit::event::{DeviceEvent, DeviceId, TouchPhase, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::ModifiersState;
use winit::platform::pump_events::{EventLoopExtPumpEvents, PumpStatus};
use winit::window::{Fullscreen, Window, WindowAttributes, WindowId, WindowLevel};

use crate::{
    build_winit_ime_text_data, build_winit_keyboard_data, build_winit_pointer_data,
    build_winit_text_data, build_winit_touch_data, build_winit_wheel_data, dispatch_winit_text,
    get_winit_key_event_modifiers, is_winit_committed_key_text, is_winit_press,
    translate_winit_mouse_button, update_winit_pointer_buttons,
};

/// Options applied when the host creates its one native window.
#[derive(Clone, Debug, PartialEq)]
pub struct WinitHostOptions {
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub visible: bool,
}

/// Structured host failure; [`explain_winit_host_failure`] supplies the user-facing diagnostic.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WinitHostFailure {
    pub kind: WinitHostFailureKind,
    pub message: String,
}

struct InputAttachment {
    active: AtomicBool,
    sink: InputIngressSink,
}

#[derive(Default)]
struct InputAttachments {
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

// The presentation context reaches the surface and window only through the provider's liveness
// check, so acquisitions held past destroy never touch released native state.
struct WinitCanvasContext {
    state: Weak<ProviderState>,
}

struct GpuResources {
    _instance: wgpu::Instance,
    _adapter: wgpu::Adapter,
    configuration: Mutex<wgpu::SurfaceConfiguration>,
    native: WgpuNativeDevice,
    device: WgpuDevice,
    context: flight_host::WgpuSurfaceContext,
    format: wgpu::TextureFormat,
}

struct ProviderIdentity;

struct WindowIdentity;

struct NativeGpu {
    instance: wgpu::Instance,
    adapter: wgpu::Adapter,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    configuration: wgpu::SurfaceConfiguration,
    format: wgpu::TextureFormat,
}

// The provider state outlives `destroy_winit_host` when capability clones are held, so it owns the
// native window and surface only through these slots, which `release_native` empties while the event
// loop can still flush the native destruction. Every capability reaches them through `window()` and
// `surface()` and fails closed once they are empty.
struct ProviderState {
    provider: ProviderRef,
    window: RwLock<Option<Arc<Window>>>,
    window_id: WindowId,
    surface: RwLock<Option<Arc<wgpu::Surface<'static>>>>,
    source_handle: Arc<dyn Any + Send + Sync>,
    gpu: GpuResources,
    start: Instant,
    alive: AtomicBool,
    ime_allowed: AtomicBool,
    lifecycle: AtomicU32,
    exit_code: AtomicI32,
    physical_width: AtomicU32,
    physical_height: AtomicU32,
    next_frame_handle: AtomicI32,
    frame_callbacks: Mutex<BTreeMap<i32, AppFrameCallback>>,
    input: Mutex<InputAttachments>,
    modifiers: Mutex<ModifiersState>,
    pointer_position: Mutex<(f64, f64)>,
    pointer_buttons: AtomicU32,
    close_listeners: Mutex<Vec<Arc<CloseSubscription>>>,
    lifecycle_listeners: Mutex<Vec<Arc<Listener<dyn Fn() + Send + Sync>>>>,
    move_listeners: Mutex<Vec<Arc<Listener<dyn Fn(f32, f32) + Send + Sync>>>>,
    resize_listeners: Mutex<Vec<Arc<Listener<dyn Fn(f32, f32, f64) + Send + Sync>>>>,
}

struct WinitApplication {
    state: Arc<ProviderState>,
    run_frame: Option<Box<dyn FnMut(f64) -> bool>>,
    frame_fired: bool,
}

/// Owns one event loop, window and the capability records backed by that window.
pub struct WinitHost {
    created_thread: ThreadId,
    event_loop: Option<EventLoop<()>>,
    application: WinitApplication,
    window_capabilities: HostWindowCapabilities,
    app_loop_capability: HostAppLoopCapability,
    lifecycle_capability: HostLifecycleCapability,
    screen_capabilities: HostScreenCapabilities,
    input_ingress_capability: HostInputIngressCapability,
    surface_capabilities: HostSurfaceCapabilities,
    wgpu_capability: HostWgpuCapability,
    input_source: InputIngressSource,
    native_window: NativeWindowHandle,
    surface: SurfaceRef,
}

/// The stage at which host creation or event-loop execution failed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WinitHostFailureKind {
    Adapter,
    Device,
    EventLoop,
    RunLoop,
    Surface,
    Thread,
    Window,
}

/// Result of one non-blocking event-loop pump.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WinitPumpStatus {
    Continue,
    Exit(i32),
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum InputAttachmentKind {
    Keyboard,
    Pointer,
    RelativePointer,
    Text,
    Wheel,
}

// Receives the events delivered while the released window's destruction is flushed.
struct NativeReleaseFlush;

fn create_app_loop_capability(state: &Arc<ProviderState>) -> HostAppLoopCapability {
    let request_state = state.clone();
    let cancel_state = state.clone();
    let now_state = state.clone();
    return HostAppLoopCapability {
        provider: state.provider.clone(),
        now: Arc::new(move || now_state.now()),
        request_frame: Arc::new(move |callback| {
            let Some(window) = request_state.window() else {
                return FrameRequestHandle(0);
            };
            let handle = request_state
                .next_frame_handle
                .fetch_add(1, Ordering::AcqRel)
                .max(1);
            request_state
                .frame_callbacks
                .lock()
                .unwrap()
                .insert(handle, callback);
            window.request_redraw();
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

fn create_gpu_resources(
    provider: ProviderRef,
    native: NativeGpu,
    state: Weak<ProviderState>,
) -> (GpuResources, Arc<wgpu::Surface<'static>>) {
    let native_device = create_wgpu_native_device(
        native.device,
        native.queue,
        create_host_spawn(provider.clone()),
    );
    let device = WgpuDevice {
        provider: provider.clone(),
        handle: Arc::new(native_device.clone()),
    };
    let canvas: Arc<dyn WgpuCanvasContext> = Arc::new(WinitCanvasContext { state });
    let context = create_wgpu_surface_context(provider, canvas);
    return (
        GpuResources {
            _instance: native.instance,
            _adapter: native.adapter,
            configuration: Mutex::new(native.configuration),
            native: native_device,
            device,
            context,
            format: native.format,
        },
        Arc::new(native.surface),
    );
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
        // winit has no gamepad API; the current SDK field is required rather than optional.
        attach_gamepad: inactive_input_attach(),
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

fn create_native_gpu(window: Arc<Window>) -> Result<NativeGpu, WinitHostFailure> {
    let instance = wgpu::Instance::default();
    let surface = instance
        .create_surface(window.clone())
        .map_err(|error| failure(WinitHostFailureKind::Surface, error))?;
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::None,
        force_fallback_adapter: false,
        compatible_surface: Some(&surface),
        ..wgpu::RequestAdapterOptions::default()
    }))
    .map_err(|error| failure(WinitHostFailureKind::Adapter, error))?;
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("flight-host-winit-device"),
        required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits()),
        ..wgpu::DeviceDescriptor::default()
    }))
    .map_err(|error| failure(WinitHostFailureKind::Device, error))?;
    let size = window.inner_size();
    let mut configuration = surface
        .get_default_config(&adapter, size.width.max(1), size.height.max(1))
        .ok_or_else(|| {
            failure(
                WinitHostFailureKind::Surface,
                "the selected adapter has no presentation configuration",
            )
        })?;
    if configuration.format.is_srgb() {
        let capabilities = surface.get_capabilities(&adapter);
        if let Some(format) = capabilities
            .formats
            .into_iter()
            .find(|format| !format.is_srgb())
        {
            configuration.format = format;
        }
    }
    surface.configure(&device, &configuration);
    let format = configuration.format;
    return Ok(NativeGpu {
        instance,
        adapter,
        surface,
        device,
        queue,
        configuration,
        format,
    });
}

fn create_screen_capabilities(state: &Arc<ProviderState>) -> HostScreenCapabilities {
    let all_state = state.clone();
    let primary_state = state.clone();
    let cursor_state = state.clone();
    let query = HostScreenQueryCapability {
        provider: state.provider.clone(),
        destroy: None,
        get_screens: Arc::new(move |out| {
            *out = screens(&all_state);
        }),
        get_primary_screen: Arc::new(move |out| {
            *out = screens(&primary_state)
                .into_iter()
                .find(|screen| screen.is_primary)
                .unwrap_or_else(create_screen_info);
        }),
        get_cursor_position: Arc::new(move |out: &mut Vector2| {
            let (x, y) = *cursor_state.pointer_position.lock().unwrap();
            let outer = cursor_state
                .window()
                .map_or(LogicalPosition::new(0.0, 0.0), |window| {
                    window
                        .outer_position()
                        .unwrap_or_default()
                        .to_logical::<f64>(window.scale_factor())
                });
            out.x = outer.x + x;
            out.y = outer.y + y;
        }),
    };
    return HostScreenCapabilities {
        query: Some(query),
        ..HostScreenCapabilities::default()
    };
}

fn create_surface_capabilities(state: &Arc<ProviderState>) -> HostSurfaceCapabilities {
    let resize_state = state.clone();
    let display_state = state.clone();
    return HostSurfaceCapabilities {
        resize: Some(HostSurfaceResizeCapability {
            provider: state.provider.clone(),
            resize: Arc::new(move |surface, width, height| {
                if resize_state.is_our_surface(surface) {
                    resize_state.reconfigure_surface(width.max(0.0) as u32, height.max(0.0) as u32);
                }
            }),
        }),
        display: Some(HostSurfaceDisplayCapability {
            provider: state.provider.clone(),
            set_display_size: Arc::new(move |surface, width, height| {
                if !display_state.is_our_surface(surface) {
                    return;
                }
                display_state.request_inner_size(LogicalSize::new(
                    f64::from(width.max(1.0)),
                    f64::from(height.max(1.0)),
                ));
            }),
        }),
    };
}

fn create_wgpu_capability(state: &Arc<ProviderState>) -> HostWgpuCapability {
    let create_state = state.clone();
    let acquire_state = state.clone();
    let attach_state = state.clone();
    let support_state = state.clone();
    return HostWgpuCapability {
        provider: state.provider.clone(),
        create: Arc::new(move |_window, width, height| {
            if !create_state.is_live() {
                return None;
            }
            create_state.reconfigure_surface(width.max(0.0) as u32, height.max(0.0) as u32);
            Some(NativeSurfaceHandle {
                provider: create_state.provider.clone(),
                handle: create_state.source_handle.clone(),
            })
        }),
        acquire: Arc::new(move |surface, options: &WgpuHostAcquisitionOptions| {
            let result = if !acquire_state.is_live()
                || !acquire_state.is_our_surface(surface)
                || options.format.as_ref().is_some_and(|format| {
                    get_wgpu_texture_format(format) != Some(acquire_state.gpu.format)
                }) {
                Err(flight_entity::FlightError {
                    kind: flight_entity::FlightErrorKind::NotSupportedError,
                    message: "the surface or requested format does not belong to this winit host"
                        .to_string(),
                })
            } else {
                let mut acquisition = create_wgpu_host_acquisition();
                acquisition.context = acquire_state.gpu.context.clone();
                acquisition.device = acquire_state.gpu.device.clone();
                acquisition.format =
                    get_wgpu_texture_format_name(acquire_state.gpu.format).to_string();
                acquisition.ownership = WgpuHostAcquisitionOwnership::Flight;
                acquisition.surface = live_presentation_surface(acquire_state.clone());
                Ok(acquisition)
            };
            let future: WgpuProviderFuture<WgpuHostAcquisition> = Box::pin(async move { result });
            future
        }),
        attach_surface: Arc::new(move |surface, attachment: &WgpuSurfaceAttachment| {
            if !attach_state.is_live()
                || !attach_state.is_our_surface(surface)
                || !Arc::ptr_eq(&attachment.device.provider, &attach_state.provider)
                || !Arc::ptr_eq(&attachment.device.handle, &attach_state.gpu.device.handle)
                || get_wgpu_texture_format(&attachment.format) != Some(attach_state.gpu.format)
            {
                return None;
            }
            Some(WgpuSurfaceAttachResult {
                context: attach_state.gpu.context.clone(),
                surface: live_presentation_surface(attach_state.clone()),
            })
        }),
        is_supported: Arc::new(move || {
            support_state.alive.load(Ordering::Acquire) && support_state.is_live()
        }),
        release: Arc::new(|_acquisition| {}),
    };
}

// Every window verb below resolves the live window through the provider and is a no-op once the
// host is destroyed. The host owns one window, so the `AppWindow` argument does not select a target.
fn create_window_capabilities(state: &Arc<ProviderState>) -> HostWindowCapabilities {
    let provider = state.provider.clone();
    let with_window = |state: &Arc<ProviderState>| {
        let state = state.clone();
        move |action: &dyn Fn(&Window)| {
            if let Some(window) = state.window() {
                action(&window);
            }
        }
    };

    let title = with_window(state);
    let appearance = HostWindowAppearanceCapability {
        provider: provider.clone(),
        set_icon: None,
        set_opacity: None,
        set_title: Arc::new(move |_win, text| title(&|window| window.set_title(text))),
    };

    let focus_window = with_window(state);
    let focus = HostWindowFocusCapability {
        provider: provider.clone(),
        focus: Arc::new(move |_win| focus_window(&|window| window.focus_window())),
    };

    let fullscreen_window = with_window(state);
    let fullscreen = HostWindowFullscreenCapability {
        provider: provider.clone(),
        set_fullscreen: Arc::new(move |_win, enabled| {
            fullscreen_window(&|window| {
                window.set_fullscreen(
                    enabled.then(|| Fullscreen::Borderless(window.current_monitor())),
                );
            });
        }),
    };

    let center_window = with_window(state);
    let bounds_state = state.clone();
    let move_window = with_window(state);
    let resize_state = state.clone();
    let geometry = HostWindowGeometryCapability {
        provider: provider.clone(),
        center: Some(Arc::new(move |_win| {
            center_window(&|window| {
                let Some(monitor) = window.current_monitor() else {
                    return;
                };
                let monitor_position = monitor.position();
                let monitor_size = monitor.size();
                let size = window.outer_size();
                window.set_outer_position(PhysicalPosition::new(
                    monitor_position.x + (monitor_size.width.saturating_sub(size.width) / 2) as i32,
                    monitor_position.y
                        + (monitor_size.height.saturating_sub(size.height) / 2) as i32,
                ));
            });
        })),
        get_bounds: Arc::new(move |out: &mut WindowBounds, _win| {
            let Some(window) = bounds_state.window() else {
                return;
            };
            let scale = window.scale_factor();
            let position = window
                .outer_position()
                .unwrap_or_default()
                .to_logical::<f64>(scale);
            let size = window.inner_size().to_logical::<f64>(scale);
            out.x = position.x as f32;
            out.y = position.y as f32;
            out.width = size.width as f32;
            out.height = size.height as f32;
        }),
        set_position: Arc::new(move |_win, x, y| {
            move_window(&|window| {
                window.set_outer_position(LogicalPosition::new(f64::from(x), f64::from(y)));
            });
        }),
        set_size: Arc::new(move |_win, width, height| {
            resize_state.request_inner_size(LogicalSize::new(
                f64::from(width).max(1.0),
                f64::from(height).max(1.0),
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
        close: Arc::new(move |_win| {
            close_state.alive.store(false, Ordering::Release);
            if let Some(window) = close_state.window() {
                window.set_visible(false);
            }
        }),
        open: Arc::new(move |win, _options: &WindowOptions| {
            let Some(window) = open_state.window() else {
                return false;
            };
            let win = win.read().unwrap();
            window.set_title(&win.title);
            window.set_resizable(win.resizable);
            window.set_visible(win.visible);
            window.set_minimized(win.minimized);
            window.set_maximized(win.maximized);
            window.set_fullscreen(
                win.fullscreen
                    .then(|| Fullscreen::Borderless(window.current_monitor())),
            );
            open_state.request_inner_size(LogicalSize::new(
                f64::from(win.width.max(1.0)),
                f64::from(win.height.max(1.0)),
            ));
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

    let max_window = with_window(state);
    let min_window = with_window(state);
    let resizable_window = with_window(state);
    let size_constraints = HostWindowSizeConstraintsCapability {
        provider: provider.clone(),
        set_maximum_size: Arc::new(move |_win, width, height| {
            max_window(&|window| {
                window.set_max_inner_size(Some(LogicalSize::new(
                    f64::from(width.max(1.0)),
                    f64::from(height.max(1.0)),
                )));
            });
        }),
        set_minimum_size: Arc::new(move |_win, width, height| {
            min_window(&|window| {
                window.set_min_inner_size(Some(LogicalSize::new(
                    f64::from(width.max(1.0)),
                    f64::from(height.max(1.0)),
                )));
            });
        }),
        set_resizable: Some(Arc::new(move |_win, value| {
            resizable_window(&|window| window.set_resizable(value));
        })),
    };

    let maximize_window = with_window(state);
    let minimize_window = with_window(state);
    let restore_window = with_window(state);
    let window_state = HostWindowStateCapability {
        provider: provider.clone(),
        maximize: Arc::new(move |_win| maximize_window(&|window| window.set_maximized(true))),
        minimize: Arc::new(move |_win| minimize_window(&|window| window.set_minimized(true))),
        restore: Arc::new(move |_win| {
            restore_window(&|window| {
                window.set_minimized(false);
                window.set_maximized(false);
            });
        }),
    };

    let hide_window = with_window(state);
    let show_window = with_window(state);
    let visibility = HostWindowVisibilityCapability {
        provider: provider.clone(),
        hide: Arc::new(move |_win| hide_window(&|window| window.set_visible(false))),
        show: Arc::new(move |_win| show_window(&|window| window.set_visible(true))),
        subscribe_visibility: None,
    };

    let level_window = with_window(state);
    let z_order = HostWindowZOrderCapability {
        provider,
        set_always_on_top: Arc::new(move |_win, value| {
            level_window(&|window| {
                window.set_window_level(if value {
                    WindowLevel::AlwaysOnTop
                } else {
                    WindowLevel::Normal
                });
            });
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

/// Creates one native window, event loop and wgpu surface/device pair.
pub fn create_winit_host(options: &WinitHostOptions) -> Result<WinitHost, WinitHostFailure> {
    let event_loop =
        EventLoop::new().map_err(|error| failure(WinitHostFailureKind::EventLoop, error))?;
    event_loop.set_control_flow(ControlFlow::Poll);
    let attributes: WindowAttributes = Window::default_attributes()
        .with_title(options.title.clone())
        .with_inner_size(LogicalSize::new(
            options.width.max(1.0),
            options.height.max(1.0),
        ))
        .with_visible(options.visible);
    #[allow(deprecated)]
    let window = Arc::new(
        event_loop
            .create_window(attributes)
            .map_err(|error| failure(WinitHostFailureKind::Window, error))?,
    );
    let provider: ProviderRef = Arc::new(ProviderIdentity);
    // The source and native-window handles carry an identity token, never the window itself, so a
    // retained handle cannot keep the native window alive past destroy.
    let source_handle: Arc<dyn Any + Send + Sync> = Arc::new(WindowIdentity);
    let native_gpu = create_native_gpu(window.clone())?;
    let size = window.inner_size();
    let window_id = window.id();
    let state = Arc::new_cyclic(|weak: &Weak<ProviderState>| {
        let (gpu, surface) = create_gpu_resources(provider.clone(), native_gpu, weak.clone());
        return ProviderState {
            provider: provider.clone(),
            window: RwLock::new(Some(window)),
            window_id,
            surface: RwLock::new(Some(surface)),
            source_handle: source_handle.clone(),
            gpu,
            start: Instant::now(),
            alive: AtomicBool::new(true),
            ime_allowed: AtomicBool::new(false),
            lifecycle: AtomicU32::new(AppLifecycleState::Active as u32),
            exit_code: AtomicI32::new(0),
            physical_width: AtomicU32::new(size.width),
            physical_height: AtomicU32::new(size.height),
            next_frame_handle: AtomicI32::new(1),
            frame_callbacks: Mutex::new(BTreeMap::new()),
            input: Mutex::new(InputAttachments::default()),
            modifiers: Mutex::new(ModifiersState::empty()),
            pointer_position: Mutex::new((0.0, 0.0)),
            pointer_buttons: AtomicU32::new(0),
            close_listeners: Mutex::new(Vec::new()),
            lifecycle_listeners: Mutex::new(Vec::new()),
            move_listeners: Mutex::new(Vec::new()),
            resize_listeners: Mutex::new(Vec::new()),
        };
    });

    let window_capabilities = create_window_capabilities(&state);
    let app_loop_capability = create_app_loop_capability(&state);
    let lifecycle_capability = create_lifecycle_capability(&state);
    let screen_capabilities = create_screen_capabilities(&state);
    let input_ingress_capability = create_input_ingress_capability(&state);
    let surface_capabilities = create_surface_capabilities(&state);
    let wgpu_capability = create_wgpu_capability(&state);
    let input_source = InputIngressSource {
        provider: provider.clone(),
        handle: source_handle.clone(),
    };
    let native_window = NativeWindowHandle {
        provider: provider.clone(),
        handle: source_handle.clone(),
    };
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(NativeSurfaceHandle {
        provider,
        handle: source_handle,
    }));

    return Ok(WinitHost {
        created_thread: std::thread::current().id(),
        event_loop: Some(event_loop),
        application: WinitApplication {
            state,
            run_frame: None,
            frame_fired: false,
        },
        window_capabilities,
        app_loop_capability,
        lifecycle_capability,
        screen_capabilities,
        input_ingress_capability,
        surface_capabilities,
        wgpu_capability,
        input_source,
        native_window,
        surface,
    });
}

/// Builds the plain options record consumed by [`create_winit_host`].
pub fn create_winit_host_options(
    title: &str,
    width: f64,
    height: f64,
    visible: bool,
) -> WinitHostOptions {
    return WinitHostOptions {
        title: title.to_string(),
        width,
        height,
        visible,
    };
}

/// Returns an owned reference to the host's canonical window surface.
pub fn create_winit_host_surface(host: &WinitHost) -> SurfaceRef {
    return host.surface.clone();
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
            sink,
        });
        state
            .input
            .lock()
            .unwrap()
            .list_mut(kind)
            .push(attachment.clone());
        if kind == InputAttachmentKind::Text {
            state.sync_ime_allowed();
        }
        let release_state = state.clone();
        return Arc::new(move || {
            if attachment.active.swap(false, Ordering::AcqRel) && kind == InputAttachmentKind::Text
            {
                release_state.sync_ime_allowed();
            }
        });
    });
}

/// Ends the host's lifetime on its creator thread: the wgpu surface and native window are released
/// and the event loop is pumped so the platform destroys the window before the loop is dropped.
/// Capability clones held afterwards fail closed.
pub fn destroy_winit_host(host: WinitHost) -> Result<(), WinitHostFailure> {
    require_creator_thread(&host)?;
    drop(host);
    return Ok(());
}

/// Produces a stable creation/run diagnostic without relying on ambient last-error state.
pub fn explain_winit_host_failure(failure: &WinitHostFailure) -> String {
    let stage = match failure.kind {
        WinitHostFailureKind::Adapter => "GPU adapter selection",
        WinitHostFailureKind::Device => "GPU device creation",
        WinitHostFailureKind::EventLoop => "winit event-loop creation",
        WinitHostFailureKind::RunLoop => "winit blocking event loop",
        WinitHostFailureKind::Surface => "wgpu presentation-surface creation",
        WinitHostFailureKind::Thread => "host thread contract",
        WinitHostFailureKind::Window => "native window creation",
    };
    return format!("flight-host-winit {stage} failed: {}", failure.message);
}

/// Explains why a pump did not remain live.
pub fn explain_winit_pump_status(status: WinitPumpStatus) -> &'static str {
    return match status {
        WinitPumpStatus::Continue => "the winit host is alive",
        WinitPumpStatus::Exit(_) => "the winit host event loop exited",
        WinitPumpStatus::Unavailable => {
            "pump mode is unavailable after the event loop has been consumed; use run_winit_host on platforms that require an OS-owned loop"
        }
    };
}

fn failure(kind: WinitHostFailureKind, message: impl ToString) -> WinitHostFailure {
    return WinitHostFailure {
        kind,
        message: message.to_string(),
    };
}

/// Borrows the frame scheduling capability.
pub fn get_winit_host_app_loop_capability(host: &WinitHost) -> &HostAppLoopCapability {
    return &host.app_loop_capability;
}

/// Borrows keyboard, pointer, wheel and text ingress. Its gamepad attachment is inert.
pub fn get_winit_host_input_ingress_capability(host: &WinitHost) -> &HostInputIngressCapability {
    return &host.input_ingress_capability;
}

/// Borrows the host-owned input source used with SDK attach functions.
pub fn get_winit_host_input_source(host: &WinitHost) -> &InputIngressSource {
    return &host.input_source;
}

/// Borrows the application lifecycle capability.
pub fn get_winit_host_lifecycle_capability(host: &WinitHost) -> &HostLifecycleCapability {
    return &host.lifecycle_capability;
}

/// Borrows the opaque native window handle.
pub fn get_winit_host_native_window(host: &WinitHost) -> &NativeWindowHandle {
    return &host.native_window;
}

/// Borrows the monitor/screen capability group.
pub fn get_winit_host_screen_capabilities(host: &WinitHost) -> &HostScreenCapabilities {
    return &host.screen_capabilities;
}

/// Borrows the filled monitor and cursor query capability.
pub fn get_winit_host_screen_query_capability(
    host: &WinitHost,
) -> Option<&HostScreenQueryCapability> {
    return host.screen_capabilities.query.as_ref();
}

/// Borrows logical/backing surface resize capabilities.
pub fn get_winit_host_surface_capabilities(host: &WinitHost) -> &HostSurfaceCapabilities {
    return &host.surface_capabilities;
}

/// Borrows the filled logical display-size capability.
pub fn get_winit_host_surface_display_capability(
    host: &WinitHost,
) -> Option<&HostSurfaceDisplayCapability> {
    return host.surface_capabilities.display.as_ref();
}

/// Borrows the filled backing-size reconfiguration capability.
pub fn get_winit_host_surface_resize_capability(
    host: &WinitHost,
) -> Option<&HostSurfaceResizeCapability> {
    return host.surface_capabilities.resize.as_ref();
}

/// Borrows the wgpu acquisition and presentation capability.
pub fn get_winit_host_wgpu_capability(host: &WinitHost) -> &HostWgpuCapability {
    return &host.wgpu_capability;
}

/// Borrows the host-owned device used by render states and screen render targets.
pub fn get_winit_host_wgpu_device(host: &WinitHost) -> &WgpuDevice {
    return &host.application.state.gpu.device;
}

/// Borrows the filled window appearance capability.
pub fn get_winit_host_window_appearance_capability(
    host: &WinitHost,
) -> Option<&HostWindowAppearanceCapability> {
    return host.window_capabilities.appearance.as_ref();
}

/// Borrows the filled window capability group.
pub fn get_winit_host_window_capabilities(host: &WinitHost) -> &HostWindowCapabilities {
    return &host.window_capabilities;
}

/// Borrows the filled window focus capability.
pub fn get_winit_host_window_focus_capability(
    host: &WinitHost,
) -> Option<&HostWindowFocusCapability> {
    return host.window_capabilities.focus.as_ref();
}

/// Borrows the filled window fullscreen capability.
pub fn get_winit_host_window_fullscreen_capability(
    host: &WinitHost,
) -> Option<&HostWindowFullscreenCapability> {
    return host.window_capabilities.fullscreen.as_ref();
}

/// Borrows the filled window geometry capability.
pub fn get_winit_host_window_geometry_capability(
    host: &WinitHost,
) -> Option<&HostWindowGeometryCapability> {
    return host.window_capabilities.geometry.as_ref();
}

/// Borrows the filled window lifecycle capability.
pub fn get_winit_host_window_lifecycle_capability(
    host: &WinitHost,
) -> Option<&HostWindowLifecycleCapability> {
    return host.window_capabilities.lifecycle.as_ref();
}

/// Borrows the filled window size-constraints capability.
pub fn get_winit_host_window_size_constraints_capability(
    host: &WinitHost,
) -> Option<&HostWindowSizeConstraintsCapability> {
    return host.window_capabilities.size_constraints.as_ref();
}

/// Borrows the filled window state capability.
pub fn get_winit_host_window_state_capability(
    host: &WinitHost,
) -> Option<&HostWindowStateCapability> {
    return host.window_capabilities.state.as_ref();
}

/// Borrows the filled window visibility capability.
pub fn get_winit_host_window_visibility_capability(
    host: &WinitHost,
) -> Option<&HostWindowVisibilityCapability> {
    return host.window_capabilities.visibility.as_ref();
}

/// Borrows the filled window z-order capability.
pub fn get_winit_host_window_z_order_capability(
    host: &WinitHost,
) -> Option<&HostWindowZOrderCapability> {
    return host.window_capabilities.z_order.as_ref();
}

fn inactive_input_attach() -> InputIngressAttach {
    return Arc::new(|_source, _sink, _options| Arc::new(|| {}));
}

fn live_presentation_surface(state: Arc<ProviderState>) -> WgpuPresentationSurface {
    let width_state = state.clone();
    return WgpuPresentationSurface {
        width: Arc::new(move || width_state.physical_width.load(Ordering::Acquire) as f32),
        height: Arc::new(move || state.physical_height.load(Ordering::Acquire) as f32),
    };
}

fn monitor_to_screen(
    monitor: &winit::monitor::MonitorHandle,
    primary: bool,
    id: usize,
) -> ScreenInfo {
    let mut screen = create_screen_info();
    let scale = monitor.scale_factor();
    let position = monitor.position().to_logical::<f64>(scale);
    let physical = monitor.size();
    let logical = physical.to_logical::<f64>(scale);
    screen.id = id as f64 + 1.0;
    screen.x = position.x;
    screen.y = position.y;
    screen.width = logical.width;
    screen.height = logical.height;
    screen.work_width = logical.width;
    screen.work_height = logical.height;
    screen.scale_factor = scale;
    screen.is_primary = primary;
    screen.physical_width = f64::from(physical.width);
    screen.physical_height = f64::from(physical.height);
    screen.label = monitor.name().unwrap_or_default();
    return screen;
}

/// Pumps pending OS events without taking ownership of the consumer's loop.
pub fn pump_winit_host(host: &mut WinitHost) -> Result<WinitPumpStatus, WinitHostFailure> {
    require_creator_thread(host)?;
    let Some(event_loop) = &mut host.event_loop else {
        return Ok(WinitPumpStatus::Unavailable);
    };
    host.application.frame_fired = false;
    let status = event_loop.pump_app_events(Some(Duration::ZERO), &mut host.application);
    if !host.application.frame_fired && host.application.state.alive.load(Ordering::Acquire) {
        host.application.fire_frame_point(None);
    }
    return Ok(match status {
        PumpStatus::Continue => {
            if host.application.state.alive.load(Ordering::Acquire) {
                WinitPumpStatus::Continue
            } else {
                WinitPumpStatus::Exit(host.application.state.exit_code.load(Ordering::Acquire))
            }
        }
        PumpStatus::Exit(code) => WinitPumpStatus::Exit(code),
    });
}

fn require_creator_thread(host: &WinitHost) -> Result<(), WinitHostFailure> {
    if host.created_thread != std::thread::current().id() {
        return Err(failure(
            WinitHostFailureKind::Thread,
            "create, pump, run and destroy must execute on the creating thread",
        ));
    }
    return Ok(());
}

/// Runs the OS-owned blocking loop, calling `frame` at each host frame point until it returns false.
pub fn run_winit_host(
    host: &mut WinitHost,
    frame: impl FnMut(f64) -> bool + 'static,
) -> Result<(), WinitHostFailure> {
    require_creator_thread(host)?;
    let Some(event_loop) = host.event_loop.take() else {
        return Err(failure(
            WinitHostFailureKind::RunLoop,
            "the event loop was already consumed",
        ));
    };
    host.application.run_frame = Some(Box::new(frame));
    event_loop
        .run_app(&mut host.application)
        .map_err(|error| failure(WinitHostFailureKind::RunLoop, error))?;
    host.application.run_frame = None;
    return Ok(());
}

fn screens(state: &ProviderState) -> Vec<ScreenInfo> {
    let Some(window) = state.window() else {
        return Vec::new();
    };
    let current = window.current_monitor();
    return window
        .available_monitors()
        .enumerate()
        .map(|(index, monitor)| {
            let primary = current.as_ref().is_some_and(|value| value == &monitor);
            monitor_to_screen(&monitor, primary, index)
        })
        .collect();
}

impl Default for WinitHostOptions {
    fn default() -> Self {
        return Self {
            title: "Flight".to_string(),
            width: 800.0,
            height: 600.0,
            visible: true,
        };
    }
}

impl fmt::Display for WinitHostFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        return formatter.write_str(&explain_winit_host_failure(self));
    }
}

impl std::error::Error for WinitHostFailure {}

impl InputAttachments {
    fn has_active(&self, kind: InputAttachmentKind) -> bool {
        return self
            .list(kind)
            .iter()
            .any(|attachment| attachment.active.load(Ordering::Acquire));
    }

    fn list(&self, kind: InputAttachmentKind) -> Vec<Arc<InputAttachment>> {
        return match kind {
            InputAttachmentKind::Keyboard => self.keyboard.clone(),
            InputAttachmentKind::Pointer => self.pointer.clone(),
            InputAttachmentKind::RelativePointer => self.relative_pointer.clone(),
            InputAttachmentKind::Text => self.text.clone(),
            InputAttachmentKind::Wheel => self.wheel.clone(),
        };
    }

    fn list_mut(&mut self, kind: InputAttachmentKind) -> &mut Vec<Arc<InputAttachment>> {
        return match kind {
            InputAttachmentKind::Keyboard => &mut self.keyboard,
            InputAttachmentKind::Pointer => &mut self.pointer,
            InputAttachmentKind::RelativePointer => &mut self.relative_pointer,
            InputAttachmentKind::Text => &mut self.text,
            InputAttachmentKind::Wheel => &mut self.wheel,
        };
    }
}

impl WgpuCanvasContext for WinitCanvasContext {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        if let Some(surface) = self.state.upgrade().and_then(|state| state.surface()) {
            configure_wgpu_native_surface(&surface, configuration);
        }
    }

    // A zero live extent (minimized, or a zero backing size) and a released surface both skip the
    // frame: it draws into unpresented scratch storage.
    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
        let Some(state) = self.state.upgrade() else {
            return Err(WgpuCanvasFrameError::Timeout);
        };
        if state.physical_width.load(Ordering::Acquire) == 0
            || state.physical_height.load(Ordering::Acquire) == 0
        {
            return Err(WgpuCanvasFrameError::Timeout);
        }
        let Some(surface) = state.surface() else {
            return Err(WgpuCanvasFrameError::Timeout);
        };
        return acquire_wgpu_native_surface_frame(&surface);
    }

    fn present(&self, device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
        let Some(window) = self.state.upgrade().and_then(|state| state.window()) else {
            return;
        };
        window.pre_present_notify();
        present_wgpu_native_surface_frame(device, frame);
    }

    fn unconfigure(&self) {}
}

impl ProviderState {
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

    fn is_live(&self) -> bool {
        return self.window.read().unwrap().is_some();
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

    fn notify_resize(&self, size: PhysicalSize<u32>) {
        let Some(window) = self.window() else {
            return;
        };
        let scale = window.scale_factor();
        let logical = size.to_logical::<f64>(scale);
        let listeners = self.resize_listeners.lock().unwrap().clone();
        for listener in listeners {
            if listener.active.load(Ordering::Acquire) {
                (listener.callback)(logical.width as f32, logical.height as f32, scale);
            }
        }
    }

    fn now(&self) -> f64 {
        return self.start.elapsed().as_secs_f64() * 1_000.0;
    }

    fn reconfigure_surface(&self, width: u32, height: u32) {
        self.physical_width.store(width, Ordering::Release);
        self.physical_height.store(height, Ordering::Release);
        if width == 0 || height == 0 {
            return;
        }
        let Some(surface) = self.surface() else {
            return;
        };
        let mut configuration = self.gpu.configuration.lock().unwrap();
        configuration.width = width;
        configuration.height = height;
        surface.configure(&self.gpu.native.device, &configuration);
    }

    // Releases the surface before the window it presents to. Afterwards every capability fails
    // closed; the caller pumps the event loop so the platform processes the window destruction.
    fn release_native(&self) {
        self.alive.store(false, Ordering::Release);
        self.frame_callbacks.lock().unwrap().clear();
        drop(self.surface.write().unwrap().take());
        drop(self.window.write().unwrap().take());
    }

    // Wayland applies a requested size immediately, returns it, and may never send `Resized`, so the
    // returned size is applied here; platforms that resize asynchronously deliver `Resized` later.
    fn request_inner_size(&self, size: LogicalSize<f64>) {
        let Some(window) = self.window() else {
            return;
        };
        if let Some(applied) = window.request_inner_size(size) {
            self.resize_to(applied);
        }
    }

    fn resize_to(&self, size: PhysicalSize<u32>) {
        self.reconfigure_surface(size.width, size.height);
        self.notify_resize(size);
    }

    fn set_lifecycle(&self, state: AppLifecycleState) {
        let encoded = state as u32;
        if self.lifecycle.swap(encoded, Ordering::AcqRel) == encoded {
            return;
        }
        let listeners = self.lifecycle_listeners.lock().unwrap().clone();
        for listener in listeners {
            if listener.active.load(Ordering::Acquire) {
                (listener.callback)();
            }
        }
    }

    fn surface(&self) -> Option<Arc<wgpu::Surface<'static>>> {
        return self.surface.read().unwrap().clone();
    }

    // IME is allowed exactly while at least one text attachment is active.
    fn sync_ime_allowed(&self) {
        let wanted = self
            .input
            .lock()
            .unwrap()
            .has_active(InputAttachmentKind::Text);
        if self.ime_allowed.swap(wanted, Ordering::AcqRel) == wanted {
            return;
        }
        if let Some(window) = self.window() {
            window.set_ime_allowed(wanted);
        }
    }

    fn window(&self) -> Option<Arc<Window>> {
        return self.window.read().unwrap().clone();
    }
}

impl WinitApplication {
    fn dispatch_close_request(&self, event_loop: &ActiveEventLoop) {
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
        event_loop.exit();
    }

    fn dispatch_keyboard(&self, event: winit::event::KeyEvent) {
        let pressed = is_winit_press(event.state);
        let modifiers = get_winit_key_event_modifiers(
            *self.state.modifiers.lock().unwrap(),
            event.physical_key,
            pressed,
        );
        let data = build_winit_keyboard_data(
            &event.logical_key,
            event.physical_key,
            event.location,
            modifiers,
            event.repeat,
            self.state.now(),
        );
        for sink in self.state.input_sinks(InputAttachmentKind::Keyboard) {
            if pressed {
                (sink.key_down)(&data);
            } else {
                (sink.key_up)(&data);
            }
        }
        if pressed
            && let Some(text) = event.text
            && is_winit_committed_key_text(&text, modifiers)
        {
            let text = build_winit_text_data(&text, false);
            for sink in self.state.input_sinks(InputAttachmentKind::Text) {
                dispatch_winit_text(&sink, &text);
            }
        }
    }

    fn dispatch_pointer_button(&self, button: winit::event::MouseButton, pressed: bool) {
        let button = translate_winit_mouse_button(button);
        let buttons = update_winit_pointer_buttons(
            self.state.pointer_buttons.load(Ordering::Acquire),
            button,
            pressed,
        );
        self.state.pointer_buttons.store(buttons, Ordering::Release);
        let (x, y) = *self.state.pointer_position.lock().unwrap();
        let mut data = build_winit_pointer_data(
            x,
            y,
            buttons,
            *self.state.modifiers.lock().unwrap(),
            self.state.now(),
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

    fn dispatch_pointer_move(&self, position: PhysicalPosition<f64>) {
        let scale = self.scale_factor();
        let logical = position.to_logical::<f64>(scale);
        *self.state.pointer_position.lock().unwrap() = (logical.x, logical.y);
        let data = build_winit_pointer_data(
            logical.x,
            logical.y,
            self.state.pointer_buttons.load(Ordering::Acquire),
            *self.state.modifiers.lock().unwrap(),
            self.state.now(),
        );
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            (sink.pointer_move)(&data);
        }
    }

    fn dispatch_touch(&self, touch: winit::event::Touch) {
        let mut data = build_winit_touch_data(
            &touch,
            *self.state.modifiers.lock().unwrap(),
            self.state.now(),
        );
        let logical = touch.location.to_logical::<f64>(self.scale_factor());
        data.x = logical.x;
        data.y = logical.y;
        for sink in self.state.input_sinks(InputAttachmentKind::Pointer) {
            match touch.phase {
                TouchPhase::Started => (sink.pointer_down)(&data),
                TouchPhase::Moved => (sink.pointer_move)(&data),
                TouchPhase::Ended => (sink.pointer_up)(&data),
                TouchPhase::Cancelled => (sink.pointer_cancel)(&data),
            }
        }
    }

    fn dispatch_wheel(&self, delta: winit::event::MouseScrollDelta) {
        let (x, y) = *self.state.pointer_position.lock().unwrap();
        let data = build_winit_wheel_data(
            x,
            y,
            self.state.pointer_buttons.load(Ordering::Acquire),
            *self.state.modifiers.lock().unwrap(),
            &delta,
            self.state.now(),
        );
        for sink in self.state.input_sinks(InputAttachmentKind::Wheel) {
            (sink.wheel)(&data);
        }
    }

    fn fire_frame_point(&mut self, event_loop: Option<&ActiveEventLoop>) {
        self.frame_fired = true;
        self.state.fire_scheduled_frames();
        let keep_running = self
            .run_frame
            .as_mut()
            .is_none_or(|callback| callback(self.state.now()));
        if !keep_running {
            self.state.alive.store(false, Ordering::Release);
            if let Some(event_loop) = event_loop {
                event_loop.exit();
            }
        }
    }
}

impl ApplicationHandler for WinitApplication {
    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if self.run_frame.is_some()
            && let Some(window) = self.state.window()
        {
            window.request_redraw();
        }
    }

    fn device_event(
        &mut self,
        _event_loop: &ActiveEventLoop,
        _device_id: DeviceId,
        event: DeviceEvent,
    ) {
        if let DeviceEvent::MouseMotion { delta } = event {
            let mut data = build_winit_pointer_data(
                delta.0,
                delta.1,
                self.state.pointer_buttons.load(Ordering::Acquire),
                *self.state.modifiers.lock().unwrap(),
                self.state.now(),
            );
            data.delta_x = delta.0;
            data.delta_y = delta.1;
            for sink in self.state.input_sinks(InputAttachmentKind::RelativePointer) {
                (sink.pointer_move_relative)(&data);
            }
        }
    }

    // The blocking loop is consumed when it exits, so the run path releases the window here, where
    // the loop can still flush its destruction; pump mode releases it in `destroy_winit_host`.
    fn exiting(&mut self, _event_loop: &ActiveEventLoop) {
        if self.run_frame.is_some() {
            self.state.release_native();
        }
    }

    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {
        self.state.set_lifecycle(AppLifecycleState::Active);
    }

    fn suspended(&mut self, _event_loop: &ActiveEventLoop) {
        self.state.set_lifecycle(AppLifecycleState::Background);
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        window_id: WindowId,
        event: WindowEvent,
    ) {
        if window_id != self.state.window_id {
            return;
        }
        match event {
            WindowEvent::CloseRequested => self.dispatch_close_request(event_loop),
            WindowEvent::Focused(focused) => self.state.set_lifecycle(if focused {
                AppLifecycleState::Active
            } else {
                AppLifecycleState::Inactive
            }),
            WindowEvent::KeyboardInput { event, .. } => self.dispatch_keyboard(event),
            WindowEvent::ModifiersChanged(modifiers) => {
                *self.state.modifiers.lock().unwrap() = modifiers.state();
            }
            WindowEvent::CursorMoved { position, .. } => self.dispatch_pointer_move(position),
            WindowEvent::MouseInput { state, button, .. } => {
                self.dispatch_pointer_button(button, is_winit_press(state));
            }
            WindowEvent::MouseWheel { delta, .. } => self.dispatch_wheel(delta),
            WindowEvent::Ime(ime) => {
                if let Some(data) = build_winit_ime_text_data(&ime) {
                    for sink in self.state.input_sinks(InputAttachmentKind::Text) {
                        dispatch_winit_text(&sink, &data);
                    }
                }
            }
            WindowEvent::Touch(touch) => self.dispatch_touch(touch),
            WindowEvent::Moved(position) => {
                let logical = position.to_logical::<f64>(self.scale_factor());
                let listeners = self.state.move_listeners.lock().unwrap().clone();
                for listener in listeners {
                    if listener.active.load(Ordering::Acquire) {
                        (listener.callback)(logical.x as f32, logical.y as f32);
                    }
                }
            }
            WindowEvent::Resized(size) => self.dispatch_resize(size),
            WindowEvent::ScaleFactorChanged { .. } => {
                if let Some(window) = self.state.window() {
                    self.dispatch_resize(window.inner_size());
                }
            }
            WindowEvent::RedrawRequested => self.fire_frame_point(Some(event_loop)),
            _ => {}
        }
    }
}

impl WinitApplication {
    fn dispatch_resize(&self, size: PhysicalSize<u32>) {
        self.state.resize_to(size);
    }

    fn scale_factor(&self) -> f64 {
        return self
            .state
            .window()
            .map_or(1.0, |window| window.scale_factor());
    }
}

impl Drop for WinitHost {
    // `WinitHost` is !Send, so this always runs on the creator thread. The window must be released
    // while the event loop is alive and the loop pumped afterwards: winit queues the native destroy
    // request and only the loop flushes it to the display server.
    fn drop(&mut self) {
        self.application.state.release_native();
        let Some(mut event_loop) = self.event_loop.take() else {
            return;
        };
        let mut flush = NativeReleaseFlush;
        for _ in 0..NATIVE_RELEASE_FLUSH_PUMPS {
            let _ = event_loop.pump_app_events(Some(Duration::ZERO), &mut flush);
        }
    }
}

impl ApplicationHandler for NativeReleaseFlush {
    fn resumed(&mut self, _event_loop: &ActiveEventLoop) {}

    fn window_event(
        &mut self,
        _event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        _event: WindowEvent,
    ) {
    }
}

const NATIVE_RELEASE_FLUSH_PUMPS: usize = 2;
