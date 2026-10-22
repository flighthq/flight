// flight-lint: allow-file(contract-vocabulary) D17: the source cube upload returns the native wgpu cube view
//! Uploads an environment's source radiance cubemap (TS `wgpuEnvironmentCube.ts`): the WGSL mirror of
//! scene3d-gl's `ensure_gl_environment_source_cube`. Each face uploads through the representation it
//! carries: an external copy for an image resource, a queue write for a data-only bitmap.

use std::any::Any;

use flight_bitmap::{BITMAP_TEXTURE_SOURCE_KIND, Bitmap};
use flight_image::{IMAGE_TEXTURE_SOURCE_KIND, ImageResource};
use flight_lighting::Environment;
use flight_render_wgpu::{
    WgpuNativeDevice, WgpuRenderState, create_wgpu_texture, get_wgpu_render_state_native_device,
    upload_wgpu_texture_data, upload_wgpu_texture_image_resource,
};
use flight_texture::{Texture, TextureColorSpace, TextureSource, TextureUvTransform};

use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// Uploads the environment's six-face source cube to a wgpu cube texture, cached on the scene
/// runtime, and returns its cube view; `None` when the environment has no complete cube (TS
/// `ensureWgpuEnvironmentSourceCube`). The upload is keyed by identity: re-uploaded only once the
/// cached view is dropped (`destroy_wgpu_scene3d_ibl`). The texture's color space selects
/// rgba8unorm or rgba8unorm-srgb, so hardware sampling decodes.
pub fn ensure_wgpu_environment_source_cube(
    state: &mut WgpuRenderState,
    environment: &Environment,
) -> Option<wgpu::TextureView> {
    if let Some(view) = &get_wgpu_scene3d_runtime(state).environment_source_cube_view {
        return Some(view.clone());
    }
    let cube = environment.environment.as_ref()?;
    let cube = cube.read().unwrap();
    if !has_wgpu_cube_face_pixels(&cube) {
        return None;
    }
    let Texture::Cube(cube_texture) = &*cube else {
        return None;
    };
    let sources = &cube_texture.sources;

    // Cube textures are square; every face shares the +X face's dimensions.
    let size = sources[0]
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .texture_source_fields()
        .width;
    let native = get_wgpu_render_state_native_device(state);
    let format = if cube.texture_fields().color_space == TextureColorSpace::Srgb {
        wgpu::TextureFormat::Rgba8UnormSrgb
    } else {
        wgpu::TextureFormat::Rgba8Unorm
    };
    let texture = create_wgpu_texture(
        &native,
        &wgpu::TextureDescriptor {
            label: None,
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
        },
    );
    // Each face uploads into its array layer in +X, -X, +Y, -Y, +Z, -Z order.
    for (face, source) in sources.iter().enumerate() {
        let source = source.as_ref().unwrap().read().unwrap();
        upload_wgpu_environment_image(&native, &texture, face as u32, &*source);
    }

    let view = texture.create_view(&wgpu::TextureViewDescriptor {
        dimension: Some(wgpu::TextureViewDimension::Cube),
        ..wgpu::TextureViewDescriptor::default()
    });
    let scene = get_wgpu_scene3d_runtime(state);
    scene.environment_source_cube = Some(texture);
    scene.environment_source_cube_view = Some(view.clone());
    return Some(view);
}

// A cube is complete only when all six faces carry pixels: an image resource or a data bitmap.
fn has_wgpu_cube_face_pixels(cube: &Texture) -> bool {
    let Texture::Cube(cube) = cube else {
        return false;
    };
    for source in &cube.sources {
        let Some(source) = source else {
            return false;
        };
        let source = source.read().unwrap();
        let kind = &source.texture_source_fields().kind;
        if kind != IMAGE_TEXTURE_SOURCE_KIND && kind != BITMAP_TEXTURE_SOURCE_KIND {
            return false;
        }
    }
    return true;
}

/// Restamps one face of the already-built source cube in place (TS `updateWgpuEnvironmentCubeFace`);
/// `false` when no cube has been built yet.
pub fn update_wgpu_environment_cube_face(
    state: &mut WgpuRenderState,
    face: u32,
    image: &dyn TextureSource,
) -> bool {
    let Some(texture) = get_wgpu_scene3d_runtime(state)
        .environment_source_cube
        .clone()
    else {
        return false;
    };
    let native = get_wgpu_render_state_native_device(state);
    upload_wgpu_environment_image(&native, &texture, face, image);
    return true;
}

fn upload_wgpu_environment_image(
    device: &WgpuNativeDevice,
    texture: &wgpu::Texture,
    face: u32,
    image: &dyn TextureSource,
) {
    let origin = wgpu::Origin3d {
        x: 0,
        y: 0,
        z: face,
    };
    let any = image as &dyn Any;
    if image.texture_source_fields().kind == BITMAP_TEXTURE_SOURCE_KIND {
        if let Some(bitmap) = any.downcast_ref::<Bitmap>() {
            let fields = bitmap.texture_source_fields();
            upload_wgpu_texture_data(
                device,
                texture,
                origin,
                fields.width,
                fields.height,
                &bitmap.data,
            );
        }
    } else if let Some(resource) = any.downcast_ref::<ImageResource>() {
        upload_wgpu_texture_image_resource(device, texture, origin, resource);
    }
}
