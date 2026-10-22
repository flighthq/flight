use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_bitmap::BITMAP_TEXTURE_SOURCE_KIND;
use flight_entity::{Kind, Ref};
use flight_image::{COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND, IMAGE_TEXTURE_SOURCE_KIND};
use flight_registry::{KindMap, get_kind_map_keys};
use flight_render::{
    CreateRenderTextureOptions, RENDER_TARGET_TEXTURE_SOURCE_KIND, RenderTexture,
    create_render_texture,
};
use flight_render_wgpu::*;
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, CreateTextureOptions,
    RenderTargetColorSpace, Texture, TextureColorSpace, TextureSourceRef, TextureVariant,
    create_texture,
};

use crate::support::*;

// The source's `imageResource()` fixture over a ready host image, in a texture of `color_space`.
fn texture_with_image(width: u32, height: u32, color_space: TextureColorSpace) -> Texture {
    let (resource, _fake) = create_test_image_resource(width, height, true);
    let source: TextureSourceRef = resource;
    return create_texture(Some(&CreateTextureOptions::Texture2D(
        CreateTexture2DOptions {
            common: CreateTextureCommonOptions {
                color_space: Some(color_space),
                ..test_default()
            },
            source: Some(source),
        },
    )));
}

// The source's `renderTexture()` fixture: an 8x8 linear render-target texture.
fn render_texture() -> RenderTexture {
    return create_render_texture(&CreateRenderTextureOptions {
        color_space: Some(TextureColorSpace::Linear),
        height: 8,
        width: 8,
        ..test_default()
    });
}

fn kind_map_keys<T>(map: &KindMap<T>) -> Vec<Kind> {
    let mut kinds = Vec::new();
    get_kind_map_keys(&mut kinds, map);
    return kinds;
}

fn registered_texture_source_kinds(state: &WgpuRenderState) -> Vec<Kind> {
    return kind_map_keys(
        &get_wgpu_render_state_runtime(state)
            .registries
            .texture_resolvers,
    );
}

fn entry_format(entry: &Ref<WgpuTextureEntry>) -> wgpu::TextureFormat {
    return entry.read().unwrap().texture.format();
}

fn entry_width(entry: &Ref<WgpuTextureEntry>) -> u32 {
    return entry.read().unwrap().texture.width();
}

static FIRST_CALLS: AtomicU32 = AtomicU32::new(0);
static SECOND_CALLS: AtomicU32 = AtomicU32::new(0);

// The source's `vi.fn(() => ({ first: true }))`: a 1x1 entry, counted.
fn resolve_first(
    state: &mut WgpuRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    FIRST_CALLS.fetch_add(1, Ordering::SeqCst);
    let (image, _fake) = create_test_image(1, 1, true);
    return create_wgpu_texture_entry(state, 1, 1, &image);
}

// The source's `vi.fn(() => ({ second: true }))`: a 2x2 entry, counted.
fn resolve_second(
    state: &mut WgpuRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    SECOND_CALLS.fetch_add(1, Ordering::SeqCst);
    let (image, _fake) = create_test_image(2, 2, true);
    return create_wgpu_texture_entry(state, 2, 2, &image);
}

mod register_standard_wgpu_texture_resolvers {
    use super::*;

    #[test]
    fn registers_bitmap_image_and_render_texture_sources_without_compressed_images() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_standard_wgpu_texture_resolvers(&mut state);
        assert_eq!(
            registered_texture_source_kinds(&state),
            vec![
                BITMAP_TEXTURE_SOURCE_KIND.to_string(),
                IMAGE_TEXTURE_SOURCE_KIND.to_string(),
                RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            ]
        );
    }
}

mod register_wgpu_bitmap_texture_resolver {
    use super::*;

    #[test]
    fn registers_only_the_bitmap_source_key() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_bitmap_texture_resolver(&mut state);
        assert_eq!(
            registered_texture_source_kinds(&state),
            vec![BITMAP_TEXTURE_SOURCE_KIND.to_string()]
        );
    }
}

mod register_wgpu_compressed_image_texture_resolver {
    use super::*;

    #[test]
    fn registers_only_the_compressed_image_resource_source_key() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_compressed_image_texture_resolver(&mut state);
        assert_eq!(
            registered_texture_source_kinds(&state),
            vec![COMPRESSED_IMAGE_TEXTURE_SOURCE_KIND.to_string()]
        );
    }
}

mod register_wgpu_image_texture_resolver {
    use super::*;

    #[test]
    fn resolves_and_caches_a_declared_still_image_source() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_with_image(4, 4, TextureColorSpace::Srgb);
        register_wgpu_image_texture_resolver(&mut state);

        let first = resolve_wgpu_texture(&mut state, &texture, None, None).expect("an entry");
        let second = resolve_wgpu_texture(&mut state, &texture, None, None).expect("an entry");
        assert!(Arc::ptr_eq(&second, &first));
    }

    // The sample format comes from the PAIR (what the content is, what the destination composites in), not
    // from an override. One sRGB texture therefore realizes two ways: decoded for a linear-working path
    // (3D), byte-through for an encoded-working one (2D), cached apart so both can be live at once.
    // The TS spy on createTexture becomes the realized entry's texture format.
    #[test]
    fn derives_the_sample_format_from_the_texture_and_working_color_spaces() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_with_image(4, 4, TextureColorSpace::Srgb);
        register_wgpu_image_texture_resolver(&mut state);

        let decoded = resolve_wgpu_texture(
            &mut state,
            &texture,
            Some(false),
            Some(RenderTargetColorSpace::Linear),
        )
        .expect("a decoded entry");
        assert_eq!(entry_format(&decoded), wgpu::TextureFormat::Rgba8UnormSrgb);

        let byte_through = resolve_wgpu_texture(
            &mut state,
            &texture,
            Some(false),
            Some(RenderTargetColorSpace::Srgb),
        )
        .expect("a byte-through entry");
        assert!(!Arc::ptr_eq(&byte_through, &decoded));
        assert_eq!(entry_format(&byte_through), wgpu::TextureFormat::Rgba8Unorm);

        // Linear content never decodes, whichever space the destination works in.
        let linear_texture = texture_with_image(4, 4, TextureColorSpace::Linear);
        let linear = resolve_wgpu_texture(
            &mut state,
            &linear_texture,
            Some(false),
            Some(RenderTargetColorSpace::Linear),
        )
        .expect("a linear entry");
        assert_eq!(entry_format(&linear), wgpu::TextureFormat::Rgba8Unorm);

        let again = resolve_wgpu_texture(
            &mut state,
            &texture,
            Some(false),
            Some(RenderTargetColorSpace::Linear),
        )
        .expect("the cached decoded entry");
        assert!(Arc::ptr_eq(&again, &decoded));
    }

    // The source's ready HTMLVideoElement is the host-image fake, ready at 8x8: video and still
    // images share the image source kind.
    #[test]
    fn resolves_a_host_video_through_the_image_source_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_with_image(8, 8, TextureColorSpace::Srgb);
        register_wgpu_image_texture_resolver(&mut state);
        let entry = resolve_wgpu_texture(&mut state, &texture, None, None).expect("an entry");
        assert_eq!(entry_width(&entry), 8);
    }
}

mod register_wgpu_render_texture_resolver {
    use super::*;

    #[test]
    fn returns_a_render_target_only_after_it_has_been_rendered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut texture = render_texture();
        register_wgpu_render_texture_resolver(&mut state);
        assert!(resolve_wgpu_texture(&mut state, &texture, None, None).is_none());

        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        render_into_wgpu_render_texture(
            pass.state,
            &mut texture,
            |_| {},
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: Some(1.0),
                stencil: Some(0),
            },
        );
        assert!(resolve_wgpu_texture(pass.state, &texture, None, None).is_some());
        end_wgpu_render_pass(pass);
        submit_wgpu_frame(&mut state);
    }
}

mod register_wgpu_texture_resolver {
    use super::*;

    #[test]
    fn is_state_scoped_last_write_wins_by_string_kind_and_removable() {
        let mut a = create_wgpu_render_state_for_test(None);
        let mut b = create_wgpu_render_state_for_test(None);
        let texture = create_test_texture_with_kind("acme.generated", 4, 4);

        register_wgpu_texture_resolver(&mut a, "acme.generated".to_string(), Some(resolve_first));
        let first = resolve_wgpu_texture(&mut a, &texture, None, None).expect("the first entry");
        assert_eq!(entry_width(&first), 1);
        assert_eq!(FIRST_CALLS.load(Ordering::SeqCst), 1);
        assert!(resolve_wgpu_texture(&mut b, &texture, None, None).is_none());

        register_wgpu_texture_resolver(&mut a, "acme.generated".to_string(), Some(resolve_second));
        let second = resolve_wgpu_texture(&mut a, &texture, None, None).expect("the second entry");
        assert_eq!(entry_width(&second), 2);
        assert_eq!(FIRST_CALLS.load(Ordering::SeqCst), 1);
        assert_eq!(SECOND_CALLS.load(Ordering::SeqCst), 1);

        register_wgpu_texture_resolver(&mut a, "acme.generated".to_string(), None);
        assert!(resolve_wgpu_texture(&mut a, &texture, None, None).is_none());
        assert_eq!(SECOND_CALLS.load(Ordering::SeqCst), 1);
    }
}

mod resolve_wgpu_texture {
    use super::*;

    #[test]
    fn returns_null_without_an_exact_registered_source_kind() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_standard_wgpu_texture_resolvers(&mut state);
        assert!(resolve_wgpu_texture(&mut state, &create_texture(None), None, None).is_none());
        let texture = create_test_texture_with_kind("acme.unregistered", 4, 4);
        assert!(resolve_wgpu_texture(&mut state, &texture, None, None).is_none());
    }
}

mod standard_wgpu_texture_resolvers {
    use super::*;

    #[test]
    fn carries_exactly_the_three_standard_source_kinds() {
        assert_eq!(
            kind_map_keys(&STANDARD_WGPU_TEXTURE_RESOLVERS),
            vec![
                BITMAP_TEXTURE_SOURCE_KIND.to_string(),
                IMAGE_TEXTURE_SOURCE_KIND.to_string(),
                RENDER_TARGET_TEXTURE_SOURCE_KIND.to_string(),
            ]
        );
    }
}
