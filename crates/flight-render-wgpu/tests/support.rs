//! Test doubles for the source's browser scaffolding (TS `wgpuHost.ts` and `wgpuTestHelper.ts`).
//! Devices are real `wgpu` devices on the noop backend (D17): resources, validation and buffer
//! readback are real, while presentation goes through a canvas-context fake and host images through
//! an external-image fake. These are test fixtures only, never a public provider.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_host::{
    HostImageSource, HostSpawnCapability, NativeSurfaceHandle, ProviderRef, WgpuDevice,
};
use flight_image::contract::{
    HostImageDimensions, ImageResolverState, ImageResource, create_image_resolver_state,
    create_image_resource, register_host_image_dimension_resolver,
};
use flight_render_wgpu::*;
use flight_surface::{
    HostWgpuCapability, SurfaceBase, SurfaceRef, WgpuHostAcquisition, WgpuHostAcquisitionOwnership,
    WgpuPresentationSurface, WgpuSurfaceAttachResult, allocate_surface,
    create_wgpu_host_acquisition, get_surface_runtime,
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

// ── adapters, validation probes and nodes ────────────────────────────────────────────────────

/// A noop adapter reporting exactly `features`, and `limits` when given (otherwise wgpu's default
/// limits), for capability queries that read an adapter before any device exists.
pub fn create_test_adapter(
    features: wgpu::Features,
    limits: Option<wgpu::Limits>,
) -> wgpu::Adapter {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    descriptor.backend_options.noop.features = Some(features);
    descriptor.backend_options.noop.limits = Some(limits.unwrap_or_else(test_default));
    let instance = wgpu::Instance::new(descriptor);
    return block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))
        .expect("the noop adapter");
}

/// Whether `buffer` has been destroyed, observed through real validation: a write to a destroyed
/// buffer raises a validation error inside an error scope; a live buffer accepts it. The buffer must
/// carry `COPY_DST`.
pub fn is_test_buffer_destroyed(native: &WgpuNativeDevice, buffer: &wgpu::Buffer) -> bool {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    native.queue.write_buffer(buffer, 0, &[0; 4]);
    return block_on(scope.pop()).is_some();
}

/// Whether the device still accepts work: creating a buffer raises no validation error.
pub fn is_test_device_usable(native: &WgpuNativeDevice) -> bool {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("test-device-probe"),
        size: 4,
        usage: wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    let usable = block_on(scope.pop()).is_none();
    buffer.destroy();
    return usable;
}

/// A minimal 2D node kind (common fields plus a 2D transform), for prepare/proxy paths that need a
/// scene root without a scene package.
#[derive(Default)]
pub struct TestNode {
    pub fields: flight_node::contract::NodeFields,
    pub transform2d: flight_node::HasTransform2D,
    pub transform2d_runtime: flight_node::HasTransform2DRuntime,
}

impl flight_entity::Entity for TestNode {
    fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

impl flight_node::contract::Node for TestNode {
    fn node_fields(&self) -> &flight_node::contract::NodeFields {
        return &self.fields;
    }

    fn node_fields_mut(&mut self) -> &mut flight_node::contract::NodeFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn std::any::Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        return self;
    }

    fn as_transform2d_node(&self) -> Option<&dyn flight_node::Transform2DNode> {
        return Some(self);
    }

    fn as_transform2d_node_mut(&mut self) -> Option<&mut dyn flight_node::Transform2DNode> {
        return Some(self);
    }
}

impl flight_node::Transform2DNode for TestNode {
    fn transform2d(&self) -> flight_node::contract::Transform2DRef<'_> {
        return self.transform2d.as_ref();
    }

    fn transform2d_mut(&mut self) -> flight_node::contract::Transform2DMut<'_> {
        return self.transform2d.as_mut();
    }

    fn transform2d_runtime(&self) -> &flight_node::HasTransform2DRuntime {
        return &self.transform2d_runtime;
    }

    fn transform2d_runtime_mut(&mut self) -> &mut flight_node::HasTransform2DRuntime {
        return &mut self.transform2d_runtime;
    }
}

/// A shared 2D test node of `kind`.
pub fn create_test_node(kind: &str) -> flight_node::NodeRef {
    let node: TestNode = flight_node::create_node(kind.to_string());
    let out: flight_node::NodeRef = Arc::new(std::sync::RwLock::new(node));
    return out;
}

/// Renderer data with no payload, for node renderers whose data only needs to exist.
#[derive(Default)]
pub struct TestRendererData {
    pub renderer_data: flight_node::contract::RendererDataFields,
}

flight_node::impl_renderer_data!(TestRendererData);

/// A fresh `TestRendererData` handle.
pub fn create_test_renderer_data() -> flight_node::RendererDataRef {
    let data: Arc<std::sync::RwLock<TestRendererData>> =
        Arc::new(std::sync::RwLock::new(test_default()));
    return data;
}

// ── validation observers ─────────────────────────────────────────────────────────────────────

/// Runs `body` inside a validation error scope on `native`'s device and returns its value with the
/// first validation error it raised, if any: the observable stand-in for a source spy on a GPU call,
/// since a real noop device validates every call.
pub fn capture_wgpu_validation_error<T>(
    native: &WgpuNativeDevice,
    body: impl FnOnce() -> T,
) -> (T, Option<wgpu::Error>) {
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let value = body();
    let error = block_on(scope.pop());
    return (value, error);
}

/// The first validation error `work` raises, without a value.
pub fn capture_test_validation_error(
    native: &WgpuNativeDevice,
    work: impl FnOnce(),
) -> Option<wgpu::Error> {
    return capture_wgpu_validation_error(native, work).1;
}

/// Whether `texture` has been destroyed (the stand-in for a spy on `GPUTexture.destroy`): creating
/// a view of a destroyed texture is a validation error, while a live one's never is.
pub fn is_wgpu_texture_destroyed(native: &WgpuNativeDevice, texture: &wgpu::Texture) -> bool {
    return capture_test_validation_error(native, || {
        let _ = texture.create_view(&wgpu::TextureViewDescriptor::default());
    })
    .is_some();
}

// ── texture sources ──────────────────────────────────────────────────────────────────────────

/// A texture source of an open declared kind with no payload (the source's bare
/// `{ kind, width, height, version }` entity), for resolver-dispatch tests.
#[derive(Debug, Default)]
pub struct TestTextureSource {
    pub fields: flight_texture::TextureSourceFields,
}

impl flight_entity::Entity for TestTextureSource {
    fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

impl flight_texture::TextureSource for TestTextureSource {
    fn texture_source_fields(&self) -> &flight_texture::TextureSourceFields {
        return &self.fields;
    }

    fn texture_source_fields_mut(&mut self) -> &mut flight_texture::TextureSourceFields {
        return &mut self.fields;
    }
}

/// A 2D texture over a `width`x`height` source declaring `kind`.
pub fn create_test_texture_with_kind(
    kind: &str,
    width: u32,
    height: u32,
) -> flight_texture::Texture {
    let mut source: TestTextureSource = flight_entity::allocate_entity();
    source.fields.kind = kind.to_string();
    source.fields.width = width;
    source.fields.height = height;
    let source: flight_texture::TextureSourceRef = Arc::new(std::sync::RwLock::new(source));
    return flight_texture::create_texture(Some(&flight_texture::CreateTextureOptions::Texture2D(
        flight_texture::CreateTexture2DOptions {
            source: Some(source),
            ..test_default()
        },
    )));
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
