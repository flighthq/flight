//! A stand-in for the host seam that supplies WGPU carriers to C. Production C has no producer
//! for a `WgpuRenderState` or a `WgpuRenderTarget`: both need a device, which only a host acquires.
//! This module, built only with the `stand-in-wgpu-host` feature and never part of the default
//! library or header, supplies them on wgpu's noop backend so a C program can drive the generated
//! render pass bracket live, and runs the same sequence natively as the reference it compares
//! against.

// flight-lint: allow-file(f64) stand-in host: target sizes and shape coordinates are the SDK's f64 lanes

use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_sdk::render_wgpu::contract::{
    WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_native_device, create_wgpu_render_state,
    create_wgpu_texture_render_target, end_wgpu_render_pass, get_wgpu_render_state_runtime,
};

use crate::FlightNode;

/// What a live sequence and its reference compare after each step: the pass records, the open
/// encoders and target, the encoder count, the uniform, quad-batch and shape-mesh pipeline writes
/// the draw made, and every 2D proxy's kind, visibility, alpha, frame stamps, renderer data and
/// world transform.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct FlightStandInWgpuRenderReport {
    pub pass_depth: u32,
    pub encoder_open: bool,
    pub render_pass_open: bool,
    pub target_bound: bool,
    pub encoder_serial: u64,
    pub uniform_offset: u32,
    pub quad_batch_count: u32,
    pub uniform_hash: u64,
    pub shape_mesh_pipeline_count: u32,
    pub proxy_count: u32,
    pub proxy_hash: u64,
}

fn create_stand_in_render_state() -> Option<flight_sdk::WgpuRenderState> {
    let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
    descriptor.backends = wgpu::Backends::NOOP;
    descriptor.backend_options.noop.enable = true;
    let instance = wgpu::Instance::new(descriptor);
    let adapter =
        block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default())).ok()?;
    let (device, queue) =
        block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).ok()?;
    let spawn = flight_sdk::HostSpawnCapability {
        provider: Arc::new("flight-ffi-stand-in-wgpu-host"),
        spawn: Arc::new(|_future| {}),
    };
    let device = flight_sdk::WgpuDevice {
        provider: Arc::new("flight-ffi-stand-in-wgpu-host"),
        handle: Arc::new(create_wgpu_native_device(device, queue, spawn)),
    };
    let mut state = create_wgpu_render_state(&device, None);
    flight_sdk::register_wgpu_scene2d_render_preset(&mut state);
    return Some(state);
}

fn create_stand_in_texture_target(
    state: &flight_sdk::WgpuRenderState,
    width: f64,
    height: f64,
) -> WgpuRenderTarget {
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state, width, height, None, None, None,
    ))));
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        std::thread::yield_now();
    }
}

/// Creates a shape node holding one solid `color` rectangle, so a C scene has content the 2D
/// renderer draws: shape commands are generic over the node type and have no C lowering. Release
/// it with `flight_free_node`.
#[unsafe(no_mangle)]
pub(crate) extern "C" fn flight_stand_in_create_solid_shape(
    color: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> *mut FlightNode {
    let shape = flight_sdk::create_shape();
    let bounds_state = shape.read().unwrap().data.bounds_state.clone();
    flight_sdk::register_default_shape_bounds_commands(&bounds_state);
    flight_sdk::append_shape_begin_fill(&shape, color, None);
    flight_sdk::append_shape_rectangle(&shape, x, y, width, height);
    flight_sdk::append_shape_end_fill(&shape);
    return Box::into_raw(Box::new(crate::ffi_node_from_concrete_2d(shape)));
}

/// Creates a render state on wgpu's noop backend with the standard 2D render preset registered.
/// Release it with `flight_stand_in_destroy_wgpu_render_state`; returns NULL when no noop device
/// is available.
#[unsafe(no_mangle)]
pub(crate) extern "C" fn flight_stand_in_create_wgpu_render_state()
-> *mut flight_sdk::WgpuRenderState {
    let Some(state) = create_stand_in_render_state() else {
        return std::ptr::null_mut();
    };
    return Box::into_raw(Box::new(state));
}

/// Creates a `width` by `height` texture target on `state`'s device. Release it with
/// `flight_stand_in_destroy_wgpu_render_target`; a NULL state returns NULL.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn flight_stand_in_create_wgpu_texture_target(
    state: *const flight_sdk::WgpuRenderState,
    width: f64,
    height: f64,
) -> *mut WgpuRenderTarget {
    if state.is_null() {
        return std::ptr::null_mut();
    }
    let target = create_stand_in_texture_target(unsafe { &*state }, width, height);
    return Box::into_raw(Box::new(target));
}

/// Releases a state from `flight_stand_in_create_wgpu_render_state`; NULL is a no-op.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn flight_stand_in_destroy_wgpu_render_state(
    state: *mut flight_sdk::WgpuRenderState,
) {
    if !state.is_null() {
        drop(unsafe { Box::from_raw(state) });
    }
}

/// Releases a target from `flight_stand_in_create_wgpu_texture_target`; NULL is a no-op.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn flight_stand_in_destroy_wgpu_render_target(
    target: *mut WgpuRenderTarget,
) {
    if !target.is_null() {
        drop(unsafe { Box::from_raw(target) });
    }
}

/// Writes the report of `state` and its 2D `proxies` (from
/// `flight_create_wgpu_scene_2d_render_proxies`) to `out`. Returns false for a NULL argument.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn flight_stand_in_report_wgpu_render_state(
    state: *const flight_sdk::WgpuRenderState,
    proxies: *const std::ffi::c_void,
    out: *mut FlightStandInWgpuRenderReport,
) -> bool {
    if state.is_null() || proxies.is_null() || out.is_null() {
        return false;
    }
    let proxies = unsafe { &*proxies.cast::<WgpuProxies>() };
    unsafe { *out = get_stand_in_report(&*state, proxies) };
    return true;
}

/// Runs the reference sequence natively on a fresh stand-in state for `source`: prepare, begin
/// loading every aspect, draw the 2D scene, end. Writes the report after begin, after the draw and after end to
/// `reports[0..3]`. Returns false for a NULL argument or when no noop device is available.
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn flight_stand_in_run_wgpu_reference_sequence(
    source: *const FlightNode,
    width: f64,
    height: f64,
    reports: *mut FlightStandInWgpuRenderReport,
) -> bool {
    if source.is_null() || reports.is_null() {
        return false;
    }
    let source = unsafe { &*source }.node.clone();
    let Some(mut state) = create_stand_in_render_state() else {
        return false;
    };
    let target = create_stand_in_texture_target(&state, width, height);
    let mut proxies = WgpuProxies::default();
    flight_sdk::prepare_scene_2d_render(&mut state, &mut proxies, &source);
    let mut pass = begin_wgpu_render_pass(&mut state, &target, None);
    unsafe { *reports = get_stand_in_report(pass.state, &proxies) };
    flight_sdk::render_wgpu_scene2d(&mut pass, &mut proxies, &source, None);
    unsafe { *reports.add(1) = get_stand_in_report(pass.state, &proxies) };
    end_wgpu_render_pass(pass);
    unsafe { *reports.add(2) = get_stand_in_report(&state, &proxies) };
    flight_sdk::destroy_render_state(&mut state, &mut proxies);
    return true;
}

fn get_stand_in_report(
    state: &flight_sdk::WgpuRenderState,
    proxies: &WgpuProxies,
) -> FlightStandInWgpuRenderReport {
    let runtime = get_wgpu_render_state_runtime(state);
    let mut uniform_hash = FNV_OFFSET;
    for value in &runtime.uniform_data {
        uniform_hash = hash_stand_in_bytes(uniform_hash, &value.to_bits().to_le_bytes());
    }
    let mut proxy_count = 0;
    let mut proxy_hash = FNV_OFFSET;
    for proxy in proxies.entries.iter().flatten() {
        proxy_count += 1;
        let transform = &proxy.transform_2d;
        proxy_hash = hash_stand_in_bytes(proxy_hash, proxy.proxy.kind.as_bytes());
        for value in [
            transform.a,
            transform.b,
            transform.c,
            transform.d,
            transform.tx,
            transform.ty,
        ] {
            proxy_hash = hash_stand_in_bytes(proxy_hash, &value.to_bits().to_le_bytes());
        }
        proxy_hash = hash_stand_in_bytes(proxy_hash, &proxy.proxy.alpha.to_bits().to_le_bytes());
        proxy_hash = hash_stand_in_bytes(
            proxy_hash,
            &[
                u8::from(proxy.proxy.visible),
                u8::from(proxy.proxy.renderer_data.is_some()),
                u8::from(proxy.traverse_children),
            ],
        );
        for stamp in [
            proxy.proxy.transform_frame_id,
            proxy.proxy.appearance_frame_id,
        ] {
            proxy_hash = hash_stand_in_bytes(proxy_hash, &stamp.to_le_bytes());
        }
    }
    return FlightStandInWgpuRenderReport {
        pass_depth: runtime.pass_stack.len() as u32,
        encoder_open: runtime.command_encoder.is_some(),
        render_pass_open: runtime.render_pass.is_some(),
        target_bound: runtime.current_render_target.is_some(),
        encoder_serial: runtime.command_encoder_serial,
        uniform_offset: runtime.uniform_offset,
        quad_batch_count: runtime.quad_batch_writer_count,
        uniform_hash,
        shape_mesh_pipeline_count: runtime
            .shape_mesh_pipelines
            .as_ref()
            .map_or(0, |pipelines| pipelines.len() as u32),
        proxy_count,
        proxy_hash,
    };
}

// FNV-1a over `bytes`, continuing from `hash`, so equal values compare equal byte for byte.
fn hash_stand_in_bytes(hash: u64, bytes: &[u8]) -> u64 {
    let mut hash = hash;
    for byte in bytes {
        hash = (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3);
    }
    return hash;
}

const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;

type WgpuProxies = flight_sdk::RenderProxies2D<flight_sdk::WgpuRenderState>;
