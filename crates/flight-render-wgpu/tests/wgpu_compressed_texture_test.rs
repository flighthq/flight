use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_image::contract::create_compressed_image_resource;
use flight_image::{CompressedImageData, CompressedImageResource};
use flight_render_wgpu::*;
use flight_texture_formats::{
    TextureContainer, TextureContainerFormat, TextureContainerLevel,
    TextureContainerSupercompression,
};

use crate::support::*;

// The source's default state: a mock device with no compression family enabled.
fn create_state_without_compression() -> WgpuRenderState {
    return create_state_on(create_test_native_device_without_features());
}

// The source's state after `features.add('texture-compression-bc')`.
fn create_state_with_bc() -> WgpuRenderState {
    let native = create_test_native_device_with_features(wgpu::Features::TEXTURE_COMPRESSION_BC);
    assert_eq!(
        native.device.features() & COMPRESSION_FEATURES,
        wgpu::Features::TEXTURE_COMPRESSION_BC,
        "the noop adapter offers BC compression"
    );
    return create_state_on(native);
}

fn create_state_on(native: WgpuNativeDevice) -> WgpuRenderState {
    return create_wgpu_render_state(
        &create_test_wgpu_device(native),
        Some(&WgpuRenderStateOptions {
            format: Some(wgpu::TextureFormat::Bgra8Unorm),
            ..test_default()
        }),
    );
}

const COMPRESSION_FEATURES: wgpu::Features = wgpu::Features::TEXTURE_COMPRESSION_BC
    .union(wgpu::Features::TEXTURE_COMPRESSION_ETC2)
    .union(wgpu::Features::TEXTURE_COMPRESSION_ASTC);

fn level(
    byte_offset: usize,
    byte_length: usize,
    width: usize,
    height: usize,
) -> TextureContainerLevel {
    return TextureContainerLevel {
        byte_offset,
        byte_length,
        width,
        height,
    };
}

// The source's `container()`: one 4x4 BC1 level.
fn container() -> TextureContainer {
    return TextureContainer {
        format: TextureContainerFormat::Bc1,
        width: 4,
        height: 4,
        depth: 1,
        mip_levels: 1,
        layers: 1,
        faces: 1,
        supercompression: TextureContainerSupercompression::None,
        levels: vec![level(0, 8, 4, 4)],
    };
}

fn compressed_image() -> Ref<CompressedImageResource> {
    let payload: Box<[u8]> = vec![0u8; 8].into_boxed_slice();
    return create_compressed_image_resource(Arc::new(CompressedImageData {
        container: container(),
        payload: Arc::new(RwLock::new(payload)),
    }));
}

fn zeroed_decoder() -> WgpuCompressedTextureDecoder {
    return Arc::new(|_, width, height, _| {
        return Some(vec![0u8; (width * height * 4) as usize]);
    });
}

fn native_of(state: &WgpuRenderState) -> WgpuNativeDevice {
    return get_wgpu_render_state_native_device(state);
}

mod detect_wgpu_compressed_texture_support {
    use super::*;

    #[test]
    fn reads_the_three_webgpu_compression_features() {
        let state = create_state_with_bc();
        assert_eq!(
            detect_wgpu_compressed_texture_support(&native_of(&state).device),
            WgpuCompressedTextureSupport {
                astc: false,
                bc: true,
                etc2: false,
            }
        );
    }

    #[test]
    fn reports_no_family_on_a_device_without_compression_features() {
        let state = create_state_without_compression();
        assert_eq!(
            detect_wgpu_compressed_texture_support(&native_of(&state).device),
            WgpuCompressedTextureSupport {
                astc: false,
                bc: false,
                etc2: false,
            }
        );
    }
}

mod get_wgpu_compressed_texture_format {
    use super::*;

    #[test]
    fn maps_a_format_only_when_its_family_is_enabled() {
        let plain = create_state_without_compression();
        assert_eq!(
            get_wgpu_compressed_texture_format(
                &native_of(&plain).device,
                TextureContainerFormat::Bc1
            ),
            None
        );
        let bc = create_state_with_bc();
        let device = native_of(&bc).device;
        assert_eq!(
            get_wgpu_compressed_texture_format(&device, TextureContainerFormat::Bc1),
            Some(wgpu::TextureFormat::Bc1RgbaUnorm)
        );
        assert_eq!(
            get_wgpu_compressed_texture_format(&device, TextureContainerFormat::Rgba8Unorm),
            None
        );
    }
}

mod has_wgpu_compressed_texture_format {
    use super::*;

    #[test]
    fn maps_formats_to_the_detected_family_and_rejects_pvrtc() {
        let support = WgpuCompressedTextureSupport {
            astc: true,
            bc: false,
            etc2: true,
        };
        assert!(has_wgpu_compressed_texture_format(
            &support,
            TextureContainerFormat::Astc8x8
        ));
        assert!(has_wgpu_compressed_texture_format(
            &support,
            TextureContainerFormat::Etc2Rgba
        ));
        assert!(!has_wgpu_compressed_texture_format(
            &support,
            TextureContainerFormat::Bc7
        ));
        assert!(!has_wgpu_compressed_texture_format(
            &support,
            TextureContainerFormat::Pvrtc4bppRgba
        ));
    }
}

mod register_wgpu_compressed_texture_decoder {
    use super::*;

    #[test]
    fn replaces_the_decoder_policy_slot_and_clears_it_with_null() {
        let mut state = create_state_without_compression();
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .compressed_texture_decoder
                .is_none()
        );
        let decoder: WgpuCompressedTextureDecoder =
            Arc::new(|_, _, _, _| return Some(vec![0u8; 64]));
        register_wgpu_compressed_texture_decoder(&mut state, Some(decoder.clone()));
        let installed = get_wgpu_render_state_runtime(&state)
            .registries
            .compressed_texture_decoder
            .clone()
            .expect("an installed decoder");
        assert!(Arc::ptr_eq(&installed, &decoder));
        register_wgpu_compressed_texture_decoder(&mut state, None);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .compressed_texture_decoder
                .is_none()
        );
    }
}

mod register_wgpu_compressed_texture_upload {
    use super::*;

    #[test]
    fn replaces_the_compressed_upload_policy_slot_and_clears_it_with_null() {
        let mut state = create_state_without_compression();
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .compressed_texture_upload
                .is_none()
        );
        register_wgpu_compressed_texture_upload(&mut state, true);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .compressed_texture_upload
                .is_some()
        );
        register_wgpu_compressed_texture_upload(&mut state, false);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .registries
                .compressed_texture_upload
                .is_none()
        );
    }

    #[test]
    fn lets_the_compressed_image_binder_consume_its_source() {
        let mut state = create_state_without_compression();
        let records = record_test_commands(&native_of(&state));
        register_wgpu_compressed_texture_upload(&mut state, true);
        let calls = Arc::new(AtomicU32::new(0));
        let counter = calls.clone();
        register_wgpu_compressed_texture_decoder(
            &mut state,
            Some(Arc::new(move |_, width, height, _| {
                counter.fetch_add(1, Ordering::SeqCst);
                return Some(vec![0u8; (width * height * 4) as usize]);
            })),
        );
        let image = compressed_image();

        let entry = bind_wgpu_compressed_image_texture(&mut state, &image.read().unwrap(), None)
            .expect("a bound entry");

        let entry = entry.read().unwrap();
        assert_eq!(entry.texture.format(), wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!((entry.texture.width(), entry.texture.height()), (4, 4));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(recorded_texture_writes(&records).len(), 1);
    }

    #[test]
    fn premultiplies_straight_alpha_decoder_output_before_the_rgba_upload() {
        let mut state = create_state_without_compression();
        let records = record_test_commands(&native_of(&state));
        register_wgpu_compressed_texture_upload(&mut state, true);
        register_wgpu_compressed_texture_decoder(
            &mut state,
            Some(Arc::new(|_, width, height, _| {
                let mut rgba = vec![0u8; (width * height * 4) as usize];
                for pixel in rgba.chunks_mut(4) {
                    pixel[0] = 255;
                    pixel[1] = 64;
                    pixel[3] = 128;
                }
                return Some(rgba);
            })),
        );
        let image = compressed_image();

        let entry = bind_wgpu_compressed_image_texture(&mut state, &image.read().unwrap(), None)
            .expect("a bound entry");

        let entry = entry.read().unwrap();
        assert_eq!(entry.straight_alpha, Some(false));
        assert_eq!(entry.texture.format(), wgpu::TextureFormat::Rgba8Unorm);
        assert_eq!(
            recorded_texture_writes(&records)[0].data[0..4],
            [128, 32, 0, 128]
        );
    }

    #[test]
    fn marks_native_straight_alpha_blocks_for_display_shader_premultiplication() {
        let mut state = create_state_with_bc();
        register_wgpu_compressed_texture_upload(&mut state, true);
        let image = compressed_image();
        let entry = bind_wgpu_compressed_image_texture(&mut state, &image.read().unwrap(), None)
            .expect("a bound entry");
        let entry = entry.read().unwrap();
        assert_eq!(entry.straight_alpha, Some(true));
        assert_eq!(entry.texture.format(), wgpu::TextureFormat::Bc1RgbaUnorm);
    }
}

mod upload_wgpu_compressed_texture_container {
    use super::*;

    #[test]
    fn uploads_native_blocks_with_their_block_row_layout() {
        let state = create_state_with_bc();
        let native = native_of(&state);
        let records = record_test_commands(&native);
        let mut texture = None;
        let error = capture_test_validation_error(&native, || {
            texture = upload_wgpu_compressed_texture_container(
                &state,
                &container(),
                &[0u8; 8],
                None,
                None,
            );
        });
        assert!(error.is_none(), "{error:?}");
        let texture = texture.expect("a native texture");
        assert_eq!(texture.format(), wgpu::TextureFormat::Bc1RgbaUnorm);
        assert_eq!(texture.mip_level_count(), 1);
        assert_eq!((texture.width(), texture.height()), (4, 4));
        assert_eq!(texture.depth_or_array_layers(), 1);
        let writes = recorded_texture_writes(&records);
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].mip_level, 0);
        assert_eq!(
            (writes[0].bytes_per_row, writes[0].rows_per_image),
            (Some(8), Some(1))
        );
        assert_eq!(writes[0].size, [4, 4, 1]);
        assert_eq!(writes[0].texture, texture);
    }

    #[test]
    fn decodes_plain_2d_levels_to_rgba_when_native_support_is_absent() {
        let state = create_state_without_compression();
        let native = native_of(&state);
        let calls: Arc<Mutex<Vec<(TextureContainerFormat, u32, u32, usize)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = calls.clone();
        let decoder: WgpuCompressedTextureDecoder = Arc::new(move |format, width, height, data| {
            record
                .lock()
                .unwrap()
                .push((format, width, height, data.len()));
            return Some(vec![0u8; 64]);
        });
        let mut texture = None;
        let error = capture_test_validation_error(&native, || {
            texture = upload_wgpu_compressed_texture_container(
                &state,
                &container(),
                &[0u8; 8],
                Some(&decoder),
                None,
            );
        });
        assert!(error.is_none(), "{error:?}");
        let texture = texture.expect("a decoded texture");
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(TextureContainerFormat::Bc1, 4, 4, 8)]
        );
        assert_eq!(texture.format(), wgpu::TextureFormat::Rgba8Unorm);
    }

    #[test]
    fn maps_canonical_multi_mip_cubemap_entries_to_the_right_mip_and_face_slice() {
        let levels = (0..6)
            .flat_map(|face| [level(face * 40, 32, 8, 8), level(face * 40 + 32, 8, 4, 4)])
            .collect();
        let cube = TextureContainer {
            faces: 6,
            height: 8,
            levels,
            mip_levels: 2,
            width: 8,
            ..container()
        };
        let plain = create_state_without_compression();
        assert!(
            upload_wgpu_compressed_texture_container(
                &plain,
                &cube,
                &[0u8; 240],
                Some(&zeroed_decoder()),
                None
            )
            .is_none()
        );

        let state = create_state_with_bc();
        let native = native_of(&state);
        let records = record_test_commands(&native);
        let mut texture = None;
        let error = capture_test_validation_error(&native, || {
            texture =
                upload_wgpu_compressed_texture_container(&state, &cube, &[0u8; 240], None, None);
        });
        // A level written to the wrong mip or face would overrun that subresource and fail here.
        assert!(error.is_none(), "{error:?}");
        let texture = texture.expect("a native cubemap");
        assert_eq!(texture.depth_or_array_layers(), 6);
        assert_eq!(texture.mip_level_count(), 2);
        assert_eq!((texture.width(), texture.height()), (8, 8));
        let writes = recorded_texture_writes(&records);
        assert_eq!(writes.len(), 12);
        assert_eq!((writes[1].mip_level, writes[1].origin), (1, [0, 0, 0]));
        assert_eq!((writes[2].mip_level, writes[2].origin), (0, [0, 0, 1]));
    }

    #[test]
    fn maps_canonical_multi_mip_array_entries_to_the_right_mip_and_layer_slice() {
        let state = create_state_with_bc();
        let native = native_of(&state);
        let array = TextureContainer {
            height: 8,
            layers: 2,
            levels: vec![
                level(0, 32, 8, 8),
                level(32, 8, 4, 4),
                level(40, 32, 8, 8),
                level(72, 8, 4, 4),
            ],
            mip_levels: 2,
            width: 8,
            ..container()
        };
        let records = record_test_commands(&native);
        let mut texture = None;
        let error = capture_test_validation_error(&native, || {
            texture =
                upload_wgpu_compressed_texture_container(&state, &array, &[0u8; 80], None, None);
        });
        assert!(error.is_none(), "{error:?}");
        let texture = texture.expect("a native array");
        assert_eq!(texture.depth_or_array_layers(), 2);
        assert_eq!(texture.mip_level_count(), 2);
        let writes = recorded_texture_writes(&records);
        assert_eq!((writes[1].mip_level, writes[1].origin), (1, [0, 0, 0]));
        assert_eq!((writes[2].mip_level, writes[2].origin), (0, [0, 0, 1]));
    }

    #[test]
    fn rejects_supercompressed_volume_cubemap_array_and_unavailable_payloads() {
        let state = create_state_without_compression();
        let payload = [0u8; 8];
        let upload = |container: TextureContainer| {
            return upload_wgpu_compressed_texture_container(
                &state, &container, &payload, None, None,
            );
        };
        assert!(
            upload(TextureContainer {
                supercompression: TextureContainerSupercompression::Zstd,
                ..container()
            })
            .is_none()
        );
        assert!(
            upload(TextureContainer {
                depth: 2,
                ..container()
            })
            .is_none()
        );
        assert!(
            upload(TextureContainer {
                faces: 6,
                layers: 2,
                ..container()
            })
            .is_none()
        );
        assert!(upload(container()).is_none());
    }
}
