//! The source's `wgpuScene3DTestHelper.test.ts`, ported against the real noop device in
//! `support.rs`: the source's fake re-implemented WebGPU's synchronous queue and pass validation,
//! which the real device performs itself, so each rejection is asserted as the device's validation
//! panic and each acceptance as the recorded call.

use flight_render_wgpu::*;

use crate::support::*;

fn create_buffer(test: &WgpuScene3DTestState, size: u64, usage: wgpu::BufferUsages) -> wgpu::Buffer {
    return create_wgpu_buffer(&test.native, size, usage | wgpu::BufferUsages::COPY_DST);
}

mod make_wgpu_scene3d_state {
    use super::*;

    #[test]
    fn records_aligned_write_buffer_data_using_typed_array_element_units() {
        let test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::UNIFORM);
        let data: [u16; 3] = [0, 1, 2];

        write_wgpu_buffer(&test.native, &buffer, 0, bytemuck::cast_slice(&data[..2]));

        assert_eq!(test.count("writeBuffer"), 1);
    }

    #[test]
    fn rejects_a_write_buffer_byte_size_that_is_not_a_multiple_of_four() {
        let test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::UNIFORM);
        let data: [u16; 3] = [0, 1, 2];

        assert!(test_panics(|| {
            test.native
                .queue
                .write_buffer(&buffer, 0, bytemuck::cast_slice(&data));
        }));
        assert_eq!(test.count("writeBuffer"), 0);
    }

    #[test]
    fn rejects_a_write_buffer_element_count_whose_bytes_are_not_a_multiple_of_four() {
        let test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::UNIFORM);
        let data: [u16; 1] = [7];

        assert!(test_panics(|| {
            test.native
                .queue
                .write_buffer(&buffer, 0, bytemuck::cast_slice(&data));
        }));
    }

    #[test]
    fn rejects_a_write_buffer_destination_offset_that_is_not_aligned_to_four_bytes() {
        let test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::UNIFORM);

        assert!(test_panics(|| {
            test.native.queue.write_buffer(&buffer, 2, &[0, 0, 0, 0]);
        }));
    }

    #[test]
    fn rejects_misaligned_or_out_of_range_index_buffer_bindings() {
        let mut test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::INDEX);

        // wgpu rejects a misaligned slice before it reaches the pass; an out-of-range one is a panic.
        assert!(test_panics(|| {
            let _ = buffer.slice(6..10);
        }));
        assert_eq!(test.count("setIndexBuffer"), 0);

        set_wgpu_render_pass_index_buffer(&mut test.state, &buffer, wgpu::IndexFormat::Uint16);
        assert_eq!(test.count("setIndexBuffer"), 1);
    }

    #[test]
    fn rejects_misaligned_or_out_of_range_vertex_buffer_bindings() {
        let mut test = make_wgpu_scene3d_state(None);
        let buffer = create_buffer(&test, 8, wgpu::BufferUsages::VERTEX);

        assert!(test_panics(|| {
            let _ = buffer.slice(4..12);
        }));
        assert_eq!(test.count("setVertexBuffer"), 0);

        set_wgpu_render_pass_vertex_buffer(&mut test.state, 0, &buffer);
        assert_eq!(test.count("setVertexBuffer"), 1);
    }

    #[test]
    fn rejects_write_texture_data_smaller_than_an_rgba8_copy_requires() {
        let test = make_wgpu_scene3d_state(None);
        let texture = test.native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 2,
                height: 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let layout = wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(8),
            rows_per_image: Some(2),
        };
        let size = wgpu::Extent3d {
            width: 2,
            height: 2,
            depth_or_array_layers: 1,
        };

        assert!(test_panics(|| {
            test.native
                .queue
                .write_texture(texture.as_image_copy(), &[0; 15], layout, size);
        }));
        assert_eq!(test.count("writeTexture"), 0);

        write_wgpu_texture(&test.native, texture.as_image_copy(), &[0; 16], layout, size);
        assert_eq!(test.count("writeTexture"), 1);
    }
}
