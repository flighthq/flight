use flight_render_wgpu::*;

use crate::support::*;

// A real texture carrying exactly the chain `generate_wgpu_mipmaps` renders into.
fn create_mip_texture(
    state: &WgpuRenderState,
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
) -> wgpu::Texture {
    let native = get_wgpu_render_state_native_device(state);
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: get_wgpu_mip_level_count(width, height),
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::COPY_DST
            | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
}

fn mipmap_pipeline(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
) -> Option<wgpu::RenderPipeline> {
    return get_wgpu_render_state_runtime(state)
        .context
        .read()
        .unwrap()
        .mipmap_pipeline_cache
        .get(&format)
        .map(|cached| cached.pipeline.clone());
}

mod generate_wgpu_mipmaps {
    use super::*;

    // The source counts beginRenderPass/submit on a spied encoder. A real device instead validates
    // every pass: a 4x4 texture has exactly 3 levels, so passes into levels 1 and 2 succeed and any
    // pass beyond the chain would fail view creation; the cached pipeline shows the work was encoded.
    #[test]
    fn renders_one_downsample_pass_per_generated_mip_level_for_a_multi_level_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = create_mip_texture(&state, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!(texture.mip_level_count(), 3);
        let native = get_wgpu_render_state_native_device(&state);
        let ((), error) = capture_wgpu_validation_error(&native, || {
            generate_wgpu_mipmaps(&mut state, &texture, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        });
        assert!(error.is_none(), "{error:?}");
        assert!(mipmap_pipeline(&state, wgpu::TextureFormat::Rgba8Unorm).is_some());
    }

    // No pass and no submit are observable as no pipeline ever being built for the format.
    #[test]
    fn is_a_no_op_for_a_single_level_1x1_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = create_mip_texture(&state, 1, 1, wgpu::TextureFormat::Rgba8Unorm);
        generate_wgpu_mipmaps(&mut state, &texture, 1, 1, wgpu::TextureFormat::Rgba8Unorm);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .mipmap_pipeline_cache
                .is_empty()
        );
    }

    #[test]
    fn builds_the_downsample_pipeline_once_and_reuses_it_across_textures() {
        let mut state = create_wgpu_render_state_for_test(None);
        let first = create_mip_texture(&state, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        generate_wgpu_mipmaps(&mut state, &first, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        let pipeline = mipmap_pipeline(&state, wgpu::TextureFormat::Rgba8Unorm);
        assert!(pipeline.is_some());
        let second = create_mip_texture(&state, 8, 8, wgpu::TextureFormat::Rgba8Unorm);
        generate_wgpu_mipmaps(&mut state, &second, 8, 8, wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!(
            mipmap_pipeline(&state, wgpu::TextureFormat::Rgba8Unorm),
            pipeline
        );
    }

    #[test]
    fn keeps_linear_and_srgb_downsample_pipelines_distinct() {
        let mut state = create_wgpu_render_state_for_test(None);
        let linear = create_mip_texture(&state, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        let srgb = create_mip_texture(&state, 4, 4, wgpu::TextureFormat::Rgba8UnormSrgb);
        generate_wgpu_mipmaps(&mut state, &linear, 4, 4, wgpu::TextureFormat::Rgba8Unorm);
        generate_wgpu_mipmaps(&mut state, &srgb, 4, 4, wgpu::TextureFormat::Rgba8UnormSrgb);
        assert_eq!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .mipmap_pipeline_cache
                .len(),
            2
        );
    }
}

mod get_wgpu_mip_level_count {
    use super::*;

    #[test]
    fn returns_1_for_a_1x1_base() {
        assert_eq!(get_wgpu_mip_level_count(1, 1), 1);
    }

    #[test]
    fn counts_the_full_chain_down_to_1x1_using_the_larger_dimension() {
        assert_eq!(get_wgpu_mip_level_count(8, 8), 4);
        assert_eq!(get_wgpu_mip_level_count(256, 1), 9);
        assert_eq!(get_wgpu_mip_level_count(5, 3), 3);
    }
}

mod register_wgpu_mipmap_generation {
    use super::*;

    #[test]
    fn installs_generate_wgpu_mipmaps_on_the_runtime_slot() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .mipmap_generator
                .is_none()
        );
        register_wgpu_mipmap_generation(&mut state);
        let generator = get_wgpu_render_state_runtime(&state)
            .mipmap_generator
            .expect("the generator is installed");
        let expected: WgpuMipmapGenerator = generate_wgpu_mipmaps;
        assert!(std::ptr::fn_addr_eq(generator, expected));
    }
}
