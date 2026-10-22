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
