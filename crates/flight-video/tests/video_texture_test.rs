use std::any::Any;
use std::sync::{Arc, Mutex};

use flight_geometry::{create_matrix3, create_vector2};
use flight_host::HostImageSource;
use flight_image::{
    IMAGE_TEXTURE_SOURCE_KIND, ImageResource, create_image_resolver_state, create_image_resource,
};
use flight_texture::{
    AlphaType, CreateTextureCommonOptions, Texture, Texture2D, TextureColorSpace, TextureGamut,
    TextureSourceRef, TextureUvTransform, create_texture_2d, get_texture_source,
};
use flight_video::contract::*;

use crate::video_fixture::*;

// D23 (B): a video resource is created empty, then given its element and ownership (Principal 21f7557f).
fn video_resource_of(
    element: Option<Arc<HostImageSource>>,
    object_url: Option<&str>,
    owns_element: Option<bool>,
) -> VideoResource {
    let mut resource = create_video_resource();
    resource.element = element;
    resource.object_url = object_url.map(|url| url.to_string());
    resource.owns_element = owns_element.unwrap_or(false);
    return resource;
}

/// The source test's fake `HTMLVideoElement`: decoded readiness and frame size.
struct FakeElement {
    ready_state: u32,
    video_height: f32,
    video_width: f32,
}

fn element_of(source: &Arc<HostImageSource>) -> &FakeElement {
    return source
        .handle
        .downcast_ref::<FakeElement>()
        .expect("a fake video element");
}

/// The source's `testVideoHost`: readiness >= 2 and the element's frame size.
fn test_video_host() -> HostVideoCapability {
    let mut host = empty_video_host(true);
    host.get_height = Some(Arc::new(|source| element_of(source).video_height));
    host.get_width = Some(Arc::new(|source| element_of(source).video_width));
    host.is_ready = Some(Arc::new(|source| element_of(source).ready_state >= 2));
    return host;
}

fn make_video_resource(ready_state: u32, video_width: f32, video_height: f32) -> VideoResource {
    let element = Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(FakeElement {
            ready_state,
            video_height,
            video_width,
        }),
    });
    return video_resource_of(Some(element), None, None);
}

fn default_resource() -> VideoResource {
    return make_video_resource(4, 320.0, 240.0);
}

fn common() -> CreateTextureCommonOptions {
    let make: fn() -> CreateTextureCommonOptions = CreateTextureCommonOptions::default;
    return make();
}

fn source_of(texture: &dyn flight_texture::TextureVariant) -> Option<TextureSourceRef> {
    return get_texture_source(texture);
}

fn source_version(texture: &dyn flight_texture::TextureVariant) -> u32 {
    return source_of(texture)
        .unwrap()
        .read()
        .unwrap()
        .texture_source_fields()
        .version;
}

// The source's `(getTextureSource(vt) as ImageResource).source`, through the canonical safe downcast.
fn image_element(texture: &dyn flight_texture::TextureVariant) -> Arc<HostImageSource> {
    let source = source_of(texture).unwrap();
    let guard = source.read().unwrap();
    let any: &dyn Any = &*guard;
    return any.downcast_ref::<ImageResource>().unwrap().source.clone();
}

fn same_source(a: &Option<TextureSourceRef>, b: &Option<TextureSourceRef>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
}

fn texture_2d(texture: Texture) -> Texture2D {
    let Texture::Texture2D(texture) = texture else {
        panic!("a 2D texture");
    };
    return texture;
}

mod advance_video_texture {
    use super::*;

    #[test]
    fn bumps_the_source_and_texture_versions_and_returns_the_new_value() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        assert_eq!(vt.texture_fields().version, 0xffffffff);
        assert_eq!(advance_video_texture(&host, &mut vt), 0);
        assert_eq!(advance_video_texture(&host, &mut vt), 1);
        assert_eq!(vt.texture_fields().version, 1);
        assert_eq!(source_version(&vt), 1);
    }

    #[test]
    fn re_reads_the_host_frame_size_on_each_advance() {
        let size = Arc::new(Mutex::new((10.0_f32, 20.0_f32)));
        let mut host = empty_video_host(true);
        let height = size.clone();
        host.get_height = Some(Arc::new(move |_source| height.lock().unwrap().1));
        let width = size.clone();
        host.get_width = Some(Arc::new(move |_source| width.lock().unwrap().0));
        let mut vt = create_video_texture(&host, &default_resource(), None);
        *size.lock().unwrap() = (30.0, 40.0);
        advance_video_texture(&host, &mut vt);
        let source = source_of(&vt).unwrap();
        let fields = source.read().unwrap();
        assert_eq!(
            (
                fields.texture_source_fields().width,
                fields.texture_source_fields().height
            ),
            (30, 40)
        );
    }

    #[test]
    fn leaves_a_texture_without_a_video_image_unchanged() {
        let host = test_video_host();
        let mut empty = create_video_texture(&host, &create_video_resource(), None);
        assert_eq!(advance_video_texture(&host, &mut empty), 0xffffffff);
        let mut plain = create_texture_2d(None);
        plain.texture_fields_mut().version = 5;
        assert_eq!(advance_video_texture(&host, &mut plain), 5);
    }
}

mod clone_video_texture {
    use super::*;

    #[test]
    fn shares_the_source_but_clones_sampler_and_uv_vectors() {
        let host = test_video_host();
        let mut options = common();
        options.uv_offset = Some(create_vector2(2.0, 3.0));
        let mut vt = create_video_texture(&host, &default_resource(), Some(&options));
        advance_video_texture(&host, &mut vt);
        let mut clone = texture_2d(clone_video_texture(&vt));
        assert!(same_source(&source_of(&clone), &source_of(&vt)));
        assert_eq!(clone.texture_fields().uv_offset.x, 2.0);
        assert_eq!(clone.texture_fields().version, 0);
        // The clone's vectors and sampler are its own values: changing them leaves the original.
        clone.texture_fields_mut().uv_offset.x = 9.0;
        clone.texture_fields_mut().sampler.anisotropy = 4.0;
        assert_eq!(vt.texture_fields().uv_offset.x, 2.0);
        assert_eq!(vt.texture_fields().sampler.anisotropy, 1.0);
    }
}

mod copy_video_texture {
    use super::*;

    #[test]
    fn copies_fields_into_out() {
        let host = test_video_host();
        let mut options = common();
        options.color_space = Some(TextureColorSpace::Linear);
        options.uv_scale = Some(create_vector2(4.0, 5.0));
        let mut a = create_video_texture(&host, &default_resource(), Some(&options));
        advance_video_texture(&host, &mut a);
        let mut b = create_video_texture(&host, &default_resource(), None);
        copy_video_texture(&mut b, &a);
        assert_eq!(b.texture_fields().color_space, TextureColorSpace::Linear);
        assert_eq!(b.texture_fields().version, 0);
        assert!(same_source(&source_of(&b), &source_of(&a)));
        assert_eq!(b.texture_fields().uv_scale.x, 4.0);
    }

    #[test]
    fn copying_a_texture_from_its_own_clone_keeps_its_fields() {
        // The source also copies `a` onto itself; Rust borrows cannot alias out and source, so the
        // self-copy is exercised through an equal snapshot.
        let host = test_video_host();
        let mut options = common();
        options.uv_scale = Some(create_vector2(4.0, 5.0));
        let mut a = create_video_texture(&host, &default_resource(), Some(&options));
        let snapshot = a.clone();
        copy_video_texture(&mut a, &snapshot);
        assert_eq!(a.texture_fields().uv_scale.x, 4.0);
        assert!(same_source(&source_of(&a), &source_of(&snapshot)));
    }
}

mod create_video_texture {
    use super::*;

    #[test]
    fn returns_a_universal_srgb_texture_with_a_borrowed_host_image_source() {
        let host = test_video_host();
        let source = default_resource();
        let vt = create_video_texture(&host, &source, None);
        assert_eq!(vt.texture_fields().color_space, TextureColorSpace::Srgb);
        assert!(Arc::ptr_eq(
            &image_element(&vt),
            source.element.as_ref().unwrap()
        ));
        assert_eq!(vt.texture_fields().version, 0xffffffff);
        assert_eq!(vt.texture_fields().uv_offset.x, 0.0);
        assert_eq!(vt.texture_fields().uv_scale.x, 1.0);
        assert_eq!(vt.texture_fields().uv_rotation, 0.0);
    }

    #[test]
    fn reads_dimensions_and_readiness_only_through_the_supplied_host_provider() {
        let resource = make_video_resource(0, 320.0, 240.0);
        let seen = Arc::new(Mutex::new(
            Vec::<(&'static str, Arc<HostImageSource>)>::new(),
        ));
        let mut host = empty_video_host(true);
        let record = seen.clone();
        host.get_height = Some(Arc::new(move |source| {
            record.lock().unwrap().push(("height", source.clone()));
            return 12.0;
        }));
        let record = seen.clone();
        host.get_width = Some(Arc::new(move |source| {
            record.lock().unwrap().push(("width", source.clone()));
            return 34.0;
        }));
        let record = seen.clone();
        host.is_ready = Some(Arc::new(move |source| {
            record.lock().unwrap().push(("ready", source.clone()));
            return true;
        }));
        let texture = create_video_texture(&host, &resource, None);
        let source = source_of(&texture).unwrap();
        assert_eq!(source.read().unwrap().texture_source_fields().height, 12);
        assert_eq!(source.read().unwrap().texture_source_fields().width, 34);
        assert_eq!(get_video_texture_height(&host, &texture), 12.0);
        assert_eq!(get_video_texture_width(&host, &texture), 34.0);
        assert!(is_video_texture_frame_ready(&host, &texture));
        let element = resource.element.as_ref().unwrap();
        let seen = seen.lock().unwrap();
        for kind in ["height", "width", "ready"] {
            assert!(
                seen.iter()
                    .any(|(name, source)| *name == kind && Arc::ptr_eq(source, element))
            );
        }
        assert!(seen.iter().all(|(_, source)| Arc::ptr_eq(source, element)));
    }

    #[test]
    fn uses_dimension_and_readiness_sentinels_when_the_provider_omits_inspection_methods() {
        let host = empty_video_host(false);
        let texture = create_video_texture(&host, &default_resource(), None);
        let source = source_of(&texture).unwrap();
        assert_eq!(source.read().unwrap().texture_source_fields().height, 0);
        assert_eq!(source.read().unwrap().texture_source_fields().width, 0);
        assert_eq!(get_video_texture_height(&host, &texture), -1.0);
        assert_eq!(get_video_texture_width(&host, &texture), -1.0);
        assert!(!is_video_texture_frame_ready(&host, &texture));
    }

    #[test]
    fn has_no_source_for_an_element_less_resource_and_ignores_a_caller_version() {
        let host = test_video_host();
        let mut options = common();
        options.version = Some(7);
        let texture = create_video_texture(&host, &create_video_resource(), Some(&options));
        assert!(source_of(&texture).is_none());
        assert_eq!(texture.texture_fields().version, 0xffffffff);
    }
}

mod destroy_video_texture {
    use super::*;

    #[test]
    fn nulls_the_texture_source_and_resets_the_version() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        advance_video_texture(&host, &mut vt);
        assert!(source_of(&vt).is_some());
        destroy_video_texture(&mut vt);
        assert!(source_of(&vt).is_none());
        assert_eq!(vt.texture_fields().version, 0xffffffff);
    }

    #[test]
    fn does_not_modify_the_borrowed_video_resource() {
        let host = test_video_host();
        let resource = default_resource();
        let element = resource.element.clone().unwrap();
        let mut vt = create_video_texture(&host, &resource, None);
        destroy_video_texture(&mut vt);
        assert!(Arc::ptr_eq(resource.element.as_ref().unwrap(), &element));
    }

    #[test]
    fn is_idempotent() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        destroy_video_texture(&mut vt);
        destroy_video_texture(&mut vt);
        assert!(source_of(&vt).is_none());
    }

    #[test]
    fn makes_subsequent_accessor_calls_return_sentinel_values() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        destroy_video_texture(&mut vt);
        assert_eq!(get_video_texture_width(&host, &vt), -1.0);
        assert_eq!(get_video_texture_height(&host, &vt), -1.0);
        assert!(!is_video_texture_frame_ready(&host, &vt));
        assert_eq!(advance_video_texture(&host, &mut vt), 0xffffffff);
    }
}

mod get_video_texture_height {
    use super::*;

    #[test]
    fn returns_the_element_video_height_when_a_frame_is_decoded_else_minus_one() {
        let host = test_video_host();
        assert_eq!(
            get_video_texture_height(
                &host,
                &create_video_texture(&host, &make_video_resource(4, 320.0, 240.0), None)
            ),
            240.0
        );
        assert_eq!(
            get_video_texture_height(
                &host,
                &create_video_texture(&host, &make_video_resource(0, 0.0, 0.0), None)
            ),
            -1.0
        );
        assert_eq!(
            get_video_texture_height(
                &host,
                &create_video_texture(&host, &create_video_resource(), None)
            ),
            -1.0
        );
    }
}

mod get_video_texture_inverse_uv_matrix {
    use super::*;

    #[test]
    fn inverts_the_forward_uv_transform() {
        let host = test_video_host();
        let mut options = common();
        options.uv_scale = Some(create_vector2(2.0, 2.0));
        options.uv_offset = Some(create_vector2(1.0, 0.0));
        let vt = create_video_texture(&host, &default_resource(), Some(&options));
        let mut forward = create_matrix3();
        let mut inverse = create_matrix3();
        get_video_texture_uv_matrix(&mut forward, &vt);
        get_video_texture_inverse_uv_matrix(&mut inverse, &vt);
        let i = inverse.m;
        let px = i[0] * 1.0 + i[3] * 0.0 + i[6];
        let py = i[1] * 1.0 + i[4] * 0.0 + i[7];
        assert!(px.abs() < 1e-6);
        assert!(py.abs() < 1e-6);
        assert_eq!(forward.m[0], 2.0);
    }
}

mod get_video_texture_uv_matrix {
    use super::*;

    #[test]
    fn composes_scale_rotation_and_offset_in_column_major_layout() {
        let host = test_video_host();
        let mut options = common();
        options.uv_scale = Some(create_vector2(2.0, 3.0));
        options.uv_offset = Some(create_vector2(5.0, 7.0));
        let vt = create_video_texture(&host, &default_resource(), Some(&options));
        let mut out = create_matrix3();
        get_video_texture_uv_matrix(&mut out, &vt);
        assert_eq!(out.m[0], 2.0);
        assert_eq!(out.m[4], 3.0);
        assert_eq!(out.m[6], 5.0);
        assert_eq!(out.m[7], 7.0);
        assert_eq!(out.m[8], 1.0);
    }
}

mod get_video_texture_width {
    use super::*;

    #[test]
    fn returns_the_element_video_width_when_a_frame_is_decoded_else_minus_one() {
        let host = test_video_host();
        assert_eq!(
            get_video_texture_width(
                &host,
                &create_video_texture(&host, &make_video_resource(4, 320.0, 240.0), None)
            ),
            320.0
        );
        assert_eq!(
            get_video_texture_width(
                &host,
                &create_video_texture(&host, &make_video_resource(0, 0.0, 0.0), None)
            ),
            -1.0
        );
        assert_eq!(
            get_video_texture_width(
                &host,
                &create_video_texture(&host, &create_video_resource(), None)
            ),
            -1.0
        );
    }
}

mod initialize_video_image_resource {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_video_image_resource() {
        let first = Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(1_u8),
        });
        let second = Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(2_u8),
        });
        let image = create_image_resource(first, &create_image_resolver_state());
        let mut resource = image.write().unwrap();
        resource.alpha_type = AlphaType::Premultiplied;
        resource.gamut = TextureGamut::DisplayP3;
        resource.width = 9;
        resource.height = 9;
        initialize_video_image_resource(&mut resource, second.clone(), 41);
        assert_eq!(resource.alpha_type, AlphaType::Straight);
        assert_eq!(resource.gamut, TextureGamut::Srgb);
        assert_eq!((resource.width, resource.height), (0, 0));
        assert_eq!(resource.kind, IMAGE_TEXTURE_SOURCE_KIND);
        assert!(Arc::ptr_eq(&resource.source, &second));
        assert_eq!(resource.version, 41);
    }
}

mod is_video_texture_frame_ready {
    use super::*;

    #[test]
    fn is_true_only_when_the_element_has_a_decoded_frame_with_known_dimensions() {
        let host = test_video_host();
        assert!(is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &make_video_resource(4, 320.0, 240.0), None)
        ));
        assert!(!is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &make_video_resource(1, 320.0, 240.0), None)
        ));
        assert!(!is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &make_video_resource(4, 0.0, 0.0), None)
        ));
        assert!(!is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &create_video_resource(), None)
        ));
    }

    #[test]
    fn needs_both_dimensions() {
        let host = test_video_host();
        assert!(!is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &make_video_resource(4, 320.0, 0.0), None)
        ));
        assert!(!is_video_texture_frame_ready(
            &host,
            &create_video_texture(&host, &make_video_resource(4, 0.0, 240.0), None)
        ));
    }
}

mod reset_video_texture_frame {
    use super::*;

    #[test]
    fn sets_the_shared_revision_to_the_u32_pre_first_frame_sentinel() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        advance_video_texture(&host, &mut vt);
        advance_video_texture(&host, &mut vt);
        reset_video_texture_frame(&mut vt);
        assert_eq!(vt.texture_fields().version, 0xffffffff);
        assert_eq!(source_version(&vt), 0xffffffff);
        assert_eq!(advance_video_texture(&host, &mut vt), 0);
    }

    #[test]
    fn resets_a_clone_sharing_the_same_image_revision() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        advance_video_texture(&host, &mut vt);
        let clone = texture_2d(clone_video_texture(&vt));
        reset_video_texture_frame(&mut vt);
        assert_eq!(source_version(&clone), 0xffffffff);
    }
}

mod set_video_texture_source {
    use super::*;

    #[test]
    fn swaps_the_borrowed_host_handle_and_resets_the_version() {
        let host = test_video_host();
        let mut vt = create_video_texture(&host, &default_resource(), None);
        advance_video_texture(&host, &mut vt);
        let next = make_video_resource(4, 640.0, 480.0);
        set_video_texture_source(&host, &mut vt, &next);
        assert!(Arc::ptr_eq(
            &image_element(&vt),
            next.element.as_ref().unwrap()
        ));
        assert_eq!(vt.texture_fields().version, 0xffffffff);
        assert_eq!(get_video_texture_width(&host, &vt), 640.0);
    }

    #[test]
    fn throws_for_a_texture_that_is_not_2d() {
        let host = test_video_host();
        let mut cube = flight_texture::create_texture(Some(
            &flight_texture::CreateTextureOptions::Cube(flight_texture::CreateTextureCubeOptions {
                common: common(),
                sources: None,
            }),
        ));
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            set_video_texture_source(&host, &mut cube, &default_resource());
        }))
        .unwrap_err();
        let error = thrown.downcast::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::Error);
        assert_eq!(error.message, "setVideoTextureSource requires a Texture2D");
    }
}
