use flight_render_wgpu::*;

use crate::support::*;

fn create_upload_texture(
    native: &WgpuNativeDevice,
    width: u32,
    height: u32,
    layers: u32,
) -> wgpu::Texture {
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: layers,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
}

mod upload_wgpu_texture_data {
    use super::*;

    // The source spies on writeTexture's arguments; a real device instead validates the layout, so a
    // region of exactly width*4*height bytes into layer 3 is accepted only with bytesPerRow = width*4.
    #[test]
    fn drives_write_texture_with_a_tightly_packed_rgba8_layout_bytes_per_row_width_4() {
        let native = create_test_native_device();
        let texture = create_upload_texture(&native, 2, 2, 4);
        let data: Vec<u8> = (0u8..16).collect();
        let records = record_test_commands(&native);
        let ((), error) = capture_wgpu_validation_error(&native, || {
            upload_wgpu_texture_data(
                &native,
                &texture,
                wgpu::Origin3d { x: 0, y: 0, z: 3 },
                2,
                2,
                &data,
            );
        });
        assert!(error.is_none(), "{error:?}");
        let writes = recorded_texture_writes(&records);
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].texture, texture);
        assert_eq!(writes[0].origin, [0, 0, 3]);
        assert_eq!(writes[0].data, data);
        assert_eq!(
            (writes[0].bytes_per_row, writes[0].rows_per_image),
            (Some(8), Some(2))
        );
        assert_eq!(writes[0].size, [2, 2, 1]);
    }
}

mod upload_wgpu_texture_element {
    use super::*;

    // The external copy is observed through the host-image fake's copy log instead of a queue spy.
    #[test]
    fn drives_copy_external_image_to_texture_with_the_external_source() {
        let native = create_test_native_device();
        let texture = create_upload_texture(&native, 4, 4, 1);
        let (source, fake) = create_test_image(4, 4, true);
        upload_wgpu_texture_element(&native, &texture, wgpu::Origin3d::ZERO, 4, 4, &source);
        assert_eq!(
            *fake.copies.lock().unwrap(),
            vec![TestImageCopy {
                height: 4,
                origin: [0, 0, 0],
                premultiplied_alpha: false,
                texture: texture.clone(),
                width: 4,
            }]
        );
    }

    #[test]
    fn skips_a_copy_with_a_zero_sized_extent() {
        let native = create_test_native_device();
        let texture = create_upload_texture(&native, 4, 4, 1);
        let (source, fake) = create_test_image(4, 4, true);
        upload_wgpu_texture_element(&native, &texture, wgpu::Origin3d::ZERO, 0, 4, &source);
        assert_eq!(fake.copy_attempt_count(), 0);
    }

    #[test]
    fn skips_a_copy_when_the_browser_cannot_snapshot_the_source() {
        let native = create_test_native_device();
        let texture = create_upload_texture(&native, 4, 4, 1);
        let (source, fake) = create_test_image(4, 4, true);
        *fake.copy_error.lock().unwrap() = Some(WgpuExternalCopyError::CopyFailed);
        upload_wgpu_texture_element(&native, &texture, wgpu::Origin3d::ZERO, 4, 4, &source);
        assert_eq!(fake.copy_attempt_count(), 1);
        assert_eq!(fake.copy_count(), 0);
    }
}

mod upload_wgpu_texture_image_resource {
    use super::*;

    // The source asserts writeTexture is untouched; the fake's copy log shows the element path ran
    // exactly once (the CPU path has no host image to log).
    #[test]
    fn takes_the_element_path_when_the_resource_carries_a_source() {
        let native = create_test_native_device();
        let texture = create_upload_texture(&native, 4, 4, 1);
        let (image, fake) = create_test_image_resource(4, 4, true);
        let image = image.read().unwrap();
        upload_wgpu_texture_image_resource(&native, &texture, wgpu::Origin3d::ZERO, &image);
        assert_eq!(fake.copy_attempt_count(), 1);
        assert_eq!(fake.copy_count(), 1);
    }
}
