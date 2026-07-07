//! The shared scene-wgpu mesh-pipeline infrastructure — the WGSL mirror of
//! scene-gl's mesh program + lit program. Every mesh-material family compiles
//! ONE render pipeline per (define key + color format) whose pipeline layout is
//! [shared Frame layout, shared Draw layout, family Material layout]. Frame
//! (group 0) and Draw (group 1) are identical across families, so their
//! bind-group layouts, the Frame uniform buffer/bind group, and the
//! dynamic-offset Draw bind group are created once per state and reused.
//!
//! Ports `@flighthq/scene-wgpu` `wgpuMeshPipeline.ts`.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::{Camera, Projection};
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime};

/// A compiled mesh-material pipeline plus the material bind-group layout its
/// group(2) targets. Frame and Draw layouts are shared on the runtime.
pub struct WgpuMeshPipeline {
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub pipeline: wgpu::RenderPipeline,
}

/// The shared group(0)/group(1) bind-group layouts every family pipeline uses.
/// Created once per state and borrowed from the scene runtime (`wgpu`'s
/// `BindGroupLayout` is not `Clone`, so this holds references rather than owning
/// copies — a Rust-port divergence from the TS `WgpuSceneLayouts`, which holds the
/// layout handles by value).
pub struct WgpuSceneLayouts<'a> {
    pub draw_bind_group_layout: &'a wgpu::BindGroupLayout,
    pub frame_bind_group_layout: &'a wgpu::BindGroupLayout,
}

/// Sets the family's pipeline active for the bind-to-draw handoff, binds it,
/// and binds the shared Frame bind group at group(0). Mirrors scene-gl's
/// `beginGlMeshDraw`.
pub fn begin_wgpu_mesh_draw(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    pipeline: &WgpuMeshPipeline,
) {
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_pipeline(&pipeline.pipeline);
    if let Some(frame_bind_group) = scene.frame_bind_group.as_ref() {
        pass.set_bind_group(0, frame_bind_group, &[]);
    }
}

/// Options for creating a mesh pipeline.
pub struct CreateWgpuMeshPipelineOptions {
    pub double_sided: bool,
    pub format: wgpu::TextureFormat,
    pub material_bind_group_layout: wgpu::BindGroupLayout,
    pub module: wgpu::ShaderModule,
    pub topology: wgpu::PrimitiveTopology,
}

/// Builds a render pipeline for a family: compiles its WGSL module, and lays
/// out [shared Frame, shared Draw, family Material] over the canonical 48-byte
/// PBR vertex. Mirrors the TS `createWgpuMeshPipeline`.
pub fn create_wgpu_mesh_pipeline(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    options: CreateWgpuMeshPipelineOptions,
) -> WgpuMeshPipeline {
    let device = &state.device;
    let layouts = ensure_wgpu_scene_layouts(state, scene);

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("flight-wgpu-mesh-pipeline-layout"),
        bind_group_layouts: &[
            layouts.frame_bind_group_layout,
            layouts.draw_bind_group_layout,
            &options.material_bind_group_layout,
        ],
        push_constant_ranges: &[],
    });

    let cull_mode = if options.double_sided {
        None
    } else {
        Some(wgpu::Face::Back)
    };

    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("flight-wgpu-mesh-pipeline"),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: &options.module,
            entry_point: "vs_main",
            buffers: &[PBR_VERTEX_LAYOUT],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &options.module,
            entry_point: "fs_main",
            targets: &[Some(wgpu::ColorTargetState {
                format: options.format,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: options.topology,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: DEPTH_STENCIL_FORMAT,
            depth_write_enabled: true,
            depth_compare: wgpu::CompareFunction::Less,
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    });

    WgpuMeshPipeline {
        material_bind_group_layout: options.material_bind_group_layout,
        pipeline,
    }
}

/// The shared per-draw tail for every base (non-PBR) mesh-material family, over
/// the pre-resolved `upload` the draw walk hands the renderer's `draw`. Reads the
/// active base pipeline from [`WgpuSceneRuntime::mesh_pipeline_cache`] (keyed by
/// `active_pipeline_key`) and the active material bind group (keyed by
/// `active_material_key`), both set by the family's `bind`; sets the pipeline +
/// Frame(0) + Draw(1, dynamic offset) + Material(2) groups, binds the vertex/index
/// buffers, and issues the indexed draw over `proxy.subset`.
///
/// TS↔Rust divergence: TS splits the pass setup between `bind` (pipeline + Frame +
/// Material via `beginWgpuMeshDraw` + `setBindGroup(2)`) and `draw` (Draw group +
/// buffers via `drawWgpuMeshSubset`, which re-resolves the upload from the cache).
/// The Rust draw seam already receives the resolved `upload` (the walk lifted it
/// out of the cache), and the borrow model favours re-setting every group in one
/// place — so this mirrors the proven `draw_standard_pbr_wgpu_mesh` shape rather
/// than the TS bind/draw split. `draw_wgpu_mesh_subset` (the direct TS-shaped
/// mirror, which re-resolves the upload) is retained for API parity.
pub fn draw_wgpu_mesh_material_subset(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    proxy: &SceneRenderProxy,
    upload: &WgpuMeshUpload,
) {
    let Some(cache_key) = scene.active_pipeline_key.clone() else {
        return;
    };
    if !scene.mesh_pipeline_cache.contains_key(&cache_key) {
        return;
    }
    let subset = proxy.subset;
    if subset.index_count == 0 {
        return;
    }
    if upload.index_buffer.is_none() {
        return;
    }

    // Ring-allocate + write the Draw uniform (world + normal matrix) and ensure the
    // shared dynamic-offset Draw bind group; the returned borrow is dropped here so
    // the immutable reads below can reborrow the runtime.
    write_wgpu_draw_uniform(state, scene, proxy);
    let byte_offset = scene.pending_draw_offset;

    let active_material_key = scene.active_material_key;
    let pipeline = &scene.mesh_pipeline_cache[&cache_key];
    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_pipeline(&pipeline.pipeline);
    if let Some(frame_bind_group) = scene.frame_bind_group.as_ref() {
        pass.set_bind_group(0, frame_bind_group, &[]);
    }
    if let Some(draw_bind_group) = scene.draw_bind_group.as_ref() {
        pass.set_bind_group(1, draw_bind_group, &[byte_offset as u32]);
    }
    if let Some(material_bind_group) = active_material_key
        .and_then(|key| scene.material_bind_groups.get(&key))
        .map(|binding| &binding.bind_group)
    {
        pass.set_bind_group(2, material_bind_group, &[]);
    }
    if let Some(index_buffer) = upload.index_buffer.as_ref() {
        pass.set_vertex_buffer(0, upload.vertex_buffer.slice(..));
        pass.set_index_buffer(index_buffer.slice(..), upload.index_format);
        let end = subset.index_offset + subset.index_count;
        pass.draw_indexed(subset.index_offset..end, 0, 0..1);
    }
}

/// Resolves the shared Frame bind group, creating it from the shared Frame
/// layout + Frame buffer on first use. Mirrors TS `ensureWgpuFrameBindGroup`.
pub fn ensure_wgpu_frame_bind_group<'a>(
    state: &WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
) -> &'a wgpu::BindGroup {
    if scene.frame_buffer.is_none() {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-frame-uniform"),
            size: FRAME_UNIFORM_BYTES,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        scene.frame_buffer = Some(buffer);
    }
    if scene.frame_bind_group.is_none() {
        let layouts = scene
            .frame_bind_group_layout
            .as_ref()
            .expect("frame layout ensured before frame bind group");
        let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-frame-bind-group"),
            layout: layouts,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: scene.frame_buffer.as_ref().unwrap().as_entire_binding(),
            }],
        });
        scene.frame_bind_group = Some(bind_group);
    }
    scene.frame_bind_group.as_ref().unwrap()
}

/// Lazily creates the 1x1 opaque-white placeholder texture view. Mirrors TS
/// `ensureWgpuPlaceholderTextureView`.
pub fn ensure_wgpu_placeholder_texture_view<'a>(
    state: &WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
) -> &'a wgpu::TextureView {
    if scene.placeholder_view.is_none() {
        let texture = state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("flight-wgpu-placeholder"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        state.queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &WHITE_PIXEL,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        scene.placeholder_view = Some(view);
        scene.placeholder_texture = Some(texture);
    }
    scene.placeholder_view.as_ref().unwrap()
}

/// Resolves the shared group(0) Frame + group(1) Draw bind-group layouts,
/// creating them once per state. Mirrors TS `ensureWgpuSceneLayouts`.
pub fn ensure_wgpu_scene_layouts<'a>(
    state: &WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
) -> WgpuSceneLayouts<'a> {
    if scene.frame_bind_group_layout.is_none() || scene.draw_bind_group_layout.is_none() {
        let device = &state.device;
        scene.frame_bind_group_layout = Some(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("flight-wgpu-scene-frame-bgl"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            },
        ));
        scene.draw_bind_group_layout = Some(device.create_bind_group_layout(
            &wgpu::BindGroupLayoutDescriptor {
                label: Some("flight-wgpu-scene-draw-bgl"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: true,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            },
        ));
    }
    WgpuSceneLayouts {
        draw_bind_group_layout: scene.draw_bind_group_layout.as_ref().unwrap(),
        frame_bind_group_layout: scene.frame_bind_group_layout.as_ref().unwrap(),
    }
}

/// Resolves a compiled pipeline for a string cache key, compiling it via the
/// factory on first use and caching it on the scene runtime. Mirrors TS
/// `ensureWgpuScenePipeline`.
pub fn ensure_wgpu_scene_pipeline<'a, F>(
    scene: &'a mut WgpuSceneRuntime,
    key: &str,
    compile: F,
) -> &'a WgpuMeshPipeline
where
    F: FnOnce() -> WgpuMeshPipeline,
{
    if !scene.mesh_pipeline_cache.contains_key(key) {
        let pipeline = compile();
        scene.mesh_pipeline_cache.insert(key.to_owned(), pipeline);
    }
    &scene.mesh_pipeline_cache[key]
}

/// True when a material map texture is ready for GPU upload. Mirrors TS
/// `isWgpuTextureReady`. Stub: returns false (maps not yet sampled on wgpu).
pub fn is_wgpu_texture_ready(_texture: Option<&()>) -> bool {
    false
}

/// Decodes a packed `0xRRGGBBAA` sRGB-albedo color to linear RGBA as `f32`, over
/// [`flighthq_materials::unpack_color_to_linear`] (which writes `f64`). The base
/// material families upload their surface colors as `f32` uniform lanes, so this
/// is the one decode seam every base renderer routes its packed color through.
pub fn unpack_color_to_linear_f32(color: u32) -> [f32; 4] {
    let mut linear = [0.0f64; 4];
    flighthq_materials::unpack_color_to_linear(&mut linear, color);
    [
        linear[0] as f32,
        linear[1] as f32,
        linear[2] as f32,
        linear[3] as f32,
    ]
}

/// Allocates a draw slot from the ring buffer, writes the Draw uniform (world
/// matrix and normal matrix), records the byte offset, and returns the shared
/// dynamic-offset Draw bind group. Mirrors TS `writeWgpuDrawUniform`.
pub fn write_wgpu_draw_uniform<'a>(
    state: &mut WgpuRenderState,
    scene: &'a mut WgpuSceneRuntime,
    proxy: &SceneRenderProxy,
) -> Option<&'a wgpu::BindGroup> {
    if scene.draw_bind_group.is_none() {
        let layout = scene
            .draw_bind_group_layout
            .as_ref()
            .expect("draw layout ensured before draw bind group");
        let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-draw-bind-group"),
            layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: &state.runtime.uniform_buffer,
                    offset: 0,
                    size: wgpu::BufferSize::new(DRAW_UNIFORM_BYTES),
                }),
            }],
        });
        scene.draw_bind_group = Some(bind_group);
    }

    let offset = state.runtime.uniform_offset;
    let float_offset = (offset / 4) as usize;
    {
        let u = &mut state.runtime.uniform_data;
        let world = &proxy.world_matrix.m;
        for (i, value) in world.iter().enumerate() {
            u[float_offset + i] = *value;
        }
        let n = &proxy.normal_matrix.m;
        u[float_offset + 16] = n[0];
        u[float_offset + 17] = n[1];
        u[float_offset + 18] = n[2];
        u[float_offset + 19] = 0.0;
        u[float_offset + 20] = n[3];
        u[float_offset + 21] = n[4];
        u[float_offset + 22] = n[5];
        u[float_offset + 23] = 0.0;
        u[float_offset + 24] = n[6];
        u[float_offset + 25] = n[7];
        u[float_offset + 26] = n[8];
        u[float_offset + 27] = 0.0;
    }
    scene.pending_draw_offset = offset;
    state.runtime.uniform_offset += state.runtime.uniform_stride;

    scene.draw_bind_group.as_ref()
}

/// Writes the per-frame Frame uniform (camera view-projection + world
/// position + light block + view matrix) into the scene runtime's Frame buffer
/// and ensures the Frame bind group exists. Mirrors TS
/// `writeWgpuFrameUniform`.
pub fn write_wgpu_frame_uniform(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    camera: &Camera,
    lights: &SceneLightBlock,
) {
    ensure_wgpu_frame_bind_group(state, scene);

    let mut frame = [0.0f32; FRAME_UNIFORM_FLOATS];

    let aspect = match &camera.projection {
        Projection::Perspective(p) => {
            if p.aspect != 0.0 {
                p.aspect
            } else {
                1.0
            }
        }
        Projection::Orthographic(_) => 1.0,
    };
    let mut view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut view_projection, camera, aspect);
    frame[..16].copy_from_slice(&view_projection.m);

    let mut inverse_view = Matrix4Like::default();
    let view_like = Matrix4Like { m: camera.view.m };
    inverse_matrix4(&mut inverse_view, &view_like);
    let mut camera_position = Vector3Like::default();
    get_matrix4_position(&mut camera_position, &inverse_view);
    frame[16] = camera_position.x;
    frame[17] = camera_position.y;
    frame[18] = camera_position.z;
    frame[19] = 0.0;

    let data = &lights.data;
    frame[20] = data[0];
    frame[21] = data[1];
    frame[22] = data[2];
    frame[23] = lights.directional_count as f32;
    frame[24] = data[4];
    frame[25] = data[5];
    frame[26] = data[6];
    frame[27] = 0.0;
    frame[28] = data[8];
    frame[29] = data[9];
    frame[30] = data[10];
    frame[31] = lights.ambient_count as f32;

    // Camera view matrix (floats 32..47): used by matcap.
    let view = &camera.view.m;
    frame[32..48].copy_from_slice(view);

    state.queue.write_buffer(
        scene.frame_buffer.as_ref().unwrap(),
        0,
        f32_slice_bytes(&frame),
    );
}

/// The shared WGSL prelude every family module prepends.
pub const WGPU_MESH_PRELUDE_WGSL: &str = r#"
const PI : f32 = 3.14159265359;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,
  directionalRadiance : vec4f,
  ambientRadiance : vec4f,
  view : mat4x4f,
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let world = draw.world * vec4f(position, 1.0);
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * normal;
  out.worldTangent = vec4f(draw.normalMatrix * tangent.xyz, tangent.w);
  out.uv = uv;
  return out;
}

fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}
"#;

/// Frame uniform: viewProjection(64), cameraPosition(16), lightDirection(16),
/// directionalRadiance(16), ambientRadiance(16), view(64) = 192 bytes / 48
/// floats.
pub const FRAME_UNIFORM_BYTES: u64 = 192;
const FRAME_UNIFORM_FLOATS: usize = (FRAME_UNIFORM_BYTES / 4) as usize;

/// Draw uniform: world mat4(64) + normal mat3 as 3 padded vec4(48) = 112.
pub const DRAW_UNIFORM_BYTES: u64 = 112;

/// The depth-stencil format the scene pass uses.
pub const DEPTH_STENCIL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth24PlusStencil8;

/// Opaque-white 1x1 RGBA pixel for the shared placeholder texture.
pub const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

/// The canonical interleaved 48-byte PBR vertex layout.
const PBR_VERTEX_LAYOUT: wgpu::VertexBufferLayout<'static> = wgpu::VertexBufferLayout {
    array_stride: 48,
    step_mode: wgpu::VertexStepMode::Vertex,
    attributes: &[
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x3,
            offset: 0,
            shader_location: 0,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x3,
            offset: 12,
            shader_location: 1,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x4,
            offset: 24,
            shader_location: 2,
        },
        wgpu::VertexAttribute {
            format: wgpu::VertexFormat::Float32x2,
            offset: 40,
            shader_location: 3,
        },
    ],
};

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}
