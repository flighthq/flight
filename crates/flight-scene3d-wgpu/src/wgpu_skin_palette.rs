// flight-lint: allow-file(contract-vocabulary) D17: the skinning seams take and return native wgpu values
//! GPU skinning (TS `wgpuSkinPalette.ts`): the per-frame joint and normal palette arenas, the skinned
//! draw bind groups and layouts for the shadow and mesh paths, the skinned WGSL prelude extensions,
//! and the opt-in adapter that fills render-wgpu's skinning seam.

use std::collections::HashMap;

use std::sync::Arc;

use flight_entity::{Float32Array, Ref};
use flight_meshgeometry::{
    MeshGeometry, MeshSkinBindPose, VertexSemantic, get_mesh_geometry_morph_bind_pose,
    get_mesh_geometry_skin_bind_pose,
};
use flight_render_wgpu::{
    WgpuRenderState, WgpuSkinningAdapter, create_wgpu_bind_group, create_wgpu_bind_group_layout,
    create_wgpu_texture, get_wgpu_render_state_native_device, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut, retire_wgpu_texture, write_wgpu_texture,
};
use flight_scene3d::Mesh;

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

// Texels per arena row. 256 holds a 64-joint skeleton in exactly one row for the pose palette, and
// the row wrap is reachable by any skeleton past that.
const WGPU_SKIN_ARENA_WIDTH: u32 = 256;

// The Draw ring slot size the skin bind groups expose at binding 0.
const SKIN_DRAW_UNIFORM_BYTES: u64 = 176;

const SKINNED_VERTEX_ATTRIBUTES: [wgpu::VertexAttribute; 6] = [
    wgpu::VertexAttribute {
        shader_location: 0,
        offset: 0,
        format: wgpu::VertexFormat::Float32x3,
    },
    wgpu::VertexAttribute {
        shader_location: 1,
        offset: 12,
        format: wgpu::VertexFormat::Float32x3,
    },
    wgpu::VertexAttribute {
        shader_location: 2,
        offset: 24,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 3,
        offset: 40,
        format: wgpu::VertexFormat::Float32x2,
    },
    wgpu::VertexAttribute {
        shader_location: 4,
        offset: 48,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 5,
        offset: 64,
        format: wgpu::VertexFormat::Float32x4,
    },
];

const SKINNED_VERTEX_BUFFER_LAYOUTS: [wgpu::VertexBufferLayout<'static>; 1] =
    [wgpu::VertexBufferLayout {
        array_stride: 80,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &SKINNED_VERTEX_ATTRIBUTES,
    }];

/// The opt-in GPU skinning adapter (TS `wgpuSkinningAdapter`): the 80-byte skinned vertex with
/// joints0 at location 4 and weights0 at location 5, the arena palettes and the skinned preludes.
pub static WGPU_SKINNING_ADAPTER: WgpuSkinningAdapter = WgpuSkinningAdapter {
    extend_mesh_prelude,
    extend_shadow_depth_prelude,
    get_draw_bind_group: ensure_wgpu_skin_draw_bind_group,
    get_draw_layout: ensure_wgpu_skin_draw_layout,
    get_mesh_draw_bind_group: ensure_wgpu_skin_mesh_draw_bind_group,
    get_mesh_draw_layout: ensure_wgpu_skin_mesh_draw_layout,
    get_upload_vertices,
    has_bind_pose,
    is_gpu_skinned,
    vertex_buffer_layouts: &SKINNED_VERTEX_BUFFER_LAYOUTS,
};

fn create_wgpu_skin_arena_texture(state: &WgpuRenderState, rows: u32) -> wgpu::Texture {
    let native = get_wgpu_render_state_native_device(state);
    return create_wgpu_texture(
        &native,
        &wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: WGPU_SKIN_ARENA_WIDTH,
                height: rows,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba32Float,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        },
    );
}

// Starts a new arena frame when render-wgpu has opened a new command encoder; the encoder serial is
// the frame identity (TS: the encoder object), absent while no frame is open.
fn begin_wgpu_skin_arena_frame(state: &mut WgpuRenderState) {
    let runtime = get_wgpu_render_state_runtime(state);
    let frame = if runtime.command_encoder.is_some() {
        Some(runtime.command_encoder_serial)
    } else {
        None
    };
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.skin_arena_frame == frame && scene.skin_palette_arena_bases.is_some() {
        return;
    }
    scene.skin_arena_frame = frame;
    scene.skin_palette_arena_cursor = 0;
    scene.skin_normal_palette_arena_cursor = 0;
    scene.skin_palette_arena_bases = Some(HashMap::new());
    scene.skin_normal_palette_arena_bases = Some(HashMap::new());
    scene.skin_palette_arena_replays.clear();
    scene.skin_normal_palette_arena_replays.clear();
}

// The bind-pose positions and normals spliced into a copy of the interleaved vertices.
fn build_skin_bind_vertices(geometry: &MeshGeometry, bind_pose: &MeshSkinBindPose) -> Vec<f32> {
    let mut out = geometry.vertices.to_vec();
    let floats_per_vertex = (geometry.layout.read().unwrap().stride / 4) as usize;
    let position_offset = float_offset_for_semantic(geometry, VertexSemantic::Position);
    let normal_offset = float_offset_for_semantic(geometry, VertexSemantic::Normal);
    let vertex_count = bind_pose.positions.len() / 3;
    for vertex in 0..vertex_count {
        let base = vertex * floats_per_vertex;
        let source = vertex * 3;
        if let Some(offset) = position_offset {
            out[base + offset..base + offset + 3]
                .copy_from_slice(&bind_pose.positions[source..source + 3]);
        }
        if let Some(offset) = normal_offset {
            out[base + offset..base + offset + 3]
                .copy_from_slice(&bind_pose.normals[source..source + 3]);
        }
    }
    return out;
}

/// Frees the palette arenas and their bind groups (TS `destroyWgpuSkinPalette`).
pub fn destroy_wgpu_skin_palette(state: &mut WgpuRenderState) {
    let runtime = get_wgpu_scene3d_runtime(state);
    if let Some(texture) = runtime.skin_palette_texture.take() {
        texture.destroy();
    }
    runtime.skin_palette_view = None;
    runtime.skin_palette_arena_cursor = 0;
    runtime.skin_palette_arena_rows = 0;
    runtime.skin_palette_arena_bases = None;
    runtime.skin_palette_arena_replays.clear();
    runtime.skin_arena_frame = None;
    runtime.skin_draw_bind_group = None;
    // The mesh path's own texture and bind group, freed here too.
    if let Some(texture) = runtime.skin_normal_palette_texture.take() {
        texture.destroy();
    }
    runtime.skin_normal_palette_view = None;
    runtime.skin_normal_palette_arena_cursor = 0;
    runtime.skin_normal_palette_arena_rows = 0;
    runtime.skin_normal_palette_arena_bases = None;
    runtime.skin_normal_palette_arena_replays.clear();
    runtime.skin_mesh_draw_bind_group = None;
}

fn draw_uniform_layout_entry() -> wgpu::BindGroupLayoutEntry {
    // Binding 0 is the shared Draw uniform, which the fragment tail reads too: stage-for-stage
    // identical to the rigid Draw layout, or a skinned pipeline fails validation.
    return wgpu::BindGroupLayoutEntry {
        binding: 0,
        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: true,
            min_binding_size: None,
        },
        count: None,
    };
}

/// Uploads the pose palette and returns the shadow path's skinned Draw bind group: the Draw ring at
/// binding 0 and the pose palette at binding 1 (TS `ensureWgpuSkinDrawBindGroup`).
pub fn ensure_wgpu_skin_draw_bind_group(
    state: &mut WgpuRenderState,
    joint_matrices: &Ref<Box<Float32Array>>,
) -> wgpu::BindGroup {
    upload_wgpu_skin_palette(state, joint_matrices);
    let layout = ensure_wgpu_skin_draw_layout(state);
    let native = get_wgpu_render_state_native_device(state);
    let uniform_buffer = get_wgpu_render_state_runtime(state).uniform_buffer.clone();
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.skin_draw_bind_group.is_none() {
        let view = scene.skin_palette_view.clone().unwrap();
        scene.skin_draw_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                        buffer: &uniform_buffer,
                        offset: 0,
                        size: wgpu::BufferSize::new(SKIN_DRAW_UNIFORM_BYTES),
                    }),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
            ],
        ));
    }
    return scene.skin_draw_bind_group.clone().unwrap();
}

/// The shadow path's skinned Draw layout (TS `ensureWgpuSkinDrawLayout`): the dynamic-offset Draw
/// uniform (vertex + fragment, matching the rigid Draw layout) and the vertex-stage pose palette.
pub fn ensure_wgpu_skin_draw_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.skin_draw_bind_group_layout.is_none() {
        scene.skin_draw_bind_group_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[draw_uniform_layout_entry(), palette_layout_entry(1)],
        ));
    }
    return scene.skin_draw_bind_group_layout.clone().unwrap();
}

/// Uploads both palettes and returns the mesh path's skinned Draw bind group: the Draw ring at 0,
/// the pose palette at 1 and the normal palette at 2 (TS `ensureWgpuSkinMeshDrawBindGroup`).
/// Separate from the shadow path's group so the shadow pipeline never declares a normal palette.
pub fn ensure_wgpu_skin_mesh_draw_bind_group(
    state: &mut WgpuRenderState,
    joint_matrices: &Ref<Box<Float32Array>>,
    normal_matrices: &Ref<Box<Float32Array>>,
) -> wgpu::BindGroup {
    upload_wgpu_skin_palette(state, joint_matrices);
    upload_wgpu_skin_normal_palette(state, normal_matrices);
    let layout = ensure_wgpu_skin_mesh_draw_layout(state);
    let native = get_wgpu_render_state_native_device(state);
    let uniform_buffer = get_wgpu_render_state_runtime(state).uniform_buffer.clone();
    let scene = get_wgpu_scene3d_runtime(state);
    // Growing an arena clears the bind group, so a missing group is the whole invalidation rule.
    if scene.skin_mesh_draw_bind_group.is_none() {
        let pose_view = scene.skin_palette_view.clone().unwrap();
        let normal_view = scene.skin_normal_palette_view.clone().unwrap();
        scene.skin_mesh_draw_bind_group = Some(create_wgpu_bind_group(
            &native,
            &layout,
            &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                        buffer: &uniform_buffer,
                        offset: 0,
                        size: wgpu::BufferSize::new(SKIN_DRAW_UNIFORM_BYTES),
                    }),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&pose_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&normal_view),
                },
            ],
        ));
    }
    return scene.skin_mesh_draw_bind_group.clone().unwrap();
}

/// The mesh path's skinned Draw layout: the shadow path's two bindings plus the vertex-stage normal
/// palette at binding 2 (TS `ensureWgpuSkinMeshDrawLayout`).
pub fn ensure_wgpu_skin_mesh_draw_layout(state: &mut WgpuRenderState) -> wgpu::BindGroupLayout {
    let native = get_wgpu_render_state_native_device(state);
    let scene = get_wgpu_scene3d_runtime(state);
    if scene.skin_mesh_draw_bind_group_layout.is_none() {
        scene.skin_mesh_draw_bind_group_layout = Some(create_wgpu_bind_group_layout(
            &native,
            &[
                draw_uniform_layout_entry(),
                palette_layout_entry(1),
                palette_layout_entry(2),
            ],
        ));
    }
    return scene.skin_mesh_draw_bind_group_layout.clone().unwrap();
}

fn extend_mesh_prelude(rigid_prelude: &str) -> String {
    return rigid_prelude
        .replacen(
            "@group(1) @binding(0) var<uniform> draw : Draw;",
            &format!(
                "@group(1) @binding(0) var<uniform> draw : Draw;\n{}\n{}",
                get_wgpu_skin_binding_wgsl(1),
                get_wgpu_skin_normal_binding_wgsl(1)
            ),
            1,
        )
        .replacen(
            "  @location(3) uv : vec2f,\n  @location(6) instanceModel0 : vec4f,",
            "  @location(3) uv : vec2f,\n  @location(4) joints0 : vec4f,\n  @location(5) weights0 : vec4f,\n  @location(6) instanceModel0 : vec4f,",
            1,
        )
        .replacen(
            "  var localTangent = tangent.xyz;\n  let instanceModel =",
            "  var localTangent = tangent.xyz;\n  let skin = skinMatrix(joints0, weights0);\n  localPosition = skin * localPosition;\n  localNormal = skinNormalMatrix(joints0, weights0) * localNormal;\n  localTangent = (skin * vec4f(localTangent, 0.0)).xyz;\n  let instanceModel =",
            1,
        );
}

fn extend_shadow_depth_prelude(rigid_prelude: &str) -> String {
    return rigid_prelude
        .replacen(
            "@group(0) @binding(0) var<uniform> draw : Draw;",
            &format!(
                "@group(0) @binding(0) var<uniform> draw : Draw;\n{}",
                get_wgpu_skin_binding_wgsl(0)
            ),
            1,
        )
        .replacen(
            "@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {",
            "@vertex fn vs_main(\n  @location(0) position : vec3f,\n  @location(4) joints0 : vec4f,\n  @location(5) weights0 : vec4f,\n) -> @builtin(position) vec4f {",
            1,
        )
        .replacen(
            "  var clip = draw.world * vec4f(position, 1.0);",
            "  var clip = draw.world * skinMatrix(joints0, weights0) * vec4f(position, 1.0);",
            1,
        );
}

fn float_offset_for_semantic(geometry: &MeshGeometry, semantic: VertexSemantic) -> Option<usize> {
    let layout = geometry.layout.read().unwrap();
    for attribute in &layout.attributes {
        if attribute.semantic == semantic {
            return Some((attribute.byte_offset / 4) as usize);
        }
    }
    return None;
}

fn get_upload_vertices(geometry: &MeshGeometry) -> Option<Vec<f32>> {
    if get_mesh_geometry_morph_bind_pose(geometry).is_some() {
        return None;
    }
    let bind_pose = get_mesh_geometry_skin_bind_pose(geometry)?;
    return Some(build_skin_bind_vertices(
        geometry,
        &bind_pose.read().unwrap(),
    ));
}

fn get_wgpu_skin_arena_row_count(texels: u32) -> u32 {
    return 1.max(texels.div_ceil(WGPU_SKIN_ARENA_WIDTH));
}

// The palette WGSL: the joint texture, an arena texel fetch, a joint mat4 from four texels at the
// draw's arena base (draw.params.z) and the weighted skin matrix. The arena width is formatted from
// the constant that sizes the texture, so the shader's row arithmetic cannot drift.
fn get_wgpu_skin_binding_wgsl(group: u32) -> String {
    return format!(
        "@group({group}) @binding(1) var jointTexture : texture_2d<f32>;

fn loadJointTexel(i : u32) -> vec4f {{
  return textureLoad(jointTexture, vec2i(i32(i % {width}u), i32(i / {width}u)), 0);
}}

fn fetchJointMatrix(joint : u32) -> mat4x4f {{
  let x = u32(draw.params.z) + joint * 4u;
  return mat4x4f(
    loadJointTexel(x),
    loadJointTexel(x + 1u),
    loadJointTexel(x + 2u),
    loadJointTexel(x + 3u)
  );
}}

fn skinMatrix(joints : vec4f, weights : vec4f) -> mat4x4f {{
  return weights.x * fetchJointMatrix(u32(joints.x))
       + weights.y * fetchJointMatrix(u32(joints.y))
       + weights.z * fetchJointMatrix(u32(joints.z))
       + weights.w * fetchJointMatrix(u32(joints.w));
}}",
        group = group,
        width = WGPU_SKIN_ARENA_WIDTH
    );
}

// The mesh path's normal palette WGSL: three texels per joint at the draw's normal arena base
// (draw.params.w), blended per joint (an approximation of the blended inverse-transpose, shared by
// the CPU and GL paths).
fn get_wgpu_skin_normal_binding_wgsl(group: u32) -> String {
    return format!(
        "@group({group}) @binding(2) var jointNormalTexture : texture_2d<f32>;

fn loadJointNormalTexel(i : u32) -> vec3f {{
  return textureLoad(jointNormalTexture, vec2i(i32(i % {width}u), i32(i / {width}u)), 0).xyz;
}}

fn fetchJointNormalMatrix(joint : u32) -> mat3x3f {{
  let x = u32(draw.params.w) + joint * 3u;
  return mat3x3f(
    loadJointNormalTexel(x),
    loadJointNormalTexel(x + 1u),
    loadJointNormalTexel(x + 2u)
  );
}}

fn skinNormalMatrix(joints : vec4f, weights : vec4f) -> mat3x3f {{
  return weights.x * fetchJointNormalMatrix(u32(joints.x))
       + weights.y * fetchJointNormalMatrix(u32(joints.y))
       + weights.z * fetchJointNormalMatrix(u32(joints.z))
       + weights.w * fetchJointNormalMatrix(u32(joints.w));
}}",
        group = group,
        width = WGPU_SKIN_ARENA_WIDTH
    );
}

fn has_bind_pose(geometry: &MeshGeometry) -> bool {
    return get_mesh_geometry_morph_bind_pose(geometry).is_none()
        && get_mesh_geometry_skin_bind_pose(geometry).is_some();
}

fn is_gpu_skinned(mesh: &Mesh) -> bool {
    if mesh.skin.is_none() {
        return false;
    }
    let geometry = mesh.geometry.read().unwrap();
    let layout = geometry.layout.read().unwrap();
    let mut has_joints = false;
    let mut has_weights = false;
    for attribute in &layout.attributes {
        if attribute.semantic == VertexSemantic::Joints0 {
            has_joints = true;
        }
        if attribute.semantic == VertexSemantic::Weights0 {
            has_weights = true;
        }
    }
    return has_joints && has_weights;
}

fn palette_layout_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::VERTEX,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: false },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    };
}

/// Opts a state into GPU skinning (TS `registerWgpuGpuSkinning`): installs the adapter in the
/// registry and on the scene runtime.
pub fn register_wgpu_gpu_skinning(state: &mut WgpuRenderState) {
    get_wgpu_render_state_runtime_mut(state)
        .registries
        .gpu_skinning = Some(&WGPU_SKINNING_ADAPTER);
    get_wgpu_scene3d_runtime(state).skinning_adapter = Some(&WGPU_SKINNING_ADAPTER);
}

// Regions start on a row boundary so every write is a rectangle.
fn row_aligned_wgpu_skin_arena_texels(texels: u32) -> u32 {
    return get_wgpu_skin_arena_row_count(texels) * WGPU_SKIN_ARENA_WIDTH;
}

/// Uploads the per-joint normal palette (three texels per joint: a 3x3 as three padded columns)
/// into its arena and returns the base texel its region starts at (TS
/// `uploadWgpuSkinNormalPalette`). The joint count divides by 12, not 16.
pub fn upload_wgpu_skin_normal_palette(
    state: &mut WgpuRenderState,
    normal_matrices: &Ref<Box<Float32Array>>,
) -> u32 {
    begin_wgpu_skin_arena_frame(state);
    // The arena holds every palette handle it keys for the frame, so the address key cannot be reused
    // by another palette before the bases reset; the handle is still compared on lookup.
    let key = Arc::as_ptr(normal_matrices) as usize;
    if let Some(existing) = get_wgpu_scene3d_runtime(state)
        .skin_normal_palette_arena_bases
        .as_ref()
        .and_then(|bases| bases.get(&key))
        .filter(|(palette, _)| Arc::ptr_eq(palette, normal_matrices))
        .map(|(_, base)| *base)
    {
        return existing;
    }

    let texels = (normal_matrices.read().unwrap().len() as u32 / 12) * 3;
    let base = get_wgpu_scene3d_runtime(state).skin_normal_palette_arena_cursor;
    let rows = get_wgpu_skin_arena_row_count(base + texels);
    if rows > get_wgpu_scene3d_runtime(state).skin_normal_palette_arena_rows {
        if let Some(texture) = get_wgpu_scene3d_runtime(state)
            .skin_normal_palette_texture
            .take()
        {
            retire_wgpu_texture(state, texture);
        }
        let texture = create_wgpu_skin_arena_texture(state, rows);
        let scene = get_wgpu_scene3d_runtime(state);
        scene.skin_normal_palette_view =
            Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        scene.skin_normal_palette_texture = Some(texture.clone());
        scene.skin_normal_palette_arena_rows = rows;
        scene.skin_mesh_draw_bind_group = None;
        // A grown arena is a new texture: replay every region already handed out this frame.
        let replays = scene.skin_normal_palette_arena_replays.clone();
        for (palette, replay_base) in replays {
            write_wgpu_skin_arena_region(state, &texture, &palette.read().unwrap(), replay_base);
        }
    }
    let texture = get_wgpu_scene3d_runtime(state)
        .skin_normal_palette_texture
        .clone()
        .unwrap();
    write_wgpu_skin_arena_region(state, &texture, &normal_matrices.read().unwrap(), base);
    let scene = get_wgpu_scene3d_runtime(state);
    scene.skin_normal_palette_arena_cursor = base + row_aligned_wgpu_skin_arena_texels(texels);
    scene
        .skin_normal_palette_arena_bases
        .get_or_insert_with(HashMap::new)
        .insert(key, (normal_matrices.clone(), base));
    scene
        .skin_normal_palette_arena_replays
        .push((normal_matrices.clone(), base));
    scene.pending_skin_normal_palette_base = base;
    return base;
}

/// Uploads one flat column-major joint palette (four texels per mat4) into the per-frame arena and
/// returns the base texel its region starts at (TS `uploadWgpuSkinPalette`). A palette already
/// resident this frame (the shadow and mesh passes of one skeleton) shares its region.
pub fn upload_wgpu_skin_palette(
    state: &mut WgpuRenderState,
    joint_matrices: &Ref<Box<Float32Array>>,
) -> u32 {
    begin_wgpu_skin_arena_frame(state);
    // The arena holds every palette handle it keys for the frame, so the address key cannot be reused
    // by another palette before the bases reset; the handle is still compared on lookup.
    let key = Arc::as_ptr(joint_matrices) as usize;
    if let Some(existing) = get_wgpu_scene3d_runtime(state)
        .skin_palette_arena_bases
        .as_ref()
        .and_then(|bases| bases.get(&key))
        .filter(|(palette, _)| Arc::ptr_eq(palette, joint_matrices))
        .map(|(_, base)| *base)
    {
        get_wgpu_scene3d_runtime(state).pending_skin_palette_base = existing;
        return existing;
    }

    let texels = (joint_matrices.read().unwrap().len() as u32 / 16) * 4;
    let base = get_wgpu_scene3d_runtime(state).skin_palette_arena_cursor;
    let rows = get_wgpu_skin_arena_row_count(base + texels);
    if rows > get_wgpu_scene3d_runtime(state).skin_palette_arena_rows {
        if let Some(texture) = get_wgpu_scene3d_runtime(state).skin_palette_texture.take() {
            retire_wgpu_texture(state, texture);
        }
        let texture = create_wgpu_skin_arena_texture(state, rows);
        let scene = get_wgpu_scene3d_runtime(state);
        scene.skin_palette_view =
            Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        scene.skin_palette_texture = Some(texture.clone());
        scene.skin_palette_arena_rows = rows;
        scene.skin_draw_bind_group = None;
        scene.skin_mesh_draw_bind_group = None;
        let replays = scene.skin_palette_arena_replays.clone();
        for (palette, replay_base) in replays {
            write_wgpu_skin_arena_region(state, &texture, &palette.read().unwrap(), replay_base);
        }
    }
    let texture = get_wgpu_scene3d_runtime(state)
        .skin_palette_texture
        .clone()
        .unwrap();
    write_wgpu_skin_arena_region(state, &texture, &joint_matrices.read().unwrap(), base);
    let scene = get_wgpu_scene3d_runtime(state);
    scene.skin_palette_arena_cursor = base + row_aligned_wgpu_skin_arena_texels(texels);
    scene
        .skin_palette_arena_bases
        .get_or_insert_with(HashMap::new)
        .insert(key, (joint_matrices.clone(), base));
    scene
        .skin_palette_arena_replays
        .push((joint_matrices.clone(), base));
    scene.pending_skin_palette_base = base;
    return base;
}

// Writes one palette into its arena region as at most two rectangles: the whole rows it fills,
// then the partial row left over. `base` is row-aligned.
fn write_wgpu_skin_arena_region(
    state: &WgpuRenderState,
    texture: &wgpu::Texture,
    palette: &[f32],
    base: u32,
) {
    let native = get_wgpu_render_state_native_device(state);
    let texels = palette.len() as u32 / 4;
    let start_row = base / WGPU_SKIN_ARENA_WIDTH;
    let full_rows = texels / WGPU_SKIN_ARENA_WIDTH;
    let remainder = texels - full_rows * WGPU_SKIN_ARENA_WIDTH;
    let data: &[u8] = bytemuck::cast_slice(palette);
    if full_rows > 0 {
        let byte_count = (full_rows * WGPU_SKIN_ARENA_WIDTH * 16) as usize;
        write_wgpu_texture(
            &native,
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d {
                    x: 0,
                    y: start_row,
                    z: 0,
                },
                aspect: wgpu::TextureAspect::All,
            },
            &data[..byte_count],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(WGPU_SKIN_ARENA_WIDTH * 16),
                rows_per_image: Some(full_rows),
            },
            wgpu::Extent3d {
                width: WGPU_SKIN_ARENA_WIDTH,
                height: full_rows,
                depth_or_array_layers: 1,
            },
        );
    }
    if remainder > 0 {
        let offset = (full_rows * WGPU_SKIN_ARENA_WIDTH * 16) as usize;
        write_wgpu_texture(
            &native,
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d {
                    x: 0,
                    y: start_row + full_rows,
                    z: 0,
                },
                aspect: wgpu::TextureAspect::All,
            },
            &data[offset..offset + (remainder * 16) as usize],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(remainder * 16),
                rows_per_image: None,
            },
            wgpu::Extent3d {
                width: remainder,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
    }
}
