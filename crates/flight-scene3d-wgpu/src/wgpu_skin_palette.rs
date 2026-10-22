use flight_render_wgpu::{
    get_wgpu_render_state_native_device, WgpuRenderState,
};
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

const WGPU_SKIN_ARENA_WIDTH: u32 = 256;

fn create_wgpu_skin_arena_texture(state: &WgpuRenderState, rows: u32) -> wgpu::Texture {
    let native_device = get_wgpu_render_state_native_device(state);
    return native_device
        .device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("skin_arena"),
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
        });
}

pub fn destroy_wgpu_skin_palette(state: &WgpuRenderState) {
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.skin_palette_texture = None;
        rt.skin_palette_view = None;
        rt.skin_palette_arena_cursor = 0;
        rt.skin_palette_arena_rows = 0;
        rt.skin_palette_arena_bases = None;
        rt.skin_arena_frame = None;
        rt.skin_draw_bind_group = None;
        rt.skin_normal_palette_texture = None;
        rt.skin_normal_palette_view = None;
        rt.skin_normal_palette_arena_cursor = 0;
        rt.skin_normal_palette_arena_rows = 0;
        rt.skin_normal_palette_arena_bases = None;
        rt.skin_mesh_draw_bind_group = None;
    });
}

pub fn ensure_wgpu_skin_draw_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    let existing = get_wgpu_scene3d_runtime(state, |rt| {
        rt.skin_draw_bind_group_layout.is_some()
    });
    if existing {
        return get_wgpu_scene3d_runtime(state, |rt| {
            rt.skin_draw_bind_group_layout.clone().unwrap()
        });
    }

    let native_device = get_wgpu_render_state_native_device(state);
    let layout =
        native_device
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("skin_draw"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: true,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::VERTEX,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float {
                                filterable: false,
                            },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });

    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.skin_draw_bind_group_layout = Some(layout.clone());
    });
    return layout;
}

pub fn ensure_wgpu_skin_mesh_draw_layout(state: &WgpuRenderState) -> wgpu::BindGroupLayout {
    let existing = get_wgpu_scene3d_runtime(state, |rt| {
        rt.skin_mesh_draw_bind_group_layout.is_some()
    });
    if existing {
        return get_wgpu_scene3d_runtime(state, |rt| {
            rt.skin_mesh_draw_bind_group_layout.clone().unwrap()
        });
    }

    let native_device = get_wgpu_render_state_native_device(state);
    let layout =
        native_device
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("skin_mesh_draw"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: true,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::VERTEX,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float {
                                filterable: false,
                            },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::VERTEX,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float {
                                filterable: false,
                            },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });

    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.skin_mesh_draw_bind_group_layout = Some(layout.clone());
    });
    return layout;
}

fn get_wgpu_skin_arena_row_count(texels: u32) -> u32 {
    return (texels + WGPU_SKIN_ARENA_WIDTH - 1) / WGPU_SKIN_ARENA_WIDTH;
}

pub fn get_wgpu_skin_binding_wgsl(group: u32) -> String {
    return format!(
        r#"@group({group}) @binding(1) var jointTexture : texture_2d<f32>;

fn loadJointTexel(i : u32) -> vec4f {{
  return textureLoad(jointTexture, vec2i(i32(i % {WGPU_SKIN_ARENA_WIDTH}u), i32(i / {WGPU_SKIN_ARENA_WIDTH}u)), 0);
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
}}"#
    );
}

pub fn get_wgpu_skin_normal_binding_wgsl(group: u32) -> String {
    return format!(
        r#"@group({group}) @binding(2) var jointNormalTexture : texture_2d<f32>;

fn loadJointNormalTexel(i : u32) -> vec3f {{
  return textureLoad(jointNormalTexture, vec2i(i32(i % {WGPU_SKIN_ARENA_WIDTH}u), i32(i / {WGPU_SKIN_ARENA_WIDTH}u)), 0).xyz;
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
}}"#
    );
}

fn row_aligned_wgpu_skin_arena_texels(texels: u32) -> u32 {
    return get_wgpu_skin_arena_row_count(texels) * WGPU_SKIN_ARENA_WIDTH;
}

pub fn skinned_vertex_buffer_layouts() -> Vec<wgpu::VertexBufferLayout<'static>> {
    return vec![wgpu::VertexBufferLayout {
        array_stride: 80,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &[
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
        ],
    }];
}

pub fn write_wgpu_skin_arena_region(
    state: &WgpuRenderState,
    texture: &wgpu::Texture,
    palette: &[f32],
    base: u32,
) {
    let texels = (palette.len() as u32) / 4;
    let start_row = base / WGPU_SKIN_ARENA_WIDTH;
    let full_rows = texels / WGPU_SKIN_ARENA_WIDTH;
    let remainder = texels - full_rows * WGPU_SKIN_ARENA_WIDTH;
    let native_device = get_wgpu_render_state_native_device(state);
    let queue = &native_device.queue;

    if full_rows > 0 {
        queue.write_texture(
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
            unsafe { std::slice::from_raw_parts(palette.as_ptr() as *const u8, std::mem::size_of_val(palette)) },
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
        let byte_offset = (full_rows * WGPU_SKIN_ARENA_WIDTH * 16) as usize;
        queue.write_texture(
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
            unsafe { let s = &palette[byte_offset / 4..]; std::slice::from_raw_parts(s.as_ptr() as *const u8, std::mem::size_of_val(s)) },
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(remainder * 16),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: remainder,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
    }
}
