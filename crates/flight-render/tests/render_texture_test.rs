use std::any::Any;
use std::sync::Arc;

use flight_entity::{allocate_entity, get_entity_id};
use flight_geometry::create_vector2;
use flight_render::*;
use flight_texture::{
    RenderTargetColorSpace, TextureColorSpace, TextureFilter, TextureVariant, create_sampler,
    get_texture_source,
};

fn render_texture_options(height: u32, width: u32) -> CreateRenderTextureOptions {
    return CreateRenderTextureOptions {
        color_space: None,
        color_attachments: None,
        color_formats: None,
        depth: None,
        flip_x: None,
        flip_y: None,
        format: None,
        height,
        sample_count: None,
        sampler: None,
        uv_offset: None,
        uv_rotation: None,
        uv_scale: None,
        width,
    };
}

fn with_render_target<T>(texture: &RenderTexture, callback: impl FnOnce(&RenderTarget) -> T) -> T {
    let source = texture.source.as_ref().expect("render target source");
    let guard = source.read().unwrap();
    let any = &*guard as &dyn Any;
    let target = any.downcast_ref::<RenderTarget>().expect("RenderTarget");
    return callback(target);
}

mod create_render_texture {
    use super::*;

    #[test]
    fn applies_sampling_depth_color_space_and_uv_overrides_without_aliasing_mutable_values() {
        let mut sampler = create_sampler(None);
        sampler.mag_filter = TextureFilter::Nearest;
        let sampler_id = get_entity_id(&sampler);
        let mut options = render_texture_options(16, 8);
        options.color_space = Some(TextureColorSpace::Srgb);
        options.depth = Some(RenderTargetDepth::DepthStencil);
        options.flip_y = Some(false);
        options.sampler = Some(sampler);
        options.uv_offset = Some(create_vector2(0.25, 0.5));

        let texture = create_render_texture(&options);
        options.uv_offset.as_mut().unwrap().x = 0.75;

        assert_eq!(texture.color_space, TextureColorSpace::Srgb);
        assert!(!texture.flip_y);
        assert_eq!(texture.sampler.mag_filter, TextureFilter::Nearest);
        assert_ne!(get_entity_id(&texture.sampler), sampler_id);
        assert_eq!(texture.uv_offset, create_vector2(0.25, 0.5));
        with_render_target(&texture, |target| {
            assert_eq!(target.color_space, RenderTargetColorSpace::Srgb);
            assert_eq!(target.depth, Some(RenderTargetDepth::DepthStencil));
        });
    }

    #[test]
    fn creates_a_linear_render_target_with_identity_uvs_and_no_depth_by_default() {
        let texture = create_render_texture(&render_texture_options(32, 64));

        assert_eq!(texture.color_space, TextureColorSpace::Linear);
        assert!(!texture.flip_x);
        assert!(!texture.flip_y);
        assert_eq!(texture.uv_offset, create_vector2(0.0, 0.0));
        assert_eq!(texture.uv_rotation, 0.0);
        assert_eq!(texture.uv_scale, create_vector2(1.0, 1.0));
        assert_eq!(texture.version, 0);
        assert!(texture.source.is_some());
        assert_eq!(
            texture.dimension(),
            flight_texture::TextureDimension::Texture2D
        );

        with_render_target(&texture, |target| {
            assert_eq!(target.color_space, RenderTargetColorSpace::Linear);
            assert_eq!(target.depth, None);
            assert_eq!(target.height, 32);
            assert_eq!(target.kind, RENDER_TARGET_TEXTURE_SOURCE_KIND);
            assert_eq!(target.version, 0);
            assert_eq!(target.width, 64);
        });
    }

    #[test]
    fn texture_and_generic_source_views_keep_the_same_render_target_identity() {
        let texture = create_render_texture(&render_texture_options(6, 7));
        let direct = texture.source.as_ref().unwrap();
        let generic = get_texture_source(&texture).unwrap();

        assert!(Arc::ptr_eq(direct, &generic));
    }
}

mod initialize_render_texture_target {
    use super::*;

    #[test]
    fn initializes_every_render_target_axis_without_realizing_a_backend_handle() {
        let mut target: RenderTarget = allocate_entity();
        let mut options = render_texture_options(11, 13);
        options.color_attachments = Some(2.0);
        options.color_formats = Some(vec![
            RenderTargetFormat::Rgba16F,
            RenderTargetFormat::Rgba32F,
        ]);
        options.depth = Some(RenderTargetDepth::DepthStencilSampled);
        options.format = Some(RenderTargetFormat::Rgba16F);
        options.sample_count = Some(4.0);

        initialize_render_texture_target(&mut target, &options, RenderTargetColorSpace::Srgb);

        assert_eq!(target.color_attachments, Some(2.0));
        assert_eq!(target.color_formats, options.color_formats);
        assert_eq!(target.color_space, RenderTargetColorSpace::Srgb);
        assert_eq!(target.depth, Some(RenderTargetDepth::DepthStencilSampled));
        assert_eq!(target.format, Some(RenderTargetFormat::Rgba16F));
        assert_eq!(target.height, 11);
        assert_eq!(target.kind, RENDER_TARGET_TEXTURE_SOURCE_KIND);
        assert_eq!(target.sample_count, Some(4.0));
        assert_eq!(target.version, 0);
        assert_eq!(target.width, 13);
    }
}
