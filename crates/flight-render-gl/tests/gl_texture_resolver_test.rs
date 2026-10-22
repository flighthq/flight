use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_image::ImageResource;
use flight_render::ExternalTexture;
use flight_render_gl::{GlRenderState, GlTextureRealization};
use flight_texture::{
    RenderTargetColorSpace, Texture2D, TextureColorSpace, TextureSourceRef, TextureVariant,
    create_texture_2d,
};
use glow::HasContext;

use crate::gl_test_helper::make_image_resource;

static FIRST_CALLS: AtomicUsize = AtomicUsize::new(0);
static SECOND_CALLS: AtomicUsize = AtomicUsize::new(0);
static GENERIC_CALLS: AtomicUsize = AtomicUsize::new(0);
static SPECIFIC_CALLS: AtomicUsize = AtomicUsize::new(0);

fn make_image_texture(
    image: Option<Ref<ImageResource>>,
    color_space: TextureColorSpace,
) -> Texture2D {
    let source = image.map(|image| image as TextureSourceRef);
    let mut texture = create_texture_2d();
    texture.color_space = color_space;
    texture.source = source;
    return texture;
}

fn make_kind_texture(kind: &str) -> Texture2D {
    let mut source: ExternalTexture = allocate_entity();
    source.kind = kind.to_string();
    source.width = 1;
    source.height = 1;
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    return texture;
}

fn make_realization(state: &GlRenderState, straight_alpha: bool) -> Option<GlTextureRealization> {
    return Some(GlTextureRealization {
        straight_alpha,
        // SAFETY: allocation occurs on the deterministic mock context's owning thread.
        texture: unsafe { state.gl.create_texture() }.ok()?,
    });
}

fn first_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    FIRST_CALLS.fetch_add(1, Ordering::SeqCst);
    return make_realization(state, false);
}

fn second_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    SECOND_CALLS.fetch_add(1, Ordering::SeqCst);
    return make_realization(state, false);
}

fn generic_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    GENERIC_CALLS.fetch_add(1, Ordering::SeqCst);
    return make_realization(state, false);
}

fn specific_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    SPECIFIC_CALLS.fetch_add(1, Ordering::SeqCst);
    return make_realization(state, false);
}

mod register_gl_bitmap_texture_resolver {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::register_gl_bitmap_texture_resolver;

    #[test]
    fn registers_only_the_bitmap_source_key() {
        let mut state = make_state();
        register_gl_bitmap_texture_resolver(&mut state);
        assert_eq!(
            state.gl_registries.texture_resolvers.key_order,
            vec![flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND.to_string()]
        );
    }
}

mod register_gl_compressed_image_texture_resolver {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::register_gl_compressed_image_texture_resolver;

    #[test]
    fn registers_only_the_compressed_image_resource_source_key() {
        let mut state = make_state();
        register_gl_compressed_image_texture_resolver(&mut state);
        assert_eq!(
            state.gl_registries.texture_resolvers.key_order,
            vec![flight_image::COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string()]
        );
    }
}

mod register_gl_image_texture_resolver {
    use super::*;
    use crate::gl_test_helper::{calls_named, calls_with, make_state};
    use flight_render_gl::{register_gl_image_texture_resolver, resolve_gl_texture};

    #[test]
    fn resolves_through_the_source_keyed_upload_cache() {
        let mut state = make_state();
        let texture = make_image_texture(
            Some(make_image_resource(1, 1, true)),
            TextureColorSpace::Srgb,
        );
        register_gl_image_texture_resolver(&mut state);

        let first = resolve_gl_texture(&mut state, &texture, None, None);
        let second = resolve_gl_texture(&mut state, &texture, None, None);

        assert!(first.is_some());
        assert_eq!(second, first);
        assert_eq!(calls_named("tex_image_2d"), 1);
        assert_eq!(
            state.gl_registries.texture_resolvers.key_order,
            vec![flight_image::IMAGE_TEXTURE_SOURCE_KIND.to_string()]
        );
    }

    #[test]
    fn derives_the_sample_format_from_texture_and_working_color_spaces() {
        let mut state = make_state();
        let texture = make_image_texture(
            Some(make_image_resource(1, 1, true)),
            TextureColorSpace::Srgb,
        );
        register_gl_image_texture_resolver(&mut state);

        let decoded = resolve_gl_texture(
            &mut state,
            &texture,
            Some(false),
            Some(RenderTargetColorSpace::Linear),
        );
        assert_eq!(
            calls_with("tex_image_2d").last().unwrap().integers,
            vec![
                i64::from(glow::TEXTURE_2D),
                0,
                i64::from(glow::SRGB8_ALPHA8),
                1,
                1,
                0,
                i64::from(glow::RGBA),
                i64::from(glow::UNSIGNED_BYTE),
                0,
            ]
        );

        let byte_through = resolve_gl_texture(
            &mut state,
            &texture,
            Some(false),
            Some(RenderTargetColorSpace::Srgb),
        );
        assert_ne!(byte_through, decoded);
        assert_eq!(
            calls_with("tex_image_2d").last().unwrap().integers[2],
            i64::from(glow::RGBA)
        );

        let linear_texture = make_image_texture(
            Some(make_image_resource(1, 1, true)),
            TextureColorSpace::Linear,
        );
        resolve_gl_texture(
            &mut state,
            &linear_texture,
            Some(false),
            Some(RenderTargetColorSpace::Linear),
        );
        assert_eq!(
            calls_with("tex_image_2d").last().unwrap().integers[2],
            i64::from(glow::RGBA)
        );
        assert_eq!(
            resolve_gl_texture(
                &mut state,
                &texture,
                Some(false),
                Some(RenderTargetColorSpace::Linear),
            ),
            decoded
        );
        assert_eq!(calls_named("tex_image_2d"), 3);
    }

    #[test]
    fn returns_none_for_an_unbound_image_source() {
        let mut state = make_state();
        let texture = make_image_texture(None, TextureColorSpace::Srgb);
        register_gl_image_texture_resolver(&mut state);
        assert_eq!(resolve_gl_texture(&mut state, &texture, None, None), None);
    }

    #[test]
    fn uploads_a_host_frame_through_the_image_kind_and_gates_by_version() {
        let mut state = make_state();
        let image = make_image_resource(320, 240, true);
        let texture = make_image_texture(Some(image), TextureColorSpace::Srgb);
        register_gl_image_texture_resolver(&mut state);

        let first = resolve_gl_texture(&mut state, &texture, None, None);
        let uploads = calls_named("tex_image_2d");
        let second = resolve_gl_texture(&mut state, &texture, None, None);

        assert!(first.is_some());
        assert_eq!(second, first);
        assert_eq!(calls_named("tex_image_2d"), uploads);
        assert_eq!(
            calls_with("tex_image_2d").last().unwrap().integers[2],
            i64::from(glow::SRGB8_ALPHA8)
        );
    }
}

mod register_gl_render_texture_resolver {
    use crate::gl_test_helper::{calls_named, make_render_texture, make_state};
    use flight_render_gl::{
        get_gl_render_texture_target, register_gl_render_texture_resolver, resolve_gl_texture,
        write_gl_render_texture_target,
    };

    #[test]
    fn returns_the_hidden_color_attachment_without_uploading_cpu_pixels() {
        let mut state = make_state();
        let mut texture = make_render_texture(8, 8);
        write_gl_render_texture_target(&mut state, &mut texture, |_state, _target| Ok(())).unwrap();
        let entry = get_gl_render_texture_target(&mut state, &texture).unwrap();
        let attachment = entry.borrow().target.texture;
        register_gl_render_texture_resolver(&mut state);
        let uploads = calls_named("tex_image_2d");

        assert_eq!(
            resolve_gl_texture(&mut state, &texture, None, None),
            Some(attachment)
        );
        assert_eq!(calls_named("tex_image_2d"), uploads);
    }
}

mod register_gl_texture_resolver {
    use super::*;
    use crate::gl_test_helper::make_state;
    use flight_render_gl::{register_gl_texture_resolver, resolve_gl_texture};

    #[test]
    fn keeps_state_scope_replaces_by_string_kind_and_removes_with_none() {
        FIRST_CALLS.store(0, Ordering::SeqCst);
        SECOND_CALLS.store(0, Ordering::SeqCst);
        let mut first_state = make_state();
        let mut second_state = make_state();
        let texture = make_kind_texture("acme.generated");

        register_gl_texture_resolver(
            &mut first_state,
            "acme.generated".to_string(),
            Some(first_resolver),
        );
        let first = resolve_gl_texture(&mut first_state, &texture, None, None);
        assert!(first.is_some());
        assert_eq!(
            resolve_gl_texture(&mut second_state, &texture, None, None),
            None
        );
        assert_eq!(FIRST_CALLS.load(Ordering::SeqCst), 1);

        register_gl_texture_resolver(
            &mut first_state,
            "acme.generated".to_string(),
            Some(second_resolver),
        );
        let second = resolve_gl_texture(&mut first_state, &texture, None, None);
        assert_ne!(second, first);
        assert_eq!(SECOND_CALLS.load(Ordering::SeqCst), 1);
        assert_eq!(first_state.gl_registries.texture_resolvers.entries.len(), 1);

        register_gl_texture_resolver(&mut first_state, "acme.generated".to_string(), None);
        assert_eq!(
            resolve_gl_texture(&mut first_state, &texture, None, None),
            None
        );
    }

    #[test]
    fn uses_one_exact_keyed_lookup_without_falling_through_to_another_kind() {
        GENERIC_CALLS.store(0, Ordering::SeqCst);
        SPECIFIC_CALLS.store(0, Ordering::SeqCst);
        let mut state = make_state();
        let texture = make_kind_texture("acme.specific");
        register_gl_texture_resolver(&mut state, "image".to_string(), Some(generic_resolver));
        register_gl_texture_resolver(
            &mut state,
            "acme.specific".to_string(),
            Some(specific_resolver),
        );

        assert!(resolve_gl_texture(&mut state, &texture, None, None).is_some());
        assert_eq!(GENERIC_CALLS.load(Ordering::SeqCst), 0);
        assert_eq!(SPECIFIC_CALLS.load(Ordering::SeqCst), 1);
    }
}

mod register_standard_gl_texture_resolvers {
    use crate::gl_test_helper::make_state;
    use flight_render_gl::register_standard_gl_texture_resolvers;

    #[test]
    fn registers_bitmap_image_and_render_sources_without_compressed_images() {
        let mut state = make_state();
        register_standard_gl_texture_resolvers(&mut state);
        assert_eq!(
            state.gl_registries.texture_resolvers.key_order,
            vec![
                flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND.to_string(),
                flight_image::IMAGE_TEXTURE_SOURCE_KIND.to_string(),
                flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            ]
        );
        assert!(
            !state
                .gl_registries
                .texture_resolvers
                .entries
                .contains_key(flight_image::COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND)
        );
    }
}

mod resolve_gl_texture {
    use super::*;
    use crate::gl_test_helper::make_state;
    use flight_render_gl::resolve_gl_texture;

    #[test]
    fn returns_none_when_the_state_has_no_registered_source_resolver() {
        let mut state = make_state();
        let texture = make_image_texture(
            Some(make_image_resource(1, 1, true)),
            TextureColorSpace::Srgb,
        );
        assert_eq!(resolve_gl_texture(&mut state, &texture, None, None), None);
    }
}

mod standard_gl_texture_resolvers {
    use flight_render_gl::standard_gl_texture_resolvers;

    #[test]
    fn carries_the_three_standard_source_kinds() {
        let map = standard_gl_texture_resolvers();
        assert_eq!(
            map.key_order,
            vec![
                flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND.to_string(),
                flight_image::IMAGE_TEXTURE_SOURCE_KIND.to_string(),
                flight_render::RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            ]
        );
    }

    #[test]
    fn does_not_include_the_compressed_image_resolver() {
        assert!(
            !standard_gl_texture_resolvers()
                .entries
                .contains_key(flight_image::COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND)
        );
    }
}
