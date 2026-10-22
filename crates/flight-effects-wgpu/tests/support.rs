//! Test doubles for the source's GPU mock (`installWgpuMock`, `createWgpuRenderStateForTest`,
//! `beginWgpuScreenRenderPassForTest`). Devices are real `wgpu` devices on the noop backend (D17):
//! pipelines, bind groups and passes are validated for real, and the values the source's spies read
//! (uniform bytes, load choices, bind groups, pipelines, draws) are observed through render-wgpu's
//! command recording. These are test fixtures only, never a public provider.

#![allow(dead_code)]

use flight_render::RenderTargetClear;
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Waker};

use flight_effects::{EffectFields, EffectRef};
use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_host::{HostSpawnCapability, NativeSurfaceHandle, ProviderRef, WgpuDevice};
use flight_log::{
    LogData, LogEntry, LogStateRef, LogValue, MemoryLogSink, add_log_sink, create_log_state,
    create_memory_log_sink, get_memory_log_sink_entries,
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

pub fn test_provider() -> ProviderRef {
    static PROVIDER: std::sync::LazyLock<ProviderRef> =
        std::sync::LazyLock::new(|| Arc::new("test-effects-wgpu-host"));
    return PROVIDER.clone();
}

/// A spawn capability that drops continuations: these tests never observe device loss.
pub fn test_host_spawn() -> HostSpawnCapability {
    return HostSpawnCapability {
        provider: test_provider(),
        spawn: Arc::new(|_future| {}),
    };
}

/// A fresh real device on the noop backend.
pub fn create_test_native_device() -> WgpuNativeDevice {
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

/// Wraps a native device as the host-vocabulary handle a host supplies.
pub fn create_test_wgpu_device(native: WgpuNativeDevice) -> WgpuDevice {
    return WgpuDevice {
        provider: test_provider(),
        handle: Arc::new(native),
    };
}

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

    pub fn width(&self) -> u32 {
        return self.width.load(Ordering::SeqCst);
    }
}

/// A `GPUCanvasContext` fake: records configuration and mints a real noop texture per acquisition.
#[derive(Default)]
pub struct TestCanvasContext {
    pub configuration: Mutex<Option<WgpuCanvasConfiguration>>,
}

impl WgpuCanvasContext for TestCanvasContext {
    fn configure(&self, configuration: &WgpuCanvasConfiguration) {
        *self.configuration.lock().unwrap() = Some(configuration.clone());
    }

    fn get_current_texture(&self) -> Result<WgpuCanvasFrame, WgpuCanvasFrameError> {
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

    fn present(&self, _device: &WgpuNativeDevice, _frame: WgpuCanvasFrame) {}

    fn unconfigure(&self) {
        *self.configuration.lock().unwrap() = None;
    }
}

pub fn create_test_canvas(width: u32, height: u32) -> Arc<TestCanvas> {
    return Arc::new(TestCanvas {
        context: Arc::new(TestCanvasContext::default()),
        height: AtomicU32::new(height),
        width: AtomicU32::new(width),
    });
}

pub fn create_test_wgpu_surface(canvas: &Arc<TestCanvas>) -> SurfaceRef {
    let surface: SurfaceRef = allocate_surface::<SurfaceBase>(Some(NativeSurfaceHandle {
        provider: test_provider(),
        handle: canvas.clone(),
    }));
    return surface;
}

pub fn get_test_canvas(surface: &SurfaceRef) -> Option<Arc<TestCanvas>> {
    let surface = surface.read().unwrap();
    let handle = get_surface_runtime(&*surface).handle.as_ref()?;
    return handle.handle.clone().downcast::<TestCanvas>().ok();
}

fn create_test_presentation_surface(canvas: &Arc<TestCanvas>) -> WgpuPresentationSurface {
    let width_canvas = canvas.clone();
    let height_canvas = canvas.clone();
    return WgpuPresentationSurface {
        height: Arc::new(move || height_canvas.height() as f32),
        width: Arc::new(move || width_canvas.width() as f32),
    };
}

fn test_error(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    };
}

/// The test host capability: acquisition mints a noop device and attaches the canvas's context.
pub fn create_test_wgpu_host() -> HostWgpuCapability {
    return HostWgpuCapability {
        provider: test_provider(),
        acquire: Arc::new(move |surface, options| {
            let canvas = get_test_canvas(surface);
            let format = options.format.clone();
            return Box::pin(async move {
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
        is_supported: Arc::new(|| true),
        release: Arc::new(|_acquisition| {}),
    };
}

/// A render state on a fresh noop device acquired through the test host for an 800x600 canvas (TS
/// `createWgpuRenderStateForTest`).
pub fn create_wgpu_render_state_for_test(
    options: Option<WgpuRenderStateOptions>,
) -> WgpuRenderState {
    let host = create_test_wgpu_host();
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

/// Opens a pass into a fresh `width`x`height` screen target (TS
/// `beginWgpuScreenRenderPassForTest`), clearing to transparent black and depth 1.
pub fn begin_wgpu_screen_render_pass_for_test(
    state: &mut WgpuRenderState,
    width: u32,
    height: u32,
) -> WgpuRenderPass<'_> {
    let host = create_test_wgpu_host();
    let canvas = create_test_canvas(width, height);
    let surface = create_test_wgpu_surface(&canvas);
    let options = WgpuScreenRenderTargetOptions {
        format: Some(state.format),
        ..test_default()
    };
    let screen = create_wgpu_screen_render_target(&host, &state.device, &surface, Some(&options));
    let screen = Arc::new(RwLock::new(screen));
    let clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
    return begin_wgpu_render_pass(state, &WgpuRenderTarget::Screen(screen), Some(&clear));
}

/// A sampleable texture target of `width`x`height` in the state's format.
pub fn create_test_target(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
) -> Ref<WgpuTextureRenderTarget> {
    return Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state,
        width as f32,
        height as f32,
        None,
        None,
        None,
    )));
}

/// Runs `body` inside an open frame (a live command encoder and no enclosing pass), then submits.
pub fn with_test_frame<T>(
    state: &mut WgpuRenderState,
    body: impl FnOnce(&mut WgpuRenderState) -> T,
) -> T {
    begin_wgpu_frame(state);
    let value = body(state);
    submit_wgpu_frame(state);
    return value;
}

/// Installs a command observer on the state's device that appends every recorded command (the
/// stand-in for the source's spies on GPU calls).
pub fn record_test_commands(state: &WgpuRenderState) -> Arc<Mutex<Vec<WgpuCommandRecord>>> {
    let native = get_wgpu_render_state_native_device(state);
    let records = Arc::new(Mutex::new(Vec::new()));
    let sink = records.clone();
    set_wgpu_native_device_command_observer(
        &native,
        Some(Arc::new(move |record: &WgpuCommandRecord| {
            sink.lock().unwrap().push(record.clone());
        })),
    );
    return records;
}

/// Forgets everything recorded so far.
pub fn clear_test_commands(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) {
    records.lock().unwrap().clear();
}

/// The floats of every 256-byte uniform-slot write the effect passes recorded, in order (the
/// stand-in for the source's `setUniforms` snapshots).
pub fn recorded_effect_uniforms(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<Vec<f32>> {
    return recorded_effect_uniform_writes(records)
        .into_iter()
        .map(|write| write.1)
        .collect();
}

/// Every 256-byte uniform-slot write with its ring offset and floats, in order.
pub fn recorded_effect_uniform_writes(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<(u64, Vec<f32>)> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::WriteBuffer(write) if write.data.len() == 256 => Some((
                write.offset,
                write
                    .data
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .map(|bytes| f32::from_ne_bytes(*bytes))
                    .collect(),
            )),
            _ => None,
        })
        .collect();
}

/// The ints of the same uniform-slot writes (the source's `Int32Array` view).
pub fn recorded_effect_uniform_ints(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<Vec<i32>> {
    return recorded_effect_uniform_writes(records)
        .into_iter()
        .map(|(_, floats)| floats.iter().map(|value| value.to_bits() as i32).collect())
        .collect();
}

/// Every recorded render-pass begin, in order.
pub fn recorded_pass_begins(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuRenderPassBeginRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::BeginRenderPass(begin) => Some(begin.clone()),
            _ => None,
        })
        .collect();
}

/// Every recorded render-pipeline creation, in order.
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

/// Every recorded bind-group creation, in order.
pub fn recorded_bind_groups(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuBindGroupRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::CreateBindGroup(bind_group) => Some(bind_group.clone()),
            _ => None,
        })
        .collect();
}

/// Every bind group set on a pass, in order.
pub fn recorded_set_bind_groups(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<WgpuSetBindGroupRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::SetBindGroup(set) => Some(set.clone()),
            _ => None,
        })
        .collect();
}

/// Every pipeline set on a pass, in order.
pub fn recorded_set_pipelines(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<wgpu::RenderPipeline> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::SetPipeline(pipeline) => Some(pipeline.clone()),
            _ => None,
        })
        .collect();
}

/// Every draw, in order.
pub fn recorded_draws(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<WgpuDrawRecord> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::Draw(draw) => Some(*draw),
            _ => None,
        })
        .collect();
}

/// The texture views each recorded draw sampled at group 1 (its source), in draw order: the view
/// of the bind group set at index 1 before each draw.
#[allow(clippy::mutable_key_type)] // wgpu handles hash by id; their interior mutability never changes it
pub fn recorded_draw_sources(
    records: &Arc<Mutex<Vec<WgpuCommandRecord>>>,
) -> Vec<wgpu::TextureView> {
    let records = records.lock().unwrap();
    let mut views: HashMap<wgpu::BindGroup, wgpu::TextureView> = HashMap::new();
    let mut current: Option<wgpu::TextureView> = None;
    let mut out = Vec::new();
    for record in records.iter() {
        match record {
            WgpuCommandRecord::CreateBindGroup(created) => {
                if let Some(view) = created.views.first() {
                    views.insert(created.bind_group.clone(), view.clone());
                }
            }
            WgpuCommandRecord::SetBindGroup(set) if set.index == 1 => {
                current = views.get(&set.bind_group).cloned();
            }
            WgpuCommandRecord::Draw(_) => {
                if let Some(view) = current.clone() {
                    out.push(view);
                }
            }
            _ => {}
        }
    }
    return out;
}

/// The color view each recorded pass began on, in order.
pub fn recorded_pass_views(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<wgpu::TextureView> {
    return recorded_pass_begins(records)
        .into_iter()
        .map(|begin| begin.color_view)
        .collect();
}

/// Runs `body` inside a validation error scope on the state's device and returns the first
/// validation error it raised, if any.
pub fn capture_test_validation_error(
    state: &WgpuRenderState,
    body: impl FnOnce(),
) -> Option<wgpu::Error> {
    let native = get_wgpu_render_state_native_device(state);
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    body();
    return block_on(scope.pop());
}

/// Whether `texture` has been destroyed: creating a view of a destroyed texture is a validation
/// error, while a live one's never is.
pub fn is_test_texture_destroyed(state: &WgpuRenderState, texture: &wgpu::Texture) -> bool {
    return capture_test_validation_error(state, || {
        let _ = texture.create_view(&wgpu::TextureViewDescriptor::default());
    })
    .is_some();
}

/// A bare effect of an open declared kind (the source's `allocateEntity` + `kind` entity), with an
/// optional `key` field resolvers may look for.
#[derive(Clone, Debug, Default)]
pub struct TestEffect {
    fields: EffectFields,
    pub key: Option<String>,
}

flight_effects::impl_effect!(TestEffect, "key" => key);

pub fn create_test_effect(kind: &str) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    flight_effects::initialize_effect(&mut effect, kind);
    let effect: EffectRef = Arc::new(RwLock::new(effect));
    return effect;
}

pub fn create_test_effect_with_key(kind: &str, key: &str) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    flight_effects::initialize_effect(&mut effect, kind);
    effect.key = Some(key.to_string());
    let effect: EffectRef = Arc::new(RwLock::new(effect));
    return effect;
}

/// A log state with an in-memory sink (TS `addLogSink(createMemoryLogSink(8))`).
pub fn create_test_logger() -> (LogStateRef, MemoryLogSink) {
    let state: LogStateRef = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

pub fn test_log_entries(sink: &MemoryLogSink) -> Vec<LogEntry> {
    let mut out = Vec::new();
    get_memory_log_sink_entries(&mut out, sink);
    return out;
}

/// The `message` of a logged record (TS `messageOf`).
pub fn test_log_message(entry: &LogEntry) -> String {
    return match &entry.data {
        LogData::Message(message) => message.clone(),
        LogData::Record(record) => match record.get("message") {
            Some(LogValue::Str(message)) => message.clone(),
            _ => String::new(),
        },
    };
}

/// Whether two floats agree to `digits` decimal places (TS `toBeCloseTo`).
pub fn is_close(actual: f32, expected: f32, digits: i32) -> bool {
    return (actual - expected).abs() < 0.5 * 10f32.powi(-digits);
}
