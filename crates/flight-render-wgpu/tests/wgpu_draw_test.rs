use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::{Ref, get_entity_id};
use flight_geometry::create_matrix;
use flight_image::contract::create_compressed_image_resource;
use flight_image::{CompressedImageData, CompressedImageResource, ImageResource};
use flight_materials::{BLEND_MODE_ADD, color_scale_bias::create_color_scale_bias};
use flight_render::{RenderState, create_render_proxy_2d};
use flight_render_wgpu::*;
use flight_texture::{
    Texture2D, TextureColorSpace, TextureSourceRef, TextureUvTransform, create_texture_2d,
};
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerSupercompression,
};

use crate::support::*;

fn bitmap(size: u32, version: u32) -> Bitmap {
    let mut out = create_bitmap(size, size, None);
    out.version = version;
    return out;
}

fn compressed_bc3_image() -> Ref<CompressedImageResource> {
    let image = create_compressed_image_resource(Arc::new(CompressedImageData {
        container: TextureContainer {
            format: TextureContainerFormat::Bc3,
            width: 4,
            height: 4,
            depth: 1,
            mip_levels: 1,
            layers: 1,
            faces: 1,
            supercompression: TextureContainerSupercompression::None,
            levels: vec![TextureContainerLevel {
                byte_offset: 0,
                byte_length: 16,
                width: 4,
                height: 4,
            }],
        },
        payload: Arc::new(RwLock::new(vec![0u8; 16].into_boxed_slice())),
    }));
    image.write().unwrap().version = 1;
    return image;
}

// A render state on a device with no block-compression features, so compressed uploads take the
// registered CPU decoder (the source's mock device exposes no compression features).
fn create_featureless_render_state() -> WgpuRenderState {
    let device = create_test_wgpu_device(create_test_native_device_without_features());
    return create_wgpu_render_state(
        &device,
        Some(&WgpuRenderStateOptions {
            format: Some(wgpu::TextureFormat::Bgra8Unorm),
            ..test_default()
        }),
    );
}

// A 2D texture over a host video (TS `videoTexture`): sRGB, linear clamp sampling, its image
// resource at `version`, and the video fake for driving readiness and resolution.
fn video_texture(
    version: u32,
    ready: bool,
    width: u32,
    height: u32,
) -> (Texture2D, Ref<ImageResource>, Arc<TestImageSource>) {
    let (image, fake) = create_test_image_resource(width, height, ready);
    image.write().unwrap().version = version;
    let source: TextureSourceRef = image.clone();
    let mut texture = create_texture_2d();
    texture.color_space = TextureColorSpace::Srgb;
    texture.source = Some(source);
    return (texture, image, fake);
}

fn record_degraded_guard(state: &mut WgpuRenderState) -> Arc<Mutex<Vec<u64>>> {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let record = calls.clone();
    get_wgpu_render_state_runtime_mut(state).mipmap_degraded_guard =
        Some(Arc::new(move |state: &WgpuRenderState| {
            record.lock().unwrap().push(get_entity_id(state));
        }));
    return calls;
}

fn pipeline_cache_size(state: &WgpuRenderState) -> usize {
    return get_wgpu_render_state_runtime(state)
        .context
        .read()
        .unwrap()
        .pipeline_cache
        .len();
}

mod apply_wgpu_blend_mode {
    use super::*;

    #[test]
    fn updates_current_blend_mode_on_the_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        apply_wgpu_blend_mode(&mut state, Some(&BLEND_MODE_ADD.to_string()));
        assert_eq!(
            get_wgpu_render_state_runtime(&state).current_blend_mode,
            Some(BLEND_MODE_ADD.to_string())
        );
    }

    #[test]
    fn accepts_null() {
        let mut state = create_wgpu_render_state_for_test(None);
        apply_wgpu_blend_mode(&mut state, Some(&BLEND_MODE_ADD.to_string()));
        apply_wgpu_blend_mode(&mut state, None);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .current_blend_mode
                .is_none()
        );
    }
}

mod bind_wgpu_bitmap_texture {
    use super::*;

    // The source spies on writeTexture: the recorded write targets the entry's texture with the
    // bitmap's layout, and the real device accepts it without a validation error.
    #[test]
    fn uploads_cpu_readable_pixels_via_write_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let image = bitmap(4, 1);
        let records = record_test_commands(&native);
        let (entry, error) = capture_wgpu_validation_error(&native, || {
            return bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);
        });
        assert!(error.is_none(), "{error:?}");
        let entry = entry.read().unwrap();
        let writes = recorded_texture_writes(&records);
        assert!(!writes.is_empty());
        assert_eq!(writes[0].texture, entry.texture);
        assert_eq!(
            entry.texture.size(),
            wgpu::Extent3d {
                width: 4,
                height: 4,
                depth_or_array_layers: 1,
            }
        );
        assert_eq!(entry.texture.format(), wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!(entry.version, Some(1));
    }

    // The source spies on createTexture; the re-upload is observed as a new allocation behind the
    // same cached entry.
    #[test]
    fn caches_by_resource_identity_and_re_uploads_only_when_the_version_changes() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut image = bitmap(2, 1);
        let first = bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);
        assert!(Arc::ptr_eq(
            &bind_wgpu_bitmap_texture(&mut state, &image, None, None, None),
            &first
        ));
        let outgoing = first.read().unwrap().texture.clone();
        assert_eq!(
            first.read().unwrap().texture,
            bind_wgpu_bitmap_texture(&mut state, &image, None, None, None)
                .read()
                .unwrap()
                .texture
        );
        image.version = 2;
        let second = bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);
        assert!(Arc::ptr_eq(&second, &first));
        assert_ne!(second.read().unwrap().texture, outgoing);
        assert_eq!(second.read().unwrap().version, Some(2));
    }

    #[test]
    fn retires_the_outgoing_texture_on_a_version_bump_rather_than_destroying_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut image = bitmap(2, 1);
        let outgoing = bind_wgpu_bitmap_texture(&mut state, &image, None, None, None)
            .read()
            .unwrap()
            .texture
            .clone();

        image.version = 2;
        bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);

        // A version bump rewrites the cached entry IN PLACE, so a bind group recorded earlier in the
        // frame still points at `outgoing`; destroying it would fail the deferred submit.
        assert!(
            get_wgpu_render_state_runtime(&state)
                .retired_textures
                .as_ref()
                .is_some_and(|retired| retired.contains(&outgoing))
        );
        let native = get_wgpu_render_state_native_device(&state);
        assert!(!is_wgpu_texture_destroyed(&native, &outgoing));
    }

    // FALSIFIER, defect 6 arm A: mip allocation is part of a resource's identity, not a sampling
    // preference. Asserting on the allocation keeps this immune to magnification and sampler maskers.
    #[test]
    fn does_not_hand_a_no_mip_realization_to_a_request_that_asks_for_mips() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let image = bitmap(4, 1);

        let without_mips = bind_wgpu_bitmap_texture(&mut state, &image, Some(false), None, None);
        assert_eq!(without_mips.read().unwrap().mip_level_count, 1);

        let with_mips = bind_wgpu_bitmap_texture(&mut state, &image, Some(true), None, None);
        assert!(with_mips.read().unwrap().mip_level_count > 1);
        assert!(with_mips.read().unwrap().texture.mip_level_count() > 1);
    }

    #[test]
    fn reuses_one_realization_when_the_mip_request_matches() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let image = bitmap(4, 1);

        let first = bind_wgpu_bitmap_texture(&mut state, &image, Some(true), None, None);
        let texture = first.read().unwrap().texture.clone();
        let second = bind_wgpu_bitmap_texture(&mut state, &image, Some(true), None, None);
        assert!(Arc::ptr_eq(&second, &first));
        assert_eq!(second.read().unwrap().texture, texture);
    }
}

mod bind_wgpu_compressed_image_texture {
    use super::*;

    #[test]
    fn routes_through_the_registered_compressed_upload_seam() {
        let mut state = create_featureless_render_state();
        let calls: Arc<Mutex<Vec<(TextureContainerFormat, u32, u32, usize)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = calls.clone();
        let decode: WgpuCompressedTextureDecoder = Arc::new(move |format, width, height, data| {
            record
                .lock()
                .unwrap()
                .push((format, width, height, data.len()));
            return Some(vec![0u8; 4 * 4 * 4]);
        });
        register_wgpu_compressed_texture_upload(&mut state, true);
        register_wgpu_compressed_texture_decoder(&mut state, Some(decode));
        let image = compressed_bc3_image();
        let entry = bind_wgpu_compressed_image_texture(&mut state, &image.read().unwrap(), None)
            .expect("the decoder fallback realizes the image");
        assert_eq!(entry.read().unwrap().texture.width(), 4);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(TextureContainerFormat::Bc3, 4, 4, 16)]
        );
    }

    #[test]
    fn returns_null_when_no_compressed_uploader_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let image = compressed_bc3_image();
        assert!(
            bind_wgpu_compressed_image_texture(&mut state, &image.read().unwrap(), None).is_none()
        );
    }
}

mod bind_wgpu_image_resource_texture {
    use super::*;

    // The queue spy becomes the host-image fake's copy log.
    #[test]
    fn uploads_a_host_backed_image_via_copy_external_image_to_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (image, fake) = create_test_image_resource(4, 4, true);
        image.write().unwrap().version = 1;
        let entry =
            bind_wgpu_image_resource_texture(&mut state, &image.read().unwrap(), None, None, None);
        assert!(entry.is_some());
        assert_eq!(fake.copy_count(), 1);
    }

    #[test]
    fn skips_an_initial_upload_when_the_canvas_has_no_pixels() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (image, fake) = create_test_image_resource(0, 4, true);
        image.write().unwrap().version = 1;
        assert!(
            bind_wgpu_image_resource_texture(&mut state, &image.read().unwrap(), None, None, None)
                .is_none()
        );
        assert_eq!(fake.copy_attempt_count(), 0);
    }

    #[test]
    fn keeps_the_previous_upload_when_the_browser_cannot_snapshot_the_current_source() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (image, fake) = create_test_image_resource(4, 4, true);
        image.write().unwrap().version = 1;
        let entry =
            bind_wgpu_image_resource_texture(&mut state, &image.read().unwrap(), None, None, None)
                .expect("a ready image uploads");
        *fake.copy_error.lock().unwrap() = Some(WgpuExternalCopyError::CopyFailed);
        image.write().unwrap().version = 2;
        let again =
            bind_wgpu_image_resource_texture(&mut state, &image.read().unwrap(), None, None, None)
                .expect("the previous upload is kept");
        assert!(Arc::ptr_eq(&again, &entry));
        assert_eq!(fake.copy_attempt_count(), 2);
    }
}

mod bind_wgpu_texture {
    use super::*;

    #[test]
    fn creates_and_caches_a_texture_entry() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(8, 8, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).expect("a ready canvas");
        assert_eq!(entry.read().unwrap().texture.width(), 8);
        assert!(Arc::ptr_eq(
            &bind_wgpu_texture(&mut state, &canvas, None).unwrap(),
            &entry
        ));
    }

    // The createTexture spy becomes the allocation's own mip level count.
    #[test]
    fn allocates_a_single_mip_level_and_generates_no_chain_by_default() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(8, 8, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).unwrap();
        assert_eq!(entry.read().unwrap().texture.mip_level_count(), 1);
    }

    // The submit spy is the recorded queue submit; before it, one cleared pass per lower level.
    #[test]
    fn allocates_a_full_mip_chain_and_generates_it_when_generate_mips_is_true() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let (canvas, _) = create_test_image(8, 8, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, Some(true)).unwrap();
        let transparent = WgpuColorLoadRecord::Clear(WgpuClearColorRecord {
            a: 0.0,
            b: 0.0,
            g: 0.0,
            r: 0.0,
        });
        let commands = records.lock().unwrap().clone();
        let passes: Vec<_> = commands
            .iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::BeginRenderPass(begin) => Some(begin.color),
                _ => None,
            })
            .collect();
        assert_eq!(passes, vec![transparent; 3]);
        assert!(matches!(
            commands.last(),
            Some(WgpuCommandRecord::Submit(1))
        ));
        // 8x8 -> 4 mip levels; the lower 3 are rendered via generate_wgpu_mipmaps.
        assert_eq!(entry.read().unwrap().texture.mip_level_count(), 4);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .mipmap_pipeline_cache
                .contains_key(&wgpu::TextureFormat::Rgba8Unorm)
        );
    }

    #[test]
    fn degrades_to_a_single_mip_level_when_generate_mips_is_true_but_no_generator_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(8, 8, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, Some(true)).unwrap();
        assert_eq!(entry.read().unwrap().texture.mip_level_count(), 1);
    }

    #[test]
    fn invokes_the_mipmap_degraded_guard_when_degrading() {
        let mut state = create_wgpu_render_state_for_test(None);
        let calls = record_degraded_guard(&mut state);
        let (canvas, _) = create_test_image(8, 8, true);
        bind_wgpu_texture(&mut state, &canvas, Some(true));
        assert_eq!(*calls.lock().unwrap(), vec![get_entity_id(&state)]);
    }

    #[test]
    fn does_not_invoke_the_mipmap_degraded_guard_when_the_generator_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let calls = record_degraded_guard(&mut state);
        let (canvas, _) = create_test_image(8, 8, true);
        bind_wgpu_texture(&mut state, &canvas, Some(true));
        assert!(calls.lock().unwrap().is_empty());
    }

    // The raw-element cache carries the same mip identity rule as the TextureSource caches.
    #[test]
    fn applies_the_same_mip_identity_rule_to_the_raw_element_cache() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let (canvas, _) = create_test_image(4, 4, true);

        let without_mips = bind_wgpu_texture(&mut state, &canvas, Some(false)).unwrap();
        assert_eq!(without_mips.read().unwrap().mip_level_count, 1);
        let with_mips = bind_wgpu_texture(&mut state, &canvas, Some(true)).unwrap();
        assert!(with_mips.read().unwrap().mip_level_count > 1);
    }
}

mod bind_wgpu_video_texture {
    use super::*;

    // The queue spy becomes the video fake's copy log.
    #[test]
    fn uploads_once_per_source_version_and_caches_the_texture_by_source_identity() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (video, image, fake) = video_texture(1, true, 320, 240);
        let first = bind_wgpu_video_texture(&mut state, &video).expect("a decoded frame");
        assert_eq!(fake.copy_count(), 1);
        assert!(Arc::ptr_eq(
            &bind_wgpu_video_texture(&mut state, &video).unwrap(),
            &first
        ));
        assert_eq!(fake.copy_count(), 1);
        image.write().unwrap().version = 2;
        assert!(Arc::ptr_eq(
            &bind_wgpu_video_texture(&mut state, &video).unwrap(),
            &first
        ));
        assert_eq!(fake.copy_count(), 2);
    }

    // The destroy spy becomes the outgoing allocation rejecting a write.
    #[test]
    fn waits_for_a_decoded_frame_and_recreates_the_texture_after_a_resolution_change() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (video, _image, fake) = video_texture(1, false, 0, 0);
        assert!(bind_wgpu_video_texture(&mut state, &video).is_none());
        fake.ready.store(true, Ordering::SeqCst);
        fake.set_size(160, 120);
        let first = bind_wgpu_video_texture(&mut state, &video).unwrap();
        let first_texture = first.read().unwrap().texture.clone();
        fake.set_size(320, 240);
        let second = bind_wgpu_video_texture(&mut state, &video).unwrap();
        assert!(!Arc::ptr_eq(&second, &first));
        assert_eq!(second.read().unwrap().texture.width(), 320);
        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_wgpu_texture_destroyed(&native, &first_texture));
    }

    // The createTexture spy becomes each allocation's own format.
    #[test]
    fn realizes_distinct_linear_and_srgb_textures_for_one_video_source() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (mut video, _image, _fake) = video_texture(1, true, 320, 240);
        let srgb = bind_wgpu_video_texture(&mut state, &video).unwrap();
        assert_eq!(
            srgb.read().unwrap().texture.format(),
            wgpu::TextureFormat::Rgba8UnormSrgb
        );
        video.texture_fields_mut().color_space = TextureColorSpace::Linear;
        let linear = bind_wgpu_video_texture(&mut state, &video).unwrap();
        assert!(!Arc::ptr_eq(&linear, &srgb));
        assert_eq!(
            linear.read().unwrap().texture.format(),
            wgpu::TextureFormat::Rgba8Unorm
        );
    }

    #[test]
    fn destroys_and_removes_an_uploaded_video_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (video, _image, _fake) = video_texture(1, true, 320, 240);
        let entry = bind_wgpu_video_texture(&mut state, &video).unwrap();
        let texture = entry.read().unwrap().texture.clone();
        assert!(destroy_wgpu_video_texture(&mut state, &video));
        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_wgpu_texture_destroyed(&native, &texture));
        assert!(!destroy_wgpu_video_texture(&mut state, &video));
    }
}

mod create_wgpu_texture_entry {
    use super::*;

    #[test]
    fn creates_a_texture_entry_from_a_canvas() {
        let state = create_wgpu_render_state_for_test(None);
        let (canvas, fake) = create_test_image(4, 4, true);
        let entry = create_wgpu_texture_entry(&state, 4, 4, &canvas).expect("a ready canvas");
        let entry = entry.read().unwrap();
        assert_eq!(entry.texture.width(), 4);
        assert_eq!(entry.texture.height(), 4);
        assert!(entry.bindings.is_empty());
        assert_eq!(
            *fake.copies.lock().unwrap(),
            vec![TestImageCopy {
                height: 4,
                origin: [0, 0, 0],
                premultiplied_alpha: true,
                texture: entry.texture.clone(),
                width: 4,
            }]
        );
    }
}

mod destroy_wgpu_video_texture {
    use super::*;

    #[test]
    fn is_the_public_disposal_entry_point_for_dynamic_video_uploads() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (video, _image, _fake) = video_texture(1, true, 16, 16);
        assert!(!destroy_wgpu_video_texture(&mut state, &video));
        bind_wgpu_video_texture(&mut state, &video).unwrap();
        assert!(destroy_wgpu_video_texture(&mut state, &video));
        let sourceless = create_texture_2d();
        assert!(!destroy_wgpu_video_texture(&mut state, &sourceless));
    }
}

mod draw_wgpu_quad {
    use super::*;

    // "Does not throw" is a validated pass on a real device; the draw's uniform slot advancing shows
    // the quad was recorded rather than skipped.
    #[test]
    fn does_not_throw_when_render_pass_is_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node = create_test_node("test-node");
        let proxy = create_render_proxy_2d(&mut state, &node);
        let (canvas, _) = create_test_image(4, 4, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).unwrap();
        let native = get_wgpu_render_state_native_device(&state);
        let ((), error) = capture_wgpu_validation_error(&native, || {
            let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
            let before = get_wgpu_render_state_runtime(pass.state).uniform_offset;
            draw_wgpu_quad(
                pass.state, &proxy, &entry, 0.0, 0.0, 4.0, 4.0, 0.0, 0.0, 1.0, 1.0,
            );
            assert!(get_wgpu_render_state_runtime(pass.state).uniform_offset > before);
            end_wgpu_render_pass(pass);
            submit_wgpu_frame(&mut state);
        });
        assert!(error.is_none(), "{error:?}");
    }
}

mod draw_wgpu_quad_with_transform {
    use super::*;

    #[test]
    fn does_not_throw_when_render_pass_is_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node = create_test_node("test-node");
        let proxy = create_render_proxy_2d(&mut state, &node);
        let (canvas, _) = create_test_image(4, 4, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).unwrap();
        let transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        let native = get_wgpu_render_state_native_device(&state);
        let ((), error) = capture_wgpu_validation_error(&native, || {
            let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
            let before = get_wgpu_render_state_runtime(pass.state).uniform_offset;
            draw_wgpu_quad_with_transform(
                pass.state,
                proxy.alpha,
                proxy.color_scale_bias.as_ref(),
                &transform,
                &entry,
                0.0,
                0.0,
                4.0,
                4.0,
                0.0,
                0.0,
                1.0,
                1.0,
            );
            assert!(get_wgpu_render_state_runtime(pass.state).uniform_offset > before);
            end_wgpu_render_pass(pass);
            submit_wgpu_frame(&mut state);
        });
        assert!(error.is_none(), "{error:?}");
    }
}

mod enable_wgpu_blend_mode_support {
    use super::*;

    #[test]
    fn sets_apply_blend_mode() {
        let mut state = create_wgpu_render_state_for_test(None);
        enable_wgpu_blend_mode_support(&mut state);
        let installed = state
            .apply_blend_mode
            .read()
            .unwrap()
            .expect("applyBlendMode is set");
        let expected: WgpuApplyBlendMode = apply_wgpu_blend_mode;
        assert!(std::ptr::fn_addr_eq(installed, expected));
    }
}

mod get_wgpu_render_proxy_color_scale_bias {
    use super::*;

    #[test]
    fn returns_null_when_the_node_has_no_color_adjustment() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node = create_test_node("test-node");
        let proxy = create_render_proxy_2d(&mut state, &node);
        assert!(get_wgpu_render_proxy_color_scale_bias(&proxy).is_none());
    }

    #[test]
    fn returns_the_resolved_node_level_color_adjustment_trait() {
        let mut state = create_wgpu_render_state_for_test(None);
        let node = create_test_node("test-node");
        let mut proxy = create_render_proxy_2d(&mut state, &node);
        proxy.color_scale_bias = Some({
            let mut value = create_color_scale_bias();
            value.red_scale = 0.5;
            value
        });
        let resolved = get_wgpu_render_proxy_color_scale_bias(&proxy).expect("the node adjustment");
        assert_eq!(resolved.red_scale, 0.5);
        assert_eq!(
            format!("{resolved:?}"),
            format!("{:?}", proxy.color_scale_bias.as_ref().unwrap())
        );
    }
}

mod initialize_wgpu_texture_entry {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_texture_entry() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_mipmap_generation(&mut state);
        let entry = bind_wgpu_bitmap_texture(&mut state, &bitmap(4, 1), Some(true), None, None);
        resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true));
        assert!(entry.read().unwrap().mip_level_count > 1);
        assert_eq!(entry.read().unwrap().bindings.len(), 1);

        let (canvas, _) = create_test_image(2, 2, true);
        let fresh = create_wgpu_texture_entry(&state, 2, 2, &canvas).unwrap();
        let texture = fresh.read().unwrap().texture.clone();
        let view = fresh.read().unwrap().view.clone();
        initialize_wgpu_texture_entry(&mut entry.write().unwrap(), texture.clone(), view.clone());

        let entry = entry.read().unwrap();
        assert!(entry.bindings.is_empty());
        assert_eq!(entry.mip_level_count, 1);
        assert_eq!(entry.texture, texture);
        assert_eq!(entry.view, view);
    }
}

mod resolve_wgpu_smoothing_bind_group {
    use super::*;

    #[test]
    fn follows_the_state_smoothing_policy_for_a_null_smoothing() {
        let mut state = create_wgpu_render_state_for_test(None);
        let entry = bind_wgpu_bitmap_texture(&mut state, &bitmap(4, 1), None, None, None);

        state.render_state_mut().allow_smoothing = true;
        let resources = get_wgpu_render_state_device_resources(&state);
        let bind_group = resolve_wgpu_smoothing_bind_group(&state, &entry, None);
        assert_eq!(
            entry
                .read()
                .unwrap()
                .bindings
                .get(&resources.linear_sampler),
            Some(&bind_group)
        );
    }

    // FALSIFIER, defect 6 arm B: a cached bind group must not carry the creating state's smoothing.
    #[test]
    fn rebuilds_for_the_current_policy_when_allow_smoothing_changes_after_the_texture_was_realized()
    {
        let mut state = create_wgpu_render_state_for_test(None);

        state.render_state_mut().allow_smoothing = true;
        let entry = bind_wgpu_bitmap_texture(&mut state, &bitmap(4, 1), None, None, None);
        let smoothed = resolve_wgpu_smoothing_bind_group(&state, &entry, None);

        state.render_state_mut().allow_smoothing = false;
        let unsmoothed = resolve_wgpu_smoothing_bind_group(&state, &entry, None);

        assert_ne!(unsmoothed, smoothed);
        let resources = get_wgpu_render_state_device_resources(&state);
        assert_eq!(
            entry
                .read()
                .unwrap()
                .bindings
                .get(&resources.nearest_sampler),
            Some(&unsmoothed)
        );
        // Flipping back returns the first group rather than building a third.
        state.render_state_mut().allow_smoothing = true;
        assert_eq!(
            resolve_wgpu_smoothing_bind_group(&state, &entry, None),
            smoothed
        );
    }

    #[test]
    fn lets_a_source_owned_sampler_override_the_policy_and_an_explicit_override_beat_both() {
        let mut state = create_wgpu_render_state_for_test(None);
        let entry = bind_wgpu_bitmap_texture(&mut state, &bitmap(4, 1), None, None, None);

        // External/video sources fix their own filtering; the global policy must not override it.
        let resources = get_wgpu_render_state_device_resources(&state);
        entry.write().unwrap().sampler = Some(resources.nearest_sampler.clone());
        state.render_state_mut().allow_smoothing = true;
        let source_owned = resolve_wgpu_smoothing_bind_group(&state, &entry, None);
        assert_eq!(
            entry
                .read()
                .unwrap()
                .bindings
                .get(&resources.nearest_sampler),
            Some(&source_owned)
        );
        // A per-bitmap override still wins.
        let overridden = resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true));
        assert_eq!(
            entry
                .read()
                .unwrap()
                .bindings
                .get(&resources.linear_sampler),
            Some(&overridden)
        );
    }

    // The createBindGroup spy becomes the entry's per-sampler binding count.
    #[test]
    fn builds_and_caches_distinct_linear_and_nearest_variants_for_true_false() {
        let mut state = create_wgpu_render_state_for_test(None);
        let entry = bind_wgpu_bitmap_texture(&mut state, &bitmap(4, 1), None, None, None);
        let resources = get_wgpu_render_state_device_resources(&state);

        let smoothed = resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true));
        assert!(
            entry
                .read()
                .unwrap()
                .bindings
                .contains_key(&resources.linear_sampler)
        );
        assert_eq!(entry.read().unwrap().bindings.len(), 1);

        // Second smoothed bind reuses the cached variant: no new bind group.
        assert_eq!(
            resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true)),
            smoothed
        );
        assert_eq!(entry.read().unwrap().bindings.len(), 1);

        // The unsmoothed variant is a separate cached bind group.
        let unsmoothed = resolve_wgpu_smoothing_bind_group(&state, &entry, Some(false));
        assert!(
            entry
                .read()
                .unwrap()
                .bindings
                .contains_key(&resources.nearest_sampler)
        );
        assert_ne!(unsmoothed, smoothed);
        assert_eq!(entry.read().unwrap().bindings.len(), 2);
    }

    #[test]
    fn drops_the_cached_variants_when_the_texture_re_uploads_version_bump() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut image = bitmap(4, 1);
        let entry = bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);
        resolve_wgpu_smoothing_bind_group(&state, &entry, Some(true));
        resolve_wgpu_smoothing_bind_group(&state, &entry, Some(false));
        assert_eq!(entry.read().unwrap().bindings.len(), 2);
        image.version = 2;
        bind_wgpu_bitmap_texture(&mut state, &image, None, None, None);
        assert_eq!(entry.read().unwrap().bindings.len(), 0);
    }
}

mod submit_wgpu_quad_draw {
    use super::*;

    // "Does not throw" is a validated pass on a real device.
    #[test]
    fn does_not_throw_when_render_pass_is_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(4, 4, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).unwrap();
        let native = get_wgpu_render_state_native_device(&state);
        let ((), error) = capture_wgpu_validation_error(&native, || {
            let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
            let bind_group = resolve_wgpu_smoothing_bind_group(pass.state, &entry, None);
            submit_wgpu_quad_draw(pass.state, 0, &bind_group);
            assert!(
                get_wgpu_render_state_runtime(pass.state)
                    .render_pass
                    .is_some()
            );
            end_wgpu_render_pass(pass);
            submit_wgpu_frame(&mut state);
        });
        assert!(error.is_none(), "{error:?}");
    }

    #[test]
    fn is_a_no_op_when_render_pass_is_null() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas, _) = create_test_image(4, 4, true);
        let entry = bind_wgpu_texture(&mut state, &canvas, None).unwrap();
        let bind_group = resolve_wgpu_smoothing_bind_group(&state, &entry, None);
        submit_wgpu_quad_draw(&mut state, 0, &bind_group);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.render_pass.is_none());
        assert!(runtime.command_encoder.is_none());
    }
}

mod update_wgpu_texture_entry {
    use super::*;

    #[test]
    fn does_not_throw_when_called_with_a_canvas() {
        let state = create_wgpu_render_state_for_test(None);
        let (canvas, fake) = create_test_image(4, 4, true);
        let entry = create_wgpu_texture_entry(&state, 4, 4, &canvas).unwrap();
        update_wgpu_texture_entry(&state, &entry, &canvas);
        assert_eq!(fake.copy_count(), 2);
    }
}

mod warm_wgpu_pipelines {
    use super::*;

    #[test]
    fn pre_populates_the_pipeline_cache() {
        let mut state = create_wgpu_render_state_for_test(None);
        let before = pipeline_cache_size(&state);
        warm_wgpu_pipelines(&mut state);
        let after = pipeline_cache_size(&state);
        assert!(after >= before);
        assert!(after >= 2);
        warm_wgpu_pipelines(&mut state);
        assert_eq!(pipeline_cache_size(&state), after);
    }
}
