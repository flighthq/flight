#![allow(dead_code)]
//! Test doubles for the source's scaffolding (TS `wgpuScene3DTestHelper.ts`): devices are real `wgpu`
//! devices on the noop backend (D17), so every buffer, texture, shader, layout, pipeline and bind
//! group is validated for real, and the call arguments the source's recording fake exposes are
//! reported through render-wgpu's command observer at the real call sites. These are test fixtures
//! only, never a public provider.

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
pub fn make_test_look_at_camera(fov_y: f32, eye: [f32; 3], target: [f32; 3]) -> flight_camera::Camera3D {
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
    return flight_scene3d::publish_node3d(flight_scene3d::create_node3d::<flight_scene3d::Node3DFields>(None));
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
    let directional = flight_lighting::create_directional_light(Some(&flight_lighting::DirectionalLightOptions {
        color: Some(0xffffffff),
        direction: Some(flight_geometry::create_vector3(0.0, -1.0, -1.0)),
        intensity: Some(1.0),
        ..test_default()
    }));
    lights.directional = Some(Arc::new(std::sync::RwLock::new(directional)));
    return lights;
}

/// A light block with one directional and one ambient light (TS `makeLights`).
pub fn make_test_lights() -> flight_lighting::Scene3DLightBlock {
    let mut data = vec![0.0_f32; flight_lighting::SCENE_LIGHT_BLOCK_FLOATS];
    data[1] = -1.0;
    data[4] = 1.0;
    data[5] = 1.0;
    data[6] = 1.0;
    data[8] = 0.1;
    return flight_lighting::Scene3DLightBlock {
        ambient_count: 1,
        data: data.into_boxed_slice(),
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
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
pub fn create_test_material_layout(state: &WgpuRenderState, view_count: u32) -> wgpu::BindGroupLayout {
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
    flight_scene3d_wgpu::register_wgpu_gpu_skinning(&mut test.state);
    return flight_scene3d_wgpu::get_wgpu_skinning_adapter(&mut test.state).unwrap();
}
