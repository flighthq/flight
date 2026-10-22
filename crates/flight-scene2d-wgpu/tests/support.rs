#![allow(dead_code)]
//! Test doubles for the source's browser scaffolding (TS `wgpuHost.ts` and `wgpuTestHelper.ts` from
//! render-wgpu, the DOM canvas and its 2D context). Adapted from flight-render-wgpu's test support:
//! devices are real `wgpu` devices on the noop backend (D17), presentation goes through a
//! canvas-context fake, host images through an external-image fake, and Canvas 2D drawing through a
//! recording `Canvas2DContext` fake. These are test fixtures only, never a public provider.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_host::{
    Canvas2DContext, CanvasRenderingContext2D, CanvasTextMetrics, HostImageSource,
    HostSpawnCapability, NativeSurfaceHandle, ProviderRef, WgpuDevice,
};
use flight_image::contract::{
    HostImageCapability, HostImageDimensions, ImageResolverState, ImageResource,
    create_image_resolver_state, create_image_resource, register_host_image_dimension_resolver,
};
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_surface::{
    CanvasSurface, HostCanvasCapability, HostWgpuCapability, SurfaceBase, SurfaceRef,
    WgpuHostAcquisition, WgpuHostAcquisitionOwnership, WgpuPresentationSurface,
    WgpuSurfaceAttachResult, allocate_surface, create_wgpu_host_acquisition, get_surface_runtime,
};

// flight-lint: allow(test-default-call) D17 test scaffolding fills Rust-only option bags whose omitted fields are the source's undefined
pub fn test_default<T: Default>() -> T {
    return T::default();
}

pub fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

// ── host spawn ───────────────────────────────────────────────────────────────────────────────

// flight-lint: allow(hidden-state) test scaffolding: each test thread queues its own spawned continuations, drained where the source runs microtasks
thread_local! {
    static SPAWNED: std::cell::RefCell<Vec<std::pin::Pin<Box<dyn Future<Output = ()> + Send>>>> =
        const { std::cell::RefCell::new(Vec::new()) };
}

/// A queueing host spawn capability (Principal 2ec2343a): spawned continuations wait until the
/// test drains them, at the points where the source would run its microtasks.
pub fn test_host_spawn() -> HostSpawnCapability {
    return HostSpawnCapability {
        provider: test_provider(),
        spawn: Arc::new(|future| {
            SPAWNED.with(|queue| queue.borrow_mut().push(future));
        }),
    };
}

/// Runs every queued continuation that can make progress, repeating until none does (TS: one
/// `await settle()` turn). Continuations still waiting on an unresolved promise stay queued.
pub fn drain_test_spawned() {
    loop {
        let pending = SPAWNED.with(|queue| std::mem::take(&mut *queue.borrow_mut()));
        if pending.is_empty() {
            return;
        }
        let mut context = Context::from_waker(Waker::noop());
        let mut still_pending = Vec::new();
        let mut progressed = false;
        for mut future in pending {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(()) => progressed = true,
                Poll::Pending => still_pending.push(future),
            }
        }
        SPAWNED.with(|queue| {
            let mut queue = queue.borrow_mut();
            let spawned_meanwhile = std::mem::take(&mut *queue);
            *queue = still_pending;
            queue.extend(spawned_meanwhile);
        });
        if !progressed {
            return;
        }
    }
}

// ── devices ──────────────────────────────────────────────────────────────────────────────────

/// A fresh real device on the noop backend, requesting the block-compression families the adapter
/// offers (as the source's test host does).
pub fn create_test_native_device() -> WgpuNativeDevice {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
    let wanted = wgpu::Features::TEXTURE_COMPRESSION_BC
        | wgpu::Features::TEXTURE_COMPRESSION_ETC2
        | wgpu::Features::TEXTURE_COMPRESSION_ASTC;
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        required_features: adapter.features() & wanted,
        ..wgpu::DeviceDescriptor::default()
    }))
    .expect("the noop device");
    return create_wgpu_native_device(device, queue, test_host_spawn());
}

/// A noop device with no optional features, for paths that must take a fallback.
pub fn create_test_native_device_without_features() -> WgpuNativeDevice {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))
        .expect("the noop device");
    return create_wgpu_native_device(device, queue, test_host_spawn());
}

/// A noop device enabling exactly the optional `features` the adapter offers out of those asked
/// for (the source's mock device with selected `features` added).
pub fn create_test_native_device_with_features(features: wgpu::Features) -> WgpuNativeDevice {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
    let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
        required_features: adapter.features() & features,
        ..wgpu::DeviceDescriptor::default()
    }))
    .expect("the noop device");
    return create_wgpu_native_device(device, queue, test_host_spawn());
}

/// A device whose loss the test resolves by hand (TS `makeLosableDevice`), injected through the
/// payload's own construction-time loss hook (Principal cafc5d6b).
pub fn create_losable_test_native_device() -> (WgpuNativeDevice, TestDeviceLoss) {
    let base = create_test_native_device_without_features();
    let (native, hook) = create_wgpu_native_device_with_loss_hook(
        base.device.clone(),
        base.queue.clone(),
        test_host_spawn(),
    );
    return (native, TestDeviceLoss { hook });
}

/// A noop device whose stored loss promise is never settled (TS: a device with no `lost` member).
pub fn create_test_native_device_with_no_loss() -> WgpuNativeDevice {
    let base = create_test_native_device_without_features();
    let (native, _hook) = create_wgpu_native_device_with_loss_hook(
        base.device.clone(),
        base.queue.clone(),
        test_host_spawn(),
    );
    return native;
}

/// The hand-driven resolution of a losable test device (TS `resolveLost`).
pub struct TestDeviceLoss {
    hook: WgpuDeviceLossHook,
}

impl TestDeviceLoss {
    pub fn resolve_lost(&self, reason: WgpuDeviceLostReason) {
        let name = match reason {
            WgpuDeviceLostReason::Destroyed => "destroyed",
            WgpuDeviceLostReason::Unknown => "unknown",
        };
        resolve_wgpu_device_loss(
            &self.hook,
            WgpuDeviceLostInfo {
                message: format!("lost: {name}"),
                reason,
            },
        );
    }
}

/// Wraps a native device as the host-vocabulary handle a host supplies.
pub fn create_test_wgpu_device(native: WgpuNativeDevice) -> WgpuDevice {
    return WgpuDevice {
        provider: test_provider(),
        handle: Arc::new(native),
    };
}

pub fn test_provider() -> ProviderRef {
    static PROVIDER: std::sync::LazyLock<ProviderRef> =
        std::sync::LazyLock::new(|| Arc::new("test-wgpu-host"));
    return PROVIDER.clone();
}

// ── canvas and canvas context ────────────────────────────────────────────────────────────────

/// The source's canvas element: a resizable extent with exactly ONE WebGPU context.
pub struct TestCanvas {
    pub context: Arc<TestCanvasContext>,
    height: AtomicU32,
    width: AtomicU32,
}

impl TestCanvas {
    pub fn height(&self) -> u32 {
        return self.height.load(Ordering::SeqCst);
    }

    pub fn set_size(&self, width: u32, height: u32) {
        self.width.store(width, Ordering::SeqCst);
        self.height.store(height, Ordering::SeqCst);
    }

    pub fn width(&self) -> u32 {
        return self.width.load(Ordering::SeqCst);
    }
}

/// A `GPUCanvasContext` fake: records configuration and presentation, mints a real noop texture
/// per acquisition, and replays queued acquisition errors.
#[derive(Default)]
pub struct TestCanvasContext {
    pub acquire_count: AtomicU32,
    pub configure_count: AtomicU32,
    pub configuration: Mutex<Option<WgpuCanvasConfiguration>>,
    pub pending_errors: Mutex<VecDeque<WgpuCanvasFrameError>>,
    pub present_count: AtomicU32,
    pub presented: Mutex<Vec<wgpu::Texture>>,
    pub unconfigure_count: AtomicU32,
}

impl TestCanvasContext {
    pub fn fail_next_acquire(&self, error: WgpuCanvasFrameError) {
        self.pending_errors.lock().unwrap().push_back(error);
    }

    pub fn last_configuration(&self) -> Option<WgpuCanvasConfiguration> {
        return self.configuration.lock().unwrap().clone();
    }
}

impl WgpuCanvasContext for TestCanvasContext {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        self.configure_count.fetch_add(1, Ordering::SeqCst);
        *self.configuration.lock().unwrap() = Some(configuration.clone());
    }

    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
        self.acquire_count.fetch_add(1, Ordering::SeqCst);
        if let Some(error) = self.pending_errors.lock().unwrap().pop_front() {
            return Err(error);
        }
        let configuration = self
            .configuration
            .lock()
            .unwrap()
            .clone()
            .expect("getCurrentTexture on an unconfigured canvas context");
        let texture = configuration
            .device
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("test-canvas-frame"),
                size: wgpu::Extent3d {
                    width: configuration.width.max(1),
                    height: configuration.height.max(1),
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: configuration.format,
                usage: configuration.usage,
                view_formats: &[],
            });
        return Ok(create_wgpu_canvas_frame(texture));
    }

    fn present(&self, _device: &WgpuNativeDevice, frame: WgpuCanvasFrame) {
        self.present_count.fetch_add(1, Ordering::SeqCst);
        self.presented.lock().unwrap().push(frame.texture.clone());
    }

    fn unconfigure(&self) {
        self.unconfigure_count.fetch_add(1, Ordering::SeqCst);
        *self.configuration.lock().unwrap() = None;
    }
}

/// A canvas of `width`x`height` with its context.
pub fn create_test_canvas(width: u32, height: u32) -> Arc<TestCanvas> {
    return Arc::new(TestCanvas {
        context: Arc::new(TestCanvasContext::default()),
        height: AtomicU32::new(height),
        width: AtomicU32::new(width),
    });
}

/// Builds a surface around an existing canvas, the way a host's create lane would (TS
/// `createTestWgpuSurface`).
pub fn create_test_wgpu_surface(canvas: &Arc<TestCanvas>) -> SurfaceRef {
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(NativeSurfaceHandle {
        provider: test_provider(),
        handle: canvas.clone(),
    }));
    return surface;
}

/// The canvas a test surface wraps, or `None` for a surface some other host created.
pub fn get_test_canvas(surface: &SurfaceRef) -> Option<Arc<TestCanvas>> {
    let surface = surface.read().unwrap();
    let handle = get_surface_runtime(&*surface).handle.as_ref()?;
    return handle.handle.clone().downcast::<TestCanvas>().ok();
}

/// The canvas context behind a screen target created over a test surface.
pub fn get_test_canvas_context(target: &WgpuScreenRenderTarget) -> Arc<dyn WgpuCanvasContext> {
    return target
        .context
        .handle
        .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
        .expect("a test screen target carries a canvas context")
        .clone();
}

fn create_test_presentation_surface(canvas: &Arc<TestCanvas>) -> WgpuPresentationSurface {
    let width_canvas = canvas.clone();
    let height_canvas = canvas.clone();
    return WgpuPresentationSurface {
        height: Arc::new(move || height_canvas.height() as f32),
        width: Arc::new(move || width_canvas.width() as f32),
    };
}

// ── host ─────────────────────────────────────────────────────────────────────────────────────

/// Counters a test host exposes about its own calls.
#[derive(Default)]
pub struct TestWgpuHostRecord {
    pub acquire_count: AtomicU32,
    pub attach_count: AtomicU32,
    pub refuse_acquire: AtomicBool,
    pub release_count: AtomicU32,
    pub supported: AtomicBool,
}

/// The test host capability (TS `testWgpuHost`): acquisition mints a noop device and attaches the
/// canvas's context; `attach_surface` configures that context for a device already in hand.
pub fn create_test_wgpu_host() -> (HostWgpuCapability, Arc<TestWgpuHostRecord>) {
    let record = Arc::new(TestWgpuHostRecord::default());
    record.supported.store(true, Ordering::SeqCst);
    let acquire_record = record.clone();
    let attach_record = record.clone();
    let release_record = record.clone();
    let supported_record = record.clone();
    let host = HostWgpuCapability {
        provider: test_provider(),
        acquire: Arc::new(move |surface, options| {
            acquire_record.acquire_count.fetch_add(1, Ordering::SeqCst);
            let refused = acquire_record.refuse_acquire.load(Ordering::SeqCst);
            let canvas = get_test_canvas(surface);
            let format = options.format.clone();
            return Box::pin(async move {
                if refused {
                    return Err(test_error("Failed to get WebGPU adapter."));
                }
                let Some(canvas) = canvas else {
                    return Err(test_error("Test surface is not backed by a canvas."));
                };
                let native = create_test_native_device();
                let mut acquisition: WgpuHostAcquisition = create_wgpu_host_acquisition();
                let context: Arc<dyn WgpuCanvasContext> = canvas.context.clone();
                acquisition.context = create_wgpu_surface_context(test_provider(), context);
                acquisition.device = create_test_wgpu_device(native);
                acquisition.format = format.unwrap_or_else(|| "bgra8unorm".to_string());
                acquisition.ownership = WgpuHostAcquisitionOwnership::Flight;
                acquisition.surface = create_test_presentation_surface(&canvas);
                return Ok(acquisition);
            });
        }),
        attach_surface: Arc::new(move |surface, attachment| {
            attach_record.attach_count.fetch_add(1, Ordering::SeqCst);
            let canvas = get_test_canvas(surface)?;
            let native = attachment
                .device
                .handle
                .downcast_ref::<WgpuNativeDevice>()
                .expect("the test host attaches native devices")
                .clone();
            let format = get_wgpu_texture_format(&attachment.format).expect("a known format");
            canvas.context.configure(&WgpuCanvasConfiguration {
                alpha_mode: match attachment.alpha_mode {
                    flight_surface::GpuCanvasAlphaMode::Opaque => wgpu::CompositeAlphaMode::Opaque,
                    flight_surface::GpuCanvasAlphaMode::Premultiplied => {
                        wgpu::CompositeAlphaMode::PreMultiplied
                    }
                },
                device: native,
                format,
                height: canvas.height(),
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
                width: canvas.width(),
            });
            let context: Arc<dyn WgpuCanvasContext> = canvas.context.clone();
            return Some(WgpuSurfaceAttachResult {
                context: create_wgpu_surface_context(test_provider(), context),
                surface: create_test_presentation_surface(&canvas),
            });
        }),
        create: Arc::new(|_window, width, height| {
            let canvas = create_test_canvas(width as u32, height as u32);
            return Some(NativeSurfaceHandle {
                provider: test_provider(),
                handle: canvas,
            });
        }),
        is_supported: Arc::new(move || supported_record.supported.load(Ordering::SeqCst)),
        release: Arc::new(move |acquisition| {
            release_record.release_count.fetch_add(1, Ordering::SeqCst);
            let context = acquisition
                .context
                .handle
                .downcast_ref::<Arc<dyn WgpuCanvasContext>>()
                .expect("a test acquisition carries a canvas context");
            context.unconfigure();
            if let Some(native) = acquisition.device.handle.downcast_ref::<WgpuNativeDevice>() {
                native.device.destroy();
            }
        }),
    };
    return (host, record);
}

fn test_error(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    };
}

// ── render state and screen rig ──────────────────────────────────────────────────────────────

/// A render state on a fresh noop device acquired through the test host for an 800x600 canvas (TS
/// `createWgpuRenderStateForTest`).
pub fn create_wgpu_render_state_for_test(
    options: Option<WgpuRenderStateOptions>,
) -> WgpuRenderState {
    let (host, _) = create_test_wgpu_host();
    let canvas = create_test_canvas(800, 600);
    let surface = create_test_wgpu_surface(&canvas);
    let acquisition = block_on(create_wgpu_acquisition(&host, &surface, None))
        .expect("createWgpuRenderStateForTest: the mock adapter refused a device");
    let mut options = options.unwrap_or_else(test_default);
    if options.format.is_none() {
        options.format = get_wgpu_texture_format(&acquisition.format);
    }
    return create_wgpu_render_state(&acquisition.device, Some(&options));
}

/// The screen half of the test rig (TS `createWgpuScreenRenderTargetForTest`): a screen target over
/// a fresh `width`x`height` test canvas on the state's device.
pub fn create_wgpu_screen_render_target_for_test(
    state: &WgpuRenderState,
    options: Option<WgpuScreenRenderTargetOptions>,
    antialias: bool,
    width: u32,
    height: u32,
) -> Ref<WgpuScreenRenderTarget> {
    let (host, _) = create_test_wgpu_host();
    let canvas = create_test_canvas(width, height);
    let surface = create_test_wgpu_surface(&canvas);
    let mut options = options.unwrap_or_else(test_default);
    if options.format.is_none() {
        options.format = Some(state.format);
    }
    let mut screen =
        create_wgpu_screen_render_target(&host, &state.device, &surface, Some(&options));
    if antialias {
        enable_wgpu_screen_render_target_antialias(&mut screen);
    }
    return Arc::new(std::sync::RwLock::new(screen));
}

/// Opens a pass into a fresh 800x600 screen target (TS `beginWgpuScreenRenderPassForTest`), clearing
/// to transparent black and depth 1 by default.
pub fn begin_wgpu_screen_render_pass_for_test<'a>(
    state: &'a mut WgpuRenderState,
    clear: Option<RenderTargetClear>,
    options: Option<WgpuScreenRenderTargetOptions>,
    antialias: bool,
) -> WgpuRenderPass<'a> {
    let screen = create_wgpu_screen_render_target_for_test(state, options, antialias, 800, 600);
    let clear = clear.unwrap_or(RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    });
    return begin_wgpu_render_pass(state, &WgpuRenderTarget::Screen(screen), Some(&clear));
}

// ── host images ──────────────────────────────────────────────────────────────────────────────

/// One recorded external copy.
#[derive(Clone, Debug, PartialEq)]
pub struct TestImageCopy {
    pub height: u32,
    pub origin: [u32; 3],
    pub premultiplied_alpha: bool,
    pub texture: wgpu::Texture,
    pub width: u32,
}

/// A host image fake (TS image, canvas, bitmap and video elements): a size, a readiness flag, an
/// optional injected copy error, a solid RGBA8 color it writes on copy, and a copy log.
pub struct TestImageSource {
    /// Every `copy_to_texture` call, including ones that fail with `copy_error` (the copy log
    /// below records only the successful ones).
    pub copy_attempts: AtomicU32,
    pub copies: Mutex<Vec<TestImageCopy>>,
    pub copy_error: Mutex<Option<WgpuExternalCopyError>>,
    pub height: AtomicU32,
    pub pixel: [u8; 4],
    pub ready: AtomicBool,
    pub width: AtomicU32,
}

impl TestImageSource {
    pub fn copy_attempt_count(&self) -> u32 {
        return self.copy_attempts.load(Ordering::SeqCst);
    }

    pub fn copy_count(&self) -> usize {
        return self.copies.lock().unwrap().len();
    }

    pub fn set_size(&self, width: u32, height: u32) {
        self.width.store(width, Ordering::SeqCst);
        self.height.store(height, Ordering::SeqCst);
    }
}

impl WgpuExternalImageSource for TestImageSource {
    fn copy_to_texture(
        &self,
        queue: &wgpu::Queue,
        texture: &wgpu::Texture,
        origin: wgpu::Origin3d,
        premultiplied_alpha: bool,
        width: u32,
        height: u32,
    ) -> Result<(), WgpuExternalCopyError> {
        self.copy_attempts.fetch_add(1, Ordering::SeqCst);
        if let Some(error) = self.copy_error.lock().unwrap().clone() {
            return Err(error);
        }
        let mut data = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..width * height {
            data.extend_from_slice(&self.pixel);
        }
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin,
                aspect: wgpu::TextureAspect::All,
            },
            &data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 4),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.copies.lock().unwrap().push(TestImageCopy {
            height,
            origin: [origin.x, origin.y, origin.z],
            premultiplied_alpha,
            texture: texture.clone(),
            width,
        });
        return Ok(());
    }

    fn height(&self) -> u32 {
        return self.height.load(Ordering::SeqCst);
    }

    // The source's element predicates: decoded (`ready`) and at least as large as the copy extent.
    fn is_ready(&self, width: u32, height: u32) -> bool {
        return self.ready.load(Ordering::SeqCst)
            && self.width() >= width
            && self.height() >= height;
    }

    fn width(&self) -> u32 {
        return self.width.load(Ordering::SeqCst);
    }
}

/// A host image of `width`x`height`, decoded (`ready`) or not, with its fake for inspection (TS
/// `createReadyImageElementForTest` and the bare incomplete element).
pub fn create_test_image(
    width: u32,
    height: u32,
    ready: bool,
) -> (Arc<HostImageSource>, Arc<TestImageSource>) {
    let fake = Arc::new(TestImageSource {
        copy_attempts: AtomicU32::new(0),
        copies: Mutex::new(Vec::new()),
        copy_error: Mutex::new(None),
        height: AtomicU32::new(height),
        pixel: [255, 0, 0, 255],
        ready: AtomicBool::new(ready),
        width: AtomicU32::new(width),
    });
    let source: Arc<dyn WgpuExternalImageSource> = fake.clone();
    let image = Arc::new(create_wgpu_external_host_image_source(
        test_provider(),
        source,
    ));
    return (image, fake);
}

/// Image dimensions resolved from the test image fake, as a host's dimension hook would.
pub fn create_test_image_resolver_state() -> ImageResolverState {
    let mut state = create_image_resolver_state();
    register_host_image_dimension_resolver(
        &mut state,
        Arc::new(
            |source: &Arc<HostImageSource>, out: &mut HostImageDimensions| {
                let Some(fake) = source
                    .handle
                    .downcast_ref::<Arc<dyn WgpuExternalImageSource>>()
                else {
                    return false;
                };
                out.width = fake.width();
                out.height = fake.height();
                return true;
            },
        ),
    );
    return state;
}

/// An image resource over a test image, sized through the test dimension hook.
pub fn create_test_image_resource(
    width: u32,
    height: u32,
    ready: bool,
) -> (Ref<ImageResource>, Arc<TestImageSource>) {
    let (image, fake) = create_test_image(width, height, ready);
    let resource = create_image_resource(image, &create_test_image_resolver_state());
    return (resource, fake);
}

// ── command recording ────────────────────────────────────────────────────────────────────────

/// Installs a command observer on `native` that appends every recorded command (the stand-in for
/// the source's spies on GPU call arguments, Principal cafc5d6b item D).
pub fn record_test_commands(native: &WgpuNativeDevice) -> Arc<Mutex<Vec<WgpuCommandRecord>>> {
    let records = Arc::new(Mutex::new(Vec::new()));
    let sink = records.clone();
    set_wgpu_native_device_command_observer(
        native,
        Some(Arc::new(move |record: &WgpuCommandRecord| {
            sink.lock().unwrap().push(record.clone());
        })),
    );
    return records;
}

/// The most recent render-pass begin among the recorded commands.
pub fn last_render_pass_begin(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> WgpuRenderPassBeginRecord {
    return records
        .lock()
        .unwrap()
        .iter()
        .rev()
        .find_map(|record| match record {
            WgpuCommandRecord::BeginRenderPass(begin) => Some(begin.clone()),
            _ => None,
        })
        .expect("a recorded render pass");
}

/// Every recorded texture write, in order.
pub fn recorded_texture_writes(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuTextureWriteRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::WriteTexture(write) => Some(write.clone()),
            _ => None,
        })
        .collect();
}

/// Every recorded buffer write, in order.
pub fn recorded_buffer_writes(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuBufferWriteRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::WriteBuffer(write) => Some(write.clone()),
            _ => None,
        })
        .collect();
}

/// Every recorded pipeline creation, in order.
pub fn recorded_pipelines(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuRenderPipelineRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::CreateRenderPipeline(pipeline) => Some(pipeline.clone()),
            _ => None,
        })
        .collect();
}

/// The host-order f32 values of recorded bytes.
pub fn bytes_to_f32(data: &[u8]) -> Vec<f32> {
    return data
        .chunks_exact(4)
        .map(|chunk| f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
}

// ── canvas 2D ────────────────────────────────────────────────────────────────────────────────

/// A Canvas 2D context fake (the source's jsdom/canvas 2D context): every call is logged as a
/// readable line, and text measures `MEASURE_PER_CHAR` pixels per character.
#[derive(Default)]
pub struct TestCanvas2DContext {
    pub calls: Mutex<Vec<String>>,
    pub font: Mutex<String>,
}

pub const MEASURE_PER_CHAR: f32 = 8.0;

/// A fresh recording 2D context fake.
pub fn create_test_canvas_2d_context() -> Arc<TestCanvas2DContext> {
    return Arc::new(test_default::<TestCanvas2DContext>());
}

impl TestCanvas2DContext {
    pub fn calls(&self) -> Vec<String> {
        return self.calls.lock().unwrap().clone();
    }

    pub fn count(&self, prefix: &str) -> usize {
        return self
            .calls()
            .iter()
            .filter(|call| call.starts_with(prefix))
            .count();
    }

    fn log(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

impl Canvas2DContext for TestCanvas2DContext {
    fn begin_path(&self) {
        self.log("beginPath".to_string());
    }

    fn clear_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("clearRect({x},{y},{width},{height})"));
    }

    fn clip(&self) {
        self.log("clip".to_string());
    }

    fn fill_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("fillRect({x},{y},{width},{height})"));
    }

    fn fill_text(&self, text: &str, x: f32, y: f32) {
        self.log(format!("fillText({text},{x},{y})"));
    }

    fn line_to(&self, x: f32, y: f32) {
        self.log(format!("lineTo({x},{y})"));
    }

    fn measure_text(&self, text: &str) -> CanvasTextMetrics {
        return CanvasTextMetrics {
            width: text.chars().count() as f32 * MEASURE_PER_CHAR,
        };
    }

    fn move_to(&self, x: f32, y: f32) {
        self.log(format!("moveTo({x},{y})"));
    }

    fn rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("rect({x},{y},{width},{height})"));
    }

    fn restore(&self) {
        self.log("restore".to_string());
    }

    fn save(&self) {
        self.log("save".to_string());
    }

    fn set_fill_style(&self, style: &str) {
        self.log(format!("fillStyle={style}"));
    }

    fn set_font(&self, font: &str) {
        *self.font.lock().unwrap() = font.to_string();
        self.log(format!("font={font}"));
    }

    fn set_global_alpha(&self, alpha: f32) {
        self.log(format!("globalAlpha={alpha}"));
    }

    fn set_line_width(&self, width: f32) {
        self.log(format!("lineWidth={width}"));
    }

    fn set_stroke_style(&self, style: &str) {
        self.log(format!("strokeStyle={style}"));
    }

    fn set_text_align(&self, align: &str) {
        self.log(format!("textAlign={align}"));
    }

    fn set_text_baseline(&self, baseline: &str) {
        self.log(format!("textBaseline={baseline}"));
    }

    fn set_transform(&self, a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) {
        self.log(format!("setTransform({a},{b},{c},{d},{e},{f})"));
    }

    fn stroke(&self) {
        self.log("stroke".to_string());
    }

    fn stroke_rect(&self, x: f32, y: f32, width: f32, height: f32) {
        self.log(format!("strokeRect({x},{y},{width},{height})"));
    }
}

/// One surface the test canvas host created: its size and its 2D context fake.
pub struct TestCanvasSurfaceRecord {
    pub context: Arc<TestCanvas2DContext>,
    pub height: f32,
    pub surface: Ref<CanvasSurface>,
    pub width: f32,
}

/// What the test canvas host did: every surface it created, and how many it destroyed.
#[derive(Default)]
pub struct TestCanvasHostRecord {
    pub destroyed: AtomicU32,
    pub refuse: AtomicBool,
    pub surfaces: Mutex<Vec<TestCanvasSurfaceRecord>>,
}

impl TestCanvasHostRecord {
    pub fn created_count(&self) -> usize {
        return self.surfaces.lock().unwrap().len();
    }

    pub fn destroyed_count(&self) -> u32 {
        return self.destroyed.load(Ordering::SeqCst);
    }

    pub fn last_context(&self) -> Arc<TestCanvas2DContext> {
        return self
            .surfaces
            .lock()
            .unwrap()
            .last()
            .expect("a created surface")
            .context
            .clone();
    }

    pub fn last_size(&self) -> (f32, f32) {
        let surfaces = self.surfaces.lock().unwrap();
        let last = surfaces.last().expect("a created surface");
        return (last.width, last.height);
    }
}

/// A canvas host whose surfaces carry a recording 2D context (TS `createTestCanvasHost`).
pub fn create_test_canvas_host() -> (HostCanvasCapability, Arc<TestCanvasHostRecord>) {
    let record = Arc::new(TestCanvasHostRecord::default());
    let create_record = record.clone();
    let destroy_record = record.clone();
    let host = HostCanvasCapability {
        provider: test_provider(),
        acquire: Arc::new(|_, _| None),
        create: Arc::new(|_, _, _, _| None),
        create_surface: Arc::new(move |width, height| {
            if create_record.refuse.load(Ordering::SeqCst) {
                return None;
            }
            let context = create_test_canvas_2d_context();
            let surface: Ref<CanvasSurface> = allocate_surface(None);
            surface.write().unwrap().context = CanvasRenderingContext2D {
                provider: test_provider(),
                handle: context.clone(),
            };
            create_record
                .surfaces
                .lock()
                .unwrap()
                .push(TestCanvasSurfaceRecord {
                    context,
                    height,
                    surface: surface.clone(),
                    width,
                });
            return Some(surface);
        }),
        destroy_surface: Arc::new(move |_surface| {
            destroy_record.destroyed.fetch_add(1, Ordering::SeqCst);
        }),
        release: Arc::new(|_| {}),
    };
    return (host, record);
}

/// An image host whose surface images are ready test images (TS `createTestImageHost`).
pub fn create_test_image_host() -> HostImageCapability {
    return HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: Some(Arc::new(|_surface| {
            let (resource, _) = create_test_image_resource(64, 64, true);
            return resource;
        })),
        load_image_from_url: Arc::new(|_, _, _| {
            let (resource, _) = create_test_image_resource(1, 1, false);
            return Box::pin(async move {
                return resource;
            });
        }),
        provider: test_provider(),
    };
}

/// Installs the test canvas and image hosts on a state (TS `setTestHosts`).
pub fn set_test_hosts(state: &mut WgpuRenderState) -> Arc<TestCanvasHostRecord> {
    let (canvas_host, record) = create_test_canvas_host();
    state.canvas_host = Some(canvas_host);
    state.image_host = Some(create_test_image_host());
    return record;
}

// ── scene fixtures ───────────────────────────────────────────────────────────────────────────

/// A ready 4x4 texture entry on the state's device (TS `makeTexture`).
pub fn create_test_texture_entry(state: &WgpuRenderState) -> Ref<WgpuTextureEntry> {
    let (image, _) = create_test_image(4, 4, true);
    return create_wgpu_texture_entry(state, 4, 4, &image).expect("a ready test image");
}

/// A color scale/bias with the given channels (TS `ct`).
pub fn create_test_color_scale_bias(
    red_scale: f32,
    green_scale: f32,
    blue_scale: f32,
    alpha_scale: f32,
    red_bias: f32,
    green_bias: f32,
    blue_bias: f32,
    alpha_bias: f32,
) -> flight_materials::ColorScaleBias {
    let mut out = flight_materials::contract::create_color_scale_bias();
    out.red_scale = red_scale;
    out.green_scale = green_scale;
    out.blue_scale = blue_scale;
    out.alpha_scale = alpha_scale;
    out.red_bias = red_bias;
    out.green_bias = green_bias;
    out.blue_bias = blue_bias;
    out.alpha_bias = alpha_bias;
    return out;
}

/// A uniform multiply-only scale (TS `ct(scale)`): red scaled, the other channels identity.
pub fn create_test_red_scale(red_scale: f32) -> WgpuColorScaleBiasInput {
    return WgpuColorScaleBiasInput::ColorScaleBias(create_test_color_scale_bias(
        red_scale, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0,
    ));
}

/// Compact per-item tint data (TS `{ tint }` material data).
pub fn create_test_tint(tint: u32) -> flight_materials::TintMaterialData {
    let mut out: flight_materials::TintMaterialData = flight_entity::allocate_entity();
    out.tint = tint;
    return out;
}

/// A render proxy over a plain display object, with identity transform and full alpha (TS
/// `makeProxy`).
pub fn create_test_proxy(
    state: &mut WgpuRenderState,
) -> flight_render::RenderProxy2D<WgpuRenderState> {
    let node: flight_node::NodeRef = flight_scene2d::create_display_object();
    return flight_render::create_render_proxy_2d(state, &node);
}

/// A render proxy for `node` on `state`.
pub fn create_test_proxy_for(
    state: &mut WgpuRenderState,
    node: &flight_node::NodeRef,
) -> flight_render::RenderProxy2D<WgpuRenderState> {
    return flight_render::create_render_proxy_2d(state, node);
}

/// A render state with an open 800x600 screen pass (TS `makeState`), the pass record left open on
/// the state so draws record into it.
pub fn create_test_state_in_pass() -> WgpuRenderState {
    let mut state = create_wgpu_render_state_for_test(None);
    open_test_screen_pass(&mut state);
    return state;
}

/// Opens an 800x600 screen pass on `state` and leaves it open (TS `beginWgpuScreenRenderPassForTest`
/// without holding the pass handle).
pub fn open_test_screen_pass(state: &mut WgpuRenderState) {
    begin_wgpu_screen_render_pass_for_test(state, None, None, false);
}

/// Whether `buffer` has been destroyed, observed through real validation: a write to a destroyed
/// buffer raises a validation error inside an error scope. The buffer must carry `COPY_DST`.
pub fn is_test_buffer_destroyed(native: &WgpuNativeDevice, buffer: &wgpu::Buffer) -> bool {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    native.queue.write_buffer(buffer, 0, &[0; 4]);
    return block_on(scope.pop()).is_some();
}

// ── shapes ───────────────────────────────────────────────────────────────────────────────────

/// An empty shape whose bounds measure through the default bounds commands (the source's
/// registered shape bounds), so raster paths see real local bounds.
pub fn create_test_shape() -> Ref<flight_shape::Shape> {
    let shape = flight_shape::create_shape();
    let bounds_state = shape.read().unwrap().data.bounds_state.clone();
    flight_shape::register_default_shape_bounds_commands(&bounds_state);
    return shape;
}

/// A plain solid rectangle (TS `solidShape`): precisely the shape the mesh strategy tessellates.
pub fn create_test_solid_shape() -> Ref<flight_shape::Shape> {
    let shape = create_test_shape();
    flight_shape::append_shape_begin_fill(&shape, 0x00cc00ff, None);
    flight_shape::append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
    flight_shape::append_shape_end_fill(&shape);
    return shape;
}

/// A gradient-filled rectangle (TS `gradientShape`): a fill with no tessellated form.
pub fn create_test_gradient_shape() -> Ref<flight_shape::Shape> {
    let shape = create_test_shape();
    flight_shape::append_shape_begin_gradient_fill(
        &shape,
        flight_shape::GradientType::Linear,
        &[0xff0000ff, 0x0000ffff],
        &[1.0, 1.0],
        &[0.0, 255.0],
        None,
        None,
        None,
        None,
    );
    flight_shape::append_shape_rectangle(&shape, 8.0, 8.0, 32.0, 24.0);
    flight_shape::append_shape_end_fill(&shape);
    return shape;
}

/// A stroked rectangle ring of `thickness` and `color`.
pub fn append_test_line_style(shape: &Ref<flight_shape::Shape>, thickness: f64, color: u32) {
    flight_shape::append_shape_line_style(
        shape,
        Some(thickness),
        color,
        None,
        None,
        None,
        None,
        None,
        None,
    );
}

/// A proxy over `node` carrying fresh shape renderer data (TS `makeShapeProxy` with
/// `wgpuShapeRenderer.createData`).
pub fn create_test_shape_proxy(
    state: &mut WgpuRenderState,
    node: &flight_node::NodeRef,
) -> flight_render::RenderProxy2D<WgpuRenderState> {
    let mut proxy = create_test_proxy_for(state, node);
    proxy.renderer_data = create_wgpu_shape_data(state, node);
    return proxy;
}

/// A rasterizer that counts its calls and records the last command stream it replayed.
pub fn create_test_counting_rasterizer() -> (
    flight_render::ShapeRasterizer<WgpuRenderState>,
    Arc<Mutex<Vec<Vec<flight_shape::ShapeCommandToken>>>>,
) {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let sink = calls.clone();
    let rasterizer: flight_render::ShapeRasterizer<WgpuRenderState> =
        Arc::new(move |_context, commands, _state| {
            sink.lock().unwrap().push(commands.to_vec());
        });
    return (rasterizer, calls);
}

/// Whether `texture` has been destroyed: creating a view of a destroyed texture is a validation
/// error, while a live one's never is.
pub fn is_test_texture_destroyed(native: &WgpuNativeDevice, texture: &wgpu::Texture) -> bool {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let _ = texture.create_view(&wgpu::TextureViewDescriptor::default());
    return block_on(scope.pop()).is_some();
}

/// Installs the test canvas host and an image host whose surface images are not yet ready, so a
/// raster path allocates its surface but never acquires a GPU cache entry.
pub fn set_test_hosts_with_unready_images(
    state: &mut WgpuRenderState,
) -> Arc<TestCanvasHostRecord> {
    let record = set_test_hosts(state);
    let mut image_host = create_test_image_host();
    image_host.create_image_from_surface = Some(Arc::new(|_surface| {
        let (resource, _) = create_test_image_resource(64, 64, false);
        return resource;
    }));
    state.image_host = Some(image_host);
    return record;
}

// ── textured nodes ───────────────────────────────────────────────────────────────────────────

/// A 2D texture over a ready `width`x`height` host image.
pub fn create_test_texture(width: u32, height: u32) -> Ref<flight_texture::Texture> {
    let (image, _) = create_test_image_resource(width, height, true);
    let source: flight_texture::TextureSourceRef = image;
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(source);
    return Arc::new(std::sync::RwLock::new(flight_texture::Texture::Texture2D(
        texture,
    )));
}

/// A sprite showing a ready `width`x`height` image, with the image texture resolver registered on
/// `state` so the sprite resolves.
pub fn create_test_sprite(
    state: &mut WgpuRenderState,
    width: u32,
    height: u32,
) -> Ref<flight_scene2d::Sprite> {
    register_wgpu_image_texture_resolver(state);
    let sprite = flight_scene2d::create_sprite();
    sprite.write().unwrap().data.texture = Some(create_test_texture(width, height));
    return sprite;
}

/// A bare 2D texture over a ready `width`x`height` host image.
pub fn create_test_texture_2d(width: u32, height: u32) -> Ref<flight_texture::Texture2D> {
    let (image, _) = create_test_image_resource(width, height, true);
    let source: flight_texture::TextureSourceRef = image;
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(source);
    return Arc::new(std::sync::RwLock::new(texture));
}

/// An atlas over a ready `width`x`height` image with one region per `(x, y, w, h, rotation)`.
pub fn create_test_atlas(
    width: u32,
    height: u32,
    regions: &[(
        f32,
        f32,
        f32,
        f32,
        flight_textureatlas::TextureAtlasRotation,
    )],
) -> Ref<flight_textureatlas::TextureAtlas> {
    let atlas = flight_textureatlas::create_texture_atlas();
    {
        let mut atlas = atlas.write().unwrap();
        atlas.texture = Some(create_test_texture_2d(width, height));
        for (index, (x, y, w, h, rotation)) in regions.iter().enumerate() {
            let region = flight_textureatlas::create_texture_atlas_region();
            {
                let mut region = region.write().unwrap();
                region.id = index as i32;
                region.x = *x;
                region.y = *y;
                region.width = *w;
                region.height = *h;
                region.rotation = *rotation;
            }
            atlas.regions.push(region);
        }
    }
    return atlas;
}

/// Prepares `node`'s subtree on `state` and returns the proxy store (TS `prepareScene2DRender`).
pub fn prepare_test_scene(
    state: &mut WgpuRenderState,
    node: &flight_node::NodeRef,
) -> flight_render::RenderProxies2D<WgpuRenderState> {
    let mut proxies: flight_render::RenderProxies2D<WgpuRenderState> = test_default();
    flight_render::prepare_scene_2d_render(state, &mut proxies, node);
    return proxies;
}

/// An owned proxy for `node` from a prepared store, so a test can redraw it while mutating state.
pub fn get_wgpu_render_proxy_for_test(
    state: &mut WgpuRenderState,
    proxies: &mut flight_render::RenderProxies2D<WgpuRenderState>,
    node: &flight_node::NodeRef,
) -> flight_render::RenderProxy2D<WgpuRenderState> {
    let prepared = flight_render::get_or_create_render_proxy_2d(state, proxies, node);
    let transform = prepared.transform_2d.clone();
    let alpha = prepared.alpha;
    let mut proxy = flight_render::create_render_proxy_2d(state, node);
    proxy.transform_2d = transform;
    proxy.alpha = alpha;
    return proxy;
}

// ── text ─────────────────────────────────────────────────────────────────────────────────────

/// A rich text field of `width`x`height` showing `text` (TS `createRichText({ data })`).
pub fn create_test_rich_text(text: &str, width: f32, height: f32) -> Ref<flight_text::RichText> {
    let rich_text = flight_text::create_rich_text(None);
    {
        let mut rich_text = rich_text.write().unwrap();
        rich_text.data.text = text.to_string();
        rich_text.data.width = width;
        rich_text.data.height = height;
    }
    return rich_text;
}

/// A proxy over a rich text node carrying fresh rich text renderer data.
pub fn create_test_rich_text_proxy(
    state: &mut WgpuRenderState,
    rich_text: &Ref<flight_text::RichText>,
) -> flight_render::RenderProxy2D<WgpuRenderState> {
    let node: flight_node::NodeRef = rich_text.clone();
    let mut proxy = create_test_proxy_for(state, &node);
    proxy.renderer_data = create_wgpu_rich_text_data(state, &node);
    return proxy;
}

/// An overlay that stamps a marker rect onto the field canvas, so a test can see it ran.
pub fn stamp_test_overlay(
    context: &flight_host::CanvasRenderingContext2D,
    _source: &Ref<flight_text::RichText>,
    _result: &flight_textlayout::TextLayoutResult,
    _field_w: f32,
    _field_h: f32,
    _text: &str,
) {
    context.handle.fill_rect(-1.0, -1.0, -1.0, -1.0);
}

pub const TEST_OVERLAY_STAMP: &str = "fillRect(-1,-1,-1,-1)";
