use std::sync::{Arc, Mutex};

use flight_render_wgpu::*;

use crate::support::*;

fn write_one_texel(native: &WgpuNativeDevice) {
    let texture = native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    upload_wgpu_texture_data(native, &texture, wgpu::Origin3d::ZERO, 1, 1, &[1, 2, 3, 4]);
}

mod record_wgpu_command {
    use super::*;

    #[test]
    fn reports_a_layered_package_record_to_the_installed_observer() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        record_wgpu_command(&native, || {
            return WgpuCommandRecord::Draw(WgpuDrawRecord {
                instance_count: 1,
                vertex_count: 6,
            });
        });
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::Draw(WgpuDrawRecord {
                instance_count: 1,
                vertex_count: 6
            })
        )));
    }

    #[test]
    fn builds_no_record_without_an_observer() {
        let native = create_test_native_device();
        let built = Arc::new(Mutex::new(false));
        let flag = built.clone();
        record_wgpu_command(&native, move || {
            *flag.lock().unwrap() = true;
            return WgpuCommandRecord::Submit(1);
        });
        assert!(!*built.lock().unwrap());
    }
}

mod set_wgpu_native_device_command_observer {
    use super::*;

    #[test]
    fn records_the_exact_commands_while_installed_and_nothing_once_cleared() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        write_one_texel(&native);
        assert_eq!(recorded_texture_writes(&records).len(), 1);
        assert_eq!(recorded_texture_writes(&records)[0].data, vec![1, 2, 3, 4]);

        set_wgpu_native_device_command_observer(&native, None);
        write_one_texel(&native);
        assert_eq!(recorded_texture_writes(&records).len(), 1);
    }

    // The observer lives on the payload, so every clone (every state on the device) reports to it.
    #[test]
    fn is_shared_by_every_clone_of_the_device_payload() {
        let native = create_test_native_device();
        let alias = native.clone();
        let seen = Arc::new(Mutex::new(0));
        let counter = seen.clone();
        set_wgpu_native_device_command_observer(
            &native,
            Some(Arc::new(move |_record: &WgpuCommandRecord| {
                *counter.lock().unwrap() += 1;
            })),
        );
        write_one_texel(&alias);
        assert_eq!(*seen.lock().unwrap(), 1);
    }
}

mod write_wgpu_buffer {
    use super::*;

    #[test]
    fn writes_through_the_queue_and_records_the_exact_bytes_and_offset() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 16,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::UNIFORM,
            mapped_at_creation: false,
        });
        write_wgpu_buffer(&native, &buffer, 4, &[1, 2, 3, 4]);
        let writes: Vec<WgpuBufferWriteRecord> = records
            .lock()
            .unwrap()
            .iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::WriteBuffer(write) => Some(write.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].offset, 4);
        assert_eq!(writes[0].data, vec![1, 2, 3, 4]);
        assert_eq!(writes[0].buffer, buffer);
    }
}

mod write_wgpu_texture {
    use super::*;

    #[test]
    fn writes_through_the_queue_and_records_the_layout_and_bytes() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let texture = native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        write_wgpu_texture(
            &native,
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &[9, 8, 7, 6],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let writes = recorded_texture_writes(&records);
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].data, vec![9, 8, 7, 6]);
        assert_eq!(writes[0].bytes_per_row, Some(4));
        assert_eq!(writes[0].size, [1, 1, 1]);
        assert_eq!(writes[0].texture, texture);
    }
}
