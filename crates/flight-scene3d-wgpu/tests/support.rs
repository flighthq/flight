#![allow(dead_code)]
//! Test doubles for the source's scaffolding (TS `wgpuScene3DTestHelper.ts`): devices are real `wgpu`
//! devices on the noop backend (D17), so every buffer, texture, shader, layout, pipeline and bind
//! group is validated for real, and the call arguments the source's recording fake exposes are
//! reported through render-wgpu's command observer at the real call sites. These are test fixtures
//! only, never a public provider.

use flight_render::RenderTargetClear;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::Ref;
use flight_host::{HostSpawnCapability, ProviderRef, WgpuDevice};
use flight_render_wgpu::*;

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
        std::sync::LazyLock::new(|| Arc::new("test-wgpu-host"));
    return PROVIDER.clone();
}

/// A spawn capability that drops device-loss continuations: these tests never lose a device.
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

/// A render state on a recording device with an open pass over a 256x256 texture target (TS
/// `makeWgpuScene3DState`'s `{ fake, pass, state }`). `calls` is every recorded device and pass
/// command; the pass is left open on the state, so draws record into it.
pub struct WgpuScene3DTestState {
    pub calls: Arc<Mutex<Vec<WgpuCommandRecord>>>,
    pub native: WgpuNativeDevice,
    pub state: WgpuRenderState,
    pub target: Ref<WgpuTextureRenderTarget>,
}

/// Builds the recording state (TS `makeWgpuScene3DState`): a bgra8unorm render state whose scene
/// runtime is created lazily on first use, exactly as in production.
pub fn make_wgpu_scene3d_state(options: Option<WgpuRenderStateOptions>) -> WgpuScene3DTestState {
    let native = create_test_native_device();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let sink = calls.clone();
    set_wgpu_native_device_command_observer(
        &native,
        Some(Arc::new(move |record: &WgpuCommandRecord| {
            sink.lock().unwrap().push(record.clone());
        })),
    );
    let device = create_test_wgpu_device(native.clone());
    let mut options = options.unwrap_or_else(test_default);
    options.format = Some(wgpu::TextureFormat::Bgra8Unorm);
    let mut state = create_wgpu_render_state(&device, Some(&options));
    let target = Arc::new(std::sync::RwLock::new(create_wgpu_texture_render_target(
        &state,
        256.0,
        256.0,
        Some(wgpu::TextureFormat::Bgra8Unorm),
        None,
        None,
    )));
    begin_wgpu_render_pass(
        &mut state,
        &WgpuRenderTarget::Texture(target.clone()),
        Some(&RenderTargetClear {
            color: Some([0.0, 0.0, 0.0, 0.0]),
            colors: None,
            depth: Some(1.0),
            stencil: None,
        }),
    );
    calls.lock().unwrap().clear();
    return WgpuScene3DTestState {
        calls,
        native,
        state,
        target,
    };
}

impl WgpuScene3DTestState {
    /// Every recorded command whose source call name is `name` (the fake's `calls` filtered by
    /// `call.name`).
    pub fn named(&self, name: &str) -> Vec<WgpuCommandRecord> {
        return self
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|record| get_test_call_name(record) == name)
            .cloned()
            .collect();
    }

    /// How many recorded commands carry the source call name `name`.
    pub fn count(&self, name: &str) -> usize {
        return self.named(name).len();
    }

    /// Forgets every command recorded so far.
    pub fn clear(&self) {
        self.calls.lock().unwrap().clear();
    }

    /// The WGSL of every compiled shader module, in order.
    pub fn shader_sources(&self) -> Vec<String> {
        return self
            .named("createShaderModule")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateShaderModule(module) => Some(module.source),
                _ => None,
            })
            .collect();
    }

    /// Every created render pipeline's descriptor, in order.
    pub fn pipelines(&self) -> Vec<WgpuRenderPipelineDescriptorRecord> {
        return self
            .named("createRenderPipeline")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateRenderPipelineDescriptor(pipeline) => Some(pipeline),
                _ => None,
            })
            .collect();
    }

    /// Every created bind group with its entries, in order.
    pub fn bind_groups(&self) -> Vec<WgpuBindGroupEntriesRecord> {
        return self
            .named("createBindGroup")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateBindGroupEntries(group) => Some(group),
                _ => None,
            })
            .collect();
    }

    /// Every created bind-group layout, in order.
    pub fn bind_group_layouts(&self) -> Vec<WgpuBindGroupLayoutRecord> {
        return self
            .named("createBindGroupLayout")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateBindGroupLayout(layout) => Some(layout),
                _ => None,
            })
            .collect();
    }

    /// Every created buffer, in order.
    pub fn buffers(&self) -> Vec<WgpuBufferRecord> {
        return self
            .named("createBuffer")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateBuffer(buffer) => Some(buffer),
                _ => None,
            })
            .collect();
    }

    /// Every created texture, in order.
    pub fn textures(&self) -> Vec<WgpuTextureRecord> {
        return self
            .named("createTexture")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateTexture(texture) => Some(texture),
                _ => None,
            })
            .collect();
    }

    /// Every queue buffer write, in order.
    pub fn buffer_writes(&self) -> Vec<WgpuBufferWriteRecord> {
        return self
            .named("writeBuffer")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::WriteBuffer(write) => Some(write),
                _ => None,
            })
            .collect();
    }

    /// Every queue texture write, in order.
    pub fn texture_writes(&self) -> Vec<WgpuTextureWriteRecord> {
        return self
            .named("writeTexture")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::WriteTexture(write) => Some(write),
                _ => None,
            })
            .collect();
    }

    /// Every indexed draw, in order.
    pub fn draws_indexed(&self) -> Vec<WgpuDrawIndexedRecord> {
        return self
            .named("drawIndexed")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::DrawIndexed(draw) => Some(draw),
                _ => None,
            })
            .collect();
    }

    /// Every non-indexed draw, in order.
    pub fn draws(&self) -> Vec<WgpuDrawRecord> {
        return self
            .named("draw")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::Draw(draw) => Some(draw),
                _ => None,
            })
            .collect();
    }

    /// Every bind group set on the pass, in order.
    pub fn set_bind_groups(&self) -> Vec<WgpuSetBindGroupRecord> {
        return self
            .named("setBindGroup")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::SetBindGroup(set) => Some(set),
                _ => None,
            })
            .collect();
    }

    /// Every pipeline set on the pass, in order.
    pub fn set_pipelines(&self) -> Vec<wgpu::RenderPipeline> {
        return self
            .named("setPipeline")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::SetPipeline(pipeline) => Some(pipeline),
                _ => None,
            })
            .collect();
    }

    /// Every vertex buffer set on the pass, in order.
    pub fn set_vertex_buffers(&self) -> Vec<WgpuSetVertexBufferRecord> {
        return self
            .named("setVertexBuffer")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::SetVertexBuffer(set) => Some(set),
                _ => None,
            })
            .collect();
    }

    /// Every index buffer set on the pass, in order.
    pub fn set_index_buffers(&self) -> Vec<WgpuSetIndexBufferRecord> {
        return self
            .named("setIndexBuffer")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::SetIndexBuffer(set) => Some(set),
                _ => None,
            })
            .collect();
    }

    /// Every created sampler, in order.
    pub fn samplers(&self) -> Vec<WgpuSamplerRecord> {
        return self
            .named("createSampler")
            .into_iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::CreateSampler(sampler) => Some(sampler),
                _ => None,
            })
            .collect();
    }
}

/// The source call name a recorded command stands for.
pub fn get_test_call_name(record: &WgpuCommandRecord) -> &'static str {
    return match record {
        WgpuCommandRecord::BeginDepthRenderPass(_) | WgpuCommandRecord::BeginRenderPass(_) => {
            "beginRenderPass"
        }
        WgpuCommandRecord::CreateBindGroup(_) | WgpuCommandRecord::CreateBindGroupEntries(_) => {
            "createBindGroup"
        }
        WgpuCommandRecord::CreateBindGroupLayout(_) => "createBindGroupLayout",
        WgpuCommandRecord::CreateBuffer(_) => "createBuffer",
        WgpuCommandRecord::CreatePipelineLayout(_) => "createPipelineLayout",
        WgpuCommandRecord::CreateRenderPipeline(_)
        | WgpuCommandRecord::CreateRenderPipelineDescriptor(_) => "createRenderPipeline",
        WgpuCommandRecord::CreateSampler(_) => "createSampler",
        WgpuCommandRecord::CreateShaderModule(_) => "createShaderModule",
        WgpuCommandRecord::CreateTexture(_) => "createTexture",
        WgpuCommandRecord::Draw(_) => "draw",
        WgpuCommandRecord::DrawIndexed(_) => "drawIndexed",
        WgpuCommandRecord::EndRenderPass => "end",
        WgpuCommandRecord::SetBindGroup(_) => "setBindGroup",
        WgpuCommandRecord::SetIndexBuffer(_) => "setIndexBuffer",
        WgpuCommandRecord::SetPipeline(_) => "setPipeline",
        WgpuCommandRecord::SetScissorRect(_) => "setScissorRect",
        WgpuCommandRecord::SetVertexBuffer(_) => "setVertexBuffer",
        WgpuCommandRecord::Submit(_) => "submit",
        WgpuCommandRecord::WriteBuffer(_) => "writeBuffer",
        WgpuCommandRecord::WriteTexture(_) => "writeTexture",
    };
}

/// Reads little-endian f32 values back out of recorded bytes.
pub fn bytes_to_f32(data: &[u8]) -> Vec<f32> {
    return data
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
}

/// Reads little-endian u16 values back out of recorded bytes.
pub fn bytes_to_u16(data: &[u8]) -> Vec<u16> {
    return data
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
}

/// The floats of the Draw ring slot at byte `offset` on the state.
pub fn read_test_draw_uniform(state: &WgpuRenderState, offset: u32) -> Vec<f32> {
    let base = (offset / 4) as usize;
    return get_wgpu_render_state_runtime(state).uniform_data[base..base + 64].to_vec();
}

/// Runs `action` and reports whether it panicked (TS `expect(() => …).toThrow()`); wgpu validation
/// errors surface as panics on the noop device.
pub fn test_panics(action: impl FnOnce()) -> bool {
    return std::panic::catch_unwind(std::panic::AssertUnwindSafe(action)).is_err();
}

// ── scene fixtures ───────────────────────────────────────────────────────────────────────────

/// A perspective camera at the origin (TS `makeCamera`): near 0.1, far 100, aspect 1, fovY PI/3.
pub fn make_test_camera() -> flight_camera::Camera3D {
    let mut camera = flight_camera::create_camera_3d();
    camera.near = 0.1;
    camera.far = 100.0;
    let projection = flight_camera::create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = 1.0;
        projection.fov_y = std::f32::consts::PI / 3.0;
    }
    camera.projection = flight_camera::Projection::Perspective(projection);
    return camera;
}

/// A perspective camera (aspect 1, fovY `fov_y`, near 0.1, far 100) looking from `eye` at `target`
/// with +Y up (TS `createCamera3D` + `setCamera3DViewMatrix4FromLookAt`).
pub fn make_test_look_at_camera(
    fov_y: f32,
    eye: [f32; 3],
    target: [f32; 3],
) -> flight_camera::Camera3D {
    let mut camera = make_test_camera();
    if let flight_camera::Projection::Perspective(projection) = &camera.projection {
        projection.write().unwrap().fov_y = fov_y;
    }
    flight_camera::set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &flight_geometry::create_vector3(eye[0], eye[1], eye[2]),
        &flight_geometry::create_vector3(target[0], target[1], target[2]),
        &flight_geometry::create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

/// A bare Node3D scene root (TS `createNode3D(Node3DKind)`).
pub fn create_test_scene_root() -> flight_node::NodeRef {
    return flight_scene3d::publish_node3d(flight_scene3d::create_node3d::<
        flight_scene3d::Node3DFields,
    >(None));
}

/// A mesh over `geometry` with one material slot per entry (TS `createMesh(geometry, materials)`).
pub fn create_test_mesh(
    geometry: flight_meshgeometry::MeshGeometry,
    materials: Vec<Option<flight_materials::Material3DRef>>,
) -> Ref<flight_scene3d::Mesh> {
    return flight_scene3d::create_mesh(
        Arc::new(std::sync::RwLock::new(geometry)),
        Arc::new(std::sync::RwLock::new(materials)),
    );
}

/// Adds `child` under `scene` and returns the child's node handle.
pub fn add_test_child<T: flight_node::Node + 'static>(
    scene: &flight_node::NodeRef,
    child: &Ref<T>,
) -> flight_node::NodeRef {
    let node: flight_node::NodeRef = child.clone();
    flight_node::add_node_child(scene, &node);
    return node;
}

/// An ambient (white, 0.2) plus directional (white, (0, -1, -1), 1) light set (TS `LIGHTS`).
pub fn make_test_scene_lights() -> flight_lighting::Scene3DLights {
    let mut lights = flight_lighting::create_scene_3d_lights();
    let mut ambient = flight_lighting::create_ambient_light();
    ambient.color = 0xffffffff;
    ambient.intensity = 0.2;
    lights.ambient = Some(Arc::new(std::sync::RwLock::new(ambient)));
    let directional = flight_lighting::create_directional_light(Some(
        &flight_lighting::DirectionalLightOptions {
            color: Some(0xffffffff),
            direction: Some(flight_geometry::create_vector3(0.0, -1.0, -1.0)),
            intensity: Some(1.0),
            ..test_default()
        },
    ));
    lights.directional = Some(Arc::new(std::sync::RwLock::new(directional)));
    return lights;
}

/// A shared light block with one directional and one ambient light (TS `makeLights`).
pub fn make_test_lights() -> flight_entity::Ref<flight_lighting::Scene3DLightBlock> {
    let mut data = vec![0.0_f32; flight_lighting::SCENE_LIGHT_BLOCK_FLOATS];
    data[1] = -1.0;
    data[4] = 1.0;
    data[5] = 1.0;
    data[6] = 1.0;
    data[8] = 0.1;
    return Arc::new(std::sync::RwLock::new(flight_lighting::Scene3DLightBlock {
        ambient_count: 1,
        data: data.into_boxed_slice(),
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    }));
}

/// A shared material handle over `material`.
pub fn share_test_material<T: flight_materials::Material3D + 'static>(
    material: T,
) -> flight_materials::Material3DRef {
    return Arc::new(std::sync::RwLock::new(material));
}

/// A draw proxy for the first subset of `geometry` with identity matrices (TS `makeProxy`).
pub fn make_test_proxy_for(
    geometry: &flight_meshgeometry::MeshGeometry,
    material: flight_materials::Material3DRef,
) -> flight_render::Scene3DRenderProxy {
    return flight_render::Scene3DRenderProxy {
        alpha: None,
        color_scale_bias: None,
        color_matrix: None,
        instance_count: None,
        instance_matrices: None,
        instance_colors: None,
        joint_matrices: None,
        normal_matrices: None,
        material,
        normal_matrix: flight_geometry::create_matrix3(),
        subset: geometry.subsets[0],
        world_matrix: flight_geometry::create_matrix4(),
    };
}

/// A draw proxy over a box geometry's first subset with a standard PBR material (TS `makeProxy`).
pub fn make_test_proxy() -> flight_render::Scene3DRenderProxy {
    let geometry = flight_meshgeometry::create_box_mesh_geometry(None, None, None);
    return make_test_proxy_for(
        &geometry,
        share_test_material(flight_materials::contract::create_standard_pbr_material()),
    );
}

/// A minimal valid WGSL module with `vs_main` / `fs_main` over location 0 (the source's empty
/// stand-in module; real validation needs real entry points).
pub fn create_test_mesh_module(state: &WgpuRenderState) -> wgpu::ShaderModule {
    let native = get_wgpu_render_state_native_device(state);
    return create_wgpu_shader_module(
        &native,
        "@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {\n  return vec4f(position, 1.0);\n}\n@fragment fn fs_main() -> @location(0) vec4f {\n  return vec4f(1.0);\n}\n",
    );
}

/// An empty material bind-group layout (the source's `createBindGroupLayout({ entries: [] })`).
pub fn create_test_empty_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    return create_wgpu_bind_group_layout(&native, &[]);
}

/// A material layout with the uniform at 0, one sampler at 1 and `view_count` views from 2.
pub fn create_test_material_layout(
    state: &WgpuRenderState,
    view_count: u32,
) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let mut entries = vec![test_uniform_entry(0), test_sampler_entry(1)];
    for index in 0..view_count {
        entries.push(test_texture_entry(2 + index));
    }
    return create_wgpu_bind_group_layout(&native, &entries);
}

/// A per-map material layout: the uniform at 0, `count` samplers from 1, `count` views after them.
pub fn create_test_per_map_layout(state: &WgpuRenderState, count: u32) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let mut entries = vec![test_uniform_entry(0)];
    for index in 0..count {
        entries.push(test_sampler_entry(1 + index));
    }
    for index in 0..count {
        entries.push(test_texture_entry(1 + count + index));
    }
    return create_wgpu_bind_group_layout(&native, &entries);
}

/// A distinct 1x1 sampleable view (the source's `{} as GPUTextureView`).
pub fn create_test_view(state: &WgpuRenderState) -> wgpu::TextureView {
    let native = get_wgpu_render_state_native_device(state);
    let texture = native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    return texture.create_view(&wgpu::TextureViewDescriptor::default());
}

/// A distinct filtering sampler (the source's `{} as GPUSampler`).
pub fn create_test_sampler(state: &WgpuRenderState) -> wgpu::Sampler {
    let native = get_wgpu_render_state_native_device(state);
    return native
        .device
        .create_sampler(&wgpu::SamplerDescriptor::default());
}

/// A uniform buffer of `size` bytes (the source's `{} as GPUBuffer`).
pub fn create_test_uniform_buffer(state: &WgpuRenderState, size: u64) -> wgpu::Buffer {
    let native = get_wgpu_render_state_native_device(state);
    return native.device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
}

/// A 2D texture over a `width`x`height` bitmap source (the source's image-backed map).
pub fn create_test_bitmap_texture(width: u32, height: u32) -> flight_texture::Texture {
    let bitmap = flight_bitmap::create_bitmap(width, height, Some(0xffffffff));
    let source: flight_texture::TextureSourceRef = Arc::new(std::sync::RwLock::new(bitmap));
    let mut texture = flight_texture::create_texture_2d();
    texture.source = Some(source);
    return flight_texture::Texture::Texture2D(texture);
}

/// A 2D texture with no source.
pub fn create_test_unbacked_texture() -> flight_texture::Texture {
    return flight_texture::Texture::Texture2D(flight_texture::create_texture_2d());
}

fn test_uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    };
}

fn test_sampler_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    };
}

fn test_texture_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    };
}

/// The registered skinning adapter of a fresh state (TS `makeWgpuSkinningAdapter`).
pub fn make_wgpu_skinning_adapter() -> &'static WgpuSkinningAdapter {
    let mut test = make_wgpu_scene3d_state(None);
    flight_scene3d_wgpu::contract::register_wgpu_gpu_skinning(&mut test.state);
    return flight_scene3d_wgpu::contract::get_wgpu_skinning_adapter(&mut test.state).unwrap();
}

/// Ends the test pass and submits the frame, so the device validates every recorded pass command
/// (pipeline/bind-group compatibility, vertex and index buffers, dynamic offsets).
pub fn submit_test_frame(test: &mut WgpuScene3DTestState) {
    if let Some(pass) = get_wgpu_active_render_pass_handle(&mut test.state) {
        end_wgpu_render_pass(pass);
    }
    submit_wgpu_frame(&mut test.state);
    let native = get_wgpu_render_state_native_device(&test.state);
    let _ = native.device.poll(wgpu::PollType::wait_indefinitely());
}

// ── unlit family ─────────────────────────────────────────────────────────────────────────────

/// An all-zero light block (the source's `NO_LIGHTS`, sized to the full packed layout because the
/// Frame uniform write reads every punctual slot).
pub fn make_test_no_lights() -> flight_entity::Ref<flight_lighting::Scene3DLightBlock> {
    return Arc::new(std::sync::RwLock::new(flight_lighting::Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0_f32; flight_lighting::SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    }));
}

/// Runs a mesh-material renderer's bind for `material` with no lights and the test camera (the
/// source's `renderer.bind(state, material, NO_LIGHTS, makeCamera())`).
pub fn bind_test_renderer(
    state: &mut WgpuRenderState,
    renderer: &WgpuMeshMaterialRenderer,
    material: Option<&dyn flight_materials::Material>,
) {
    (renderer.bind)(state, material, &make_test_no_lights(), &make_test_camera());
}

/// Whether `renderer` is the exact registered renderer instance.
pub fn is_same_renderer(
    value: Option<&'static WgpuMeshMaterialRenderer>,
    expected: &'static WgpuMeshMaterialRenderer,
) -> bool {
    return value.is_some_and(|value| std::ptr::eq(value, expected));
}

/// The source's fake `HTMLVideoElement`: a decoded frame of a fixed size whose external copies are
/// counted (the source's recorded `copyExternalImageToTexture`).
pub struct TestVideoElement {
    pub copies: std::sync::atomic::AtomicU32,
    pub height: u32,
    pub width: u32,
}

impl WgpuExternalImageSource for TestVideoElement {
    fn copy_to_texture(
        &self,
        _queue: &wgpu::Queue,
        _texture: &wgpu::Texture,
        _origin: wgpu::Origin3d,
        _premultiplied_alpha: bool,
        _width: u32,
        _height: u32,
    ) -> Result<(), WgpuExternalCopyError> {
        self.copies
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        return Ok(());
    }

    fn height(&self) -> u32 {
        return self.height;
    }

    fn is_ready(&self, width: u32, height: u32) -> bool {
        return self.width >= width && self.height >= height;
    }

    fn width(&self) -> u32 {
        return self.width;
    }
}

fn test_video_element_of(
    source: &Arc<flight_host::HostImageSource>,
) -> Arc<dyn WgpuExternalImageSource> {
    return source
        .handle
        .downcast_ref::<Arc<dyn WgpuExternalImageSource>>()
        .expect("a test video element")
        .clone();
}

/// The source's `testVideoHost`: always ready, reporting the element's frame size.
pub fn create_test_video_host() -> flight_video::HostVideoCapability {
    return flight_video::HostVideoCapability {
        provider: test_provider(),
        add_ended_listener: None,
        attach_stream: None,
        can_play_type: Arc::new(|_mime| true),
        create_object_url: None,
        create_video_element: None,
        get_current_time: None,
        get_duration: None,
        get_height: Some(Arc::new(|source| {
            test_video_element_of(source).height() as f32
        })),
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: Some(Arc::new(|source| {
            test_video_element_of(source).width() as f32
        })),
        is_ready: Some(Arc::new(|_source| true)),
        load_url: None,
        pause: None,
        play: None,
        release_element: None,
        remove_ended_listener: None,
        revoke_object_url: None,
        set_current_time: None,
        set_loop: None,
        set_muted: None,
        set_playback_rate: None,
        set_volume: None,
    };
}

/// A ready `width`x`height` video texture advanced to its first frame (the source's
/// `createVideoTexture` + `advanceVideoTexture` over a decoded element), with its element.
pub fn create_test_video_texture(
    width: u32,
    height: u32,
) -> (flight_texture::Texture, Arc<TestVideoElement>) {
    let element = Arc::new(TestVideoElement {
        copies: std::sync::atomic::AtomicU32::new(0),
        height,
        width,
    });
    let source: Arc<dyn WgpuExternalImageSource> = element.clone();
    let host_source = Arc::new(create_wgpu_external_host_image_source(
        test_provider(),
        source,
    ));
    let host = create_test_video_host();
    let mut resource = flight_video::contract::create_video_resource();
    resource.element = Some(host_source);
    let mut texture = flight_texture::Texture::Texture2D(
        flight_video::contract::create_video_texture(&host, &resource, None),
    );
    flight_video::contract::advance_video_texture(&host, &mut texture);
    return (texture, element);
}

/// Whether the video element received an external frame copy.
pub fn was_test_video_copied(element: &TestVideoElement) -> bool {
    return element.copies.load(std::sync::atomic::Ordering::SeqCst) > 0;
}

// ── environment family ───────────────────────────────────────────────────────────────────────

/// One recorded external image copy (the source's `copyExternalImageToTexture` call).
#[derive(Clone, Debug, PartialEq)]
pub struct TestImageCopy {
    pub height: u32,
    pub origin: [u32; 3],
    pub premultiplied_alpha: bool,
    pub texture: wgpu::Texture,
    pub width: u32,
}

/// A host image fake (the source's canvas / image element): a size, readiness, a solid pixel it
/// writes on copy, and a copy log.
pub struct TestImageSource {
    pub copies: Mutex<Vec<TestImageCopy>>,
    pub height: std::sync::atomic::AtomicU32,
    pub ready: std::sync::atomic::AtomicBool,
    pub width: std::sync::atomic::AtomicU32,
}

impl TestImageSource {
    pub fn copy_count(&self) -> usize {
        return self.copies.lock().unwrap().len();
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
        let data = vec![255_u8; (width * height * 4) as usize];
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
        return self.height.load(std::sync::atomic::Ordering::SeqCst);
    }

    fn is_ready(&self, width: u32, height: u32) -> bool {
        return self.ready.load(std::sync::atomic::Ordering::SeqCst)
            && self.width() >= width
            && self.height() >= height;
    }

    fn width(&self) -> u32 {
        return self.width.load(std::sync::atomic::Ordering::SeqCst);
    }
}

/// An image resource over a ready `width`x`height` host image fake (the source's canvas-backed
/// `ImageResource`), sized through a dimension resolver that reads the fake.
pub fn create_test_image_resource(
    width: u32,
    height: u32,
) -> (Ref<flight_image::ImageResource>, Arc<TestImageSource>) {
    let fake = Arc::new(TestImageSource {
        copies: Mutex::new(Vec::new()),
        height: std::sync::atomic::AtomicU32::new(height),
        ready: std::sync::atomic::AtomicBool::new(true),
        width: std::sync::atomic::AtomicU32::new(width),
    });
    let source: Arc<dyn WgpuExternalImageSource> = fake.clone();
    let image = Arc::new(create_wgpu_external_host_image_source(
        test_provider(),
        source,
    ));
    let mut resolver = flight_image::contract::create_image_resolver_state();
    flight_image::contract::register_host_image_dimension_resolver(
        &mut resolver,
        Arc::new(
            |source: &Arc<flight_host::HostImageSource>,
             out: &mut flight_image::contract::HostImageDimensions| {
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
    let resource = flight_image::contract::create_image_resource(image, &resolver);
    return (resource, fake);
}

/// A 4x4 rgba8 data-only bitmap face (the source's generated `Bitmap`).
pub fn create_test_bitmap_face() -> flight_texture::TextureSourceRef {
    return Arc::new(std::sync::RwLock::new(flight_bitmap::create_bitmap(
        4,
        4,
        Some(0),
    )));
}

/// An environment over a cube texture whose six faces are `faces`, in the color space given.
pub fn create_test_cube_environment(
    faces: [flight_texture::TextureSourceRef; 6],
    color_space: flight_texture::TextureColorSpace,
) -> flight_lighting::Environment {
    let mut cube = flight_texture::create_cube_texture();
    flight_texture::TextureUvTransform::texture_fields_mut(&mut cube).color_space = color_space;
    cube.sources = faces.map(Some);
    let mut environment = flight_lighting::create_environment();
    environment.environment = Some(Arc::new(std::sync::RwLock::new(
        flight_texture::Texture::Cube(cube),
    )));
    environment.intensity = 1.0;
    return environment;
}

/// An sRGB environment whose six faces share one 4x4 image resource (the source's
/// `completeEnvironment`), with the image fake its copies record into.
pub fn create_test_image_environment() -> (flight_lighting::Environment, Arc<TestImageSource>) {
    let (image, fake) = create_test_image_resource(4, 4);
    let face: flight_texture::TextureSourceRef = image;
    let environment = create_test_cube_environment(
        std::array::from_fn(|_| face.clone()),
        flight_texture::TextureColorSpace::Srgb,
    );
    return (environment, fake);
}

/// An sRGB environment whose six faces share one data-only bitmap (the source's
/// `dataOnlyEnvironment`).
pub fn create_test_bitmap_environment() -> flight_lighting::Environment {
    let face = create_test_bitmap_face();
    return create_test_cube_environment(
        std::array::from_fn(|_| face.clone()),
        flight_texture::TextureColorSpace::Srgb,
    );
}
