use flight_render::{CreateExternalTextureOptions, EXTERNAL_TEXTURE_SOURCE_KIND, ExternalTexture};
use flight_render_wgpu::*;
use flight_texture::get_texture_source_kind;

use crate::support::*;

fn create_handle(state: &WgpuRenderState, width: u32, height: u32) -> wgpu::Texture {
    let native = get_wgpu_render_state_native_device(state);
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("borrowed-external"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
}

fn external_options(width: u32, height: u32) -> CreateExternalTextureOptions {
    return CreateExternalTextureOptions {
        color_space: None,
        height,
        sampler: None,
        width,
    };
}

mod create_external_wgpu_texture {
    use super::*;

    // The source spies on the handle's destroy(); here the handle is observed to still accept writes
    // after the entry is forgotten.
    #[test]
    fn resolves_a_borrowed_handle_and_forgets_it_without_destroying_the_allocation() {
        let mut state = create_wgpu_render_state_for_test(None);
        let handle = create_handle(&state, 32, 16);
        let texture =
            create_external_wgpu_texture(&mut state, handle.clone(), &external_options(32, 16));

        assert_eq!(
            get_texture_source_kind(&texture).as_deref(),
            Some(EXTERNAL_TEXTURE_SOURCE_KIND)
        );
        let entry = resolve_wgpu_texture(&mut state, &texture, None, None)
            .expect("the external entry resolves");
        assert_eq!(entry.read().unwrap().texture, handle);
        assert!(dispose_external_wgpu_texture(&mut state, &texture));
        assert!(resolve_wgpu_texture(&mut state, &texture, None, None).is_none());
        let native = get_wgpu_render_state_native_device(&state);
        assert!(!is_wgpu_texture_destroyed(&native, &handle));
    }
}

mod dispose_external_wgpu_texture {
    use super::*;

    #[test]
    fn returns_false_after_the_borrowed_handle_has_already_been_forgotten() {
        let mut state = create_wgpu_render_state_for_test(None);
        let handle = create_handle(&state, 1, 1);
        let texture = create_external_wgpu_texture(&mut state, handle, &external_options(1, 1));
        assert!(dispose_external_wgpu_texture(&mut state, &texture));
        assert!(!dispose_external_wgpu_texture(&mut state, &texture));
    }
}

mod initialize_external_wgpu_texture_entry {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_external_wgpu_texture_entry() {
        let state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(4, 4, true);
        let entry = create_wgpu_texture_entry(&state, 4, 4, &canvas).expect("a ready canvas");
        // Stale state the initializer must overwrite.
        let resources = get_wgpu_render_state_device_resources(&state);
        resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true));
        entry.write().unwrap().mip_level_count = 3;
        assert_eq!(entry.read().unwrap().bindings.len(), 1);

        let handle = create_handle(&state, 2, 2);
        let view = handle.create_view(&test_default());
        initialize_external_wgpu_texture_entry(
            &mut entry.write().unwrap(),
            resources.nearest_sampler.clone(),
            handle.clone(),
            view.clone(),
        );

        let entry = entry.read().unwrap();
        assert!(entry.bindings.is_empty());
        assert_eq!(entry.mip_level_count, 1);
        assert_eq!(entry.sampler, Some(resources.nearest_sampler));
        assert_eq!(entry.texture, handle);
        assert_eq!(entry.view, view);
    }
}

mod initialize_external_wgpu_texture_source {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_external_wgpu_texture_source() {
        let mut source: ExternalTexture = test_default();
        source.version = 7;
        initialize_external_wgpu_texture_source(&mut source, &external_options(32, 16));
        assert_eq!(source.width, 32);
        assert_eq!(source.height, 16);
        assert_eq!(source.kind, EXTERNAL_TEXTURE_SOURCE_KIND);
        assert_eq!(source.version, 0);
    }
}
