use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};
use flight_texture::{CubeFace, Environment, TextureSource};

use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub fn ensure_wgpu_environment_source_cube(
    state: &WgpuRenderState,
    environment: &Environment,
) -> bool {
    let has_view = get_wgpu_scene3d_runtime(state, |rt| {
        rt.environment_source_cube_view.is_some()
    });
    if has_view {
        return true;
    }

    let cube = match &environment.environment {
        Some(cube) => cube,
        None => return false,
    };
    if cube.sources.len() < 6 {
        return false;
    }

    let size = match cube.sources.first() {
        Some(source) => source.width,
        None => return false,
    };

    let native_device = get_wgpu_render_state_native_device(state);
    let format = if cube.color_space == "srgb" {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };

    let texture = native_device.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("environment_source_cube"),
        size: wgpu::Extent3d {
            width: size,
            height: size,
            depth_or_array_layers: 6,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_DST
            | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });

    for face in 0..6u32 {
        if let Some(source) = cube.sources.get(face as usize) {
            upload_wgpu_environment_image(
                &native_device.device,
                &native_device.queue,
                &texture,
                face,
                source,
            );
        }
    }

    let view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..Default::default()
    });

    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.environment_source_cube = Some(texture);
        rt.environment_source_cube_view = Some(view);
    });

    return true;
}

pub fn update_wgpu_environment_cube_face(
    state: &WgpuRenderState,
    face: u32,
    image: &dyn TextureSource,
) -> bool {
    let has_cube = get_wgpu_scene3d_runtime(state, |rt| {
        rt.environment_source_cube.is_some()
    });
    if !has_cube {
        return false;
    }

    let native_device = get_wgpu_render_state_native_device(state);
    get_wgpu_scene3d_runtime(state, |rt| {
        if let Some(texture) = &rt.environment_source_cube {
            upload_wgpu_environment_image(
                &native_device.device,
                &native_device.queue,
                texture,
                face,
                image,
            );
        }
    });

    return true;
}

fn upload_wgpu_environment_image(
    _device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    face: u32,
    source: &dyn TextureSource,
) {
    if let Some(data) = &source.data {
        let bytes_per_row = source.width * 4;
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d {
                    x: 0,
                    y: 0,
                    z: face,
                },
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(source.height),
            },
            wgpu::Extent3d {
                width: source.width,
                height: source.height,
                depth_or_array_layers: 1,
            },
        );
    }
}
