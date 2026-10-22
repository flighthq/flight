use flight_render_wgpu::{get_wgpu_render_state_native_device, WgpuRenderState};
use flight_lighting::Environment;
use flight_texture::{Texture, TextureColorSpace, TextureSource, TextureUvTransform};

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

    let texture_ref = match &environment.environment {
        Some(t) => t,
        None => return false,
    };
    let texture_guard = texture_ref.read().unwrap();
    let cube = match &*texture_guard {
        Texture::Cube(c) => c,
        _ => return false,
    };

    let first_source_ref = match &cube.sources[0] {
        Some(s) => s,
        None => return false,
    };
    let first_source = first_source_ref.read().unwrap();
    let size = first_source.texture_source_fields().width;
    drop(first_source);

    let native_device = get_wgpu_render_state_native_device(state);
    let format = if texture_guard.texture_fields().color_space == TextureColorSpace::Srgb {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };

    let gpu_texture = native_device.device.create_texture(&wgpu::TextureDescriptor {
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
        if let Some(source_ref) = &cube.sources[face as usize] {
            let source = source_ref.read().unwrap();
            upload_wgpu_environment_image(
                &native_device.device,
                &native_device.queue,
                &gpu_texture,
                face,
                &*source,
            );
        }
    }

    let view = gpu_texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..Default::default()
    });

    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.environment_source_cube = Some(gpu_texture);
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
    _queue: &wgpu::Queue,
    _texture: &wgpu::Texture,
    _face: u32,
    _source: &dyn TextureSource,
) {
    // TODO: implement texture upload from TextureSource trait
    // Needs runtime texture data access API (e.g. bitmap data extraction)
}
