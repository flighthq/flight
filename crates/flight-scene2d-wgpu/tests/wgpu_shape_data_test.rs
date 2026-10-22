use std::sync::Arc;

use flight_entity::get_entity_id;
use flight_node::NodeRef;
use flight_render::CanvasHostSurfaces;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::*;

use crate::support::*;

fn empty_data() -> WgpuShapeRendererData {
    let mut out: WgpuShapeRendererData = flight_entity::allocate_entity();
    out.last_content_id = -1;
    out.mesh_version = -1;
    return out;
}

fn shape_node() -> NodeRef {
    return create_test_solid_shape();
}

mod acquire_wgpu_shape_raster_surface {
    use super::*;

    #[test]
    fn allocates_once_and_returns_the_same_surface_thereafter() {
        let (canvas_host, record) = create_test_canvas_host();
        let image_host = create_test_image_host();
        let mut surfaces: CanvasHostSurfaces = test_default();
        let mut data = empty_data();
        let first =
            acquire_wgpu_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, &mut data)
                .unwrap();
        assert!(Arc::ptr_eq(data.surface.as_ref().unwrap(), &first));
        let second =
            acquire_wgpu_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, &mut data)
                .unwrap();
        assert!(Arc::ptr_eq(&second, &first));
        assert_eq!(record.created_count(), 1);
    }

    #[test]
    fn wraps_the_canvas_as_an_image_so_the_quad_batch_treats_it_like_any_other_texture_source() {
        let (canvas_host, _) = create_test_canvas_host();
        let image_host = create_test_image_host();
        let mut surfaces: CanvasHostSurfaces = test_default();
        let mut data = empty_data();
        acquire_wgpu_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, &mut data);
        assert!(data.surface.is_some());
        assert!(data.image.is_some());
    }

    #[test]
    fn preserves_expected_absence_without_caching_it_when_the_provider_refuses() {
        let (canvas_host, record) = create_test_canvas_host();
        record
            .refuse
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let image_host = create_test_image_host();
        let mut surfaces: CanvasHostSurfaces = test_default();
        let mut data = empty_data();
        assert!(
            acquire_wgpu_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, &mut data)
                .is_none()
        );
        assert!(data.surface.is_none());
    }
}

mod create_wgpu_shape_data {
    use super::*;

    #[test]
    fn allocates_no_canvas_up_front_so_a_mesh_only_scene_carries_none() {
        let mut state = create_wgpu_render_state_for_test(None);
        set_test_hosts(&mut state);
        let data = create_wgpu_shape_data(&mut state, &shape_node()).unwrap();
        let mut guard = data.write().unwrap();
        let data = get_wgpu_shape_data(&mut *guard).unwrap();
        assert!(data.surface.is_none());
        assert!(data.meshes.is_none());
        assert_eq!(data.mesh_version, -1);
    }
}

mod destroy_wgpu_shape_data {
    use super::*;

    #[test]
    fn does_nothing_when_the_shape_only_ever_tessellated_since_there_is_no_surface_to_free() {
        let mut state = create_wgpu_render_state_for_test(None);
        let record = set_test_hosts(&mut state);
        let data = create_wgpu_shape_data(&mut state, &shape_node()).unwrap();
        destroy_wgpu_shape_data(&mut state, data);
        assert_eq!(record.destroyed_count(), 0);
    }

    #[test]
    fn destroys_the_cached_gpu_texture_before_the_raster_surface_then_frees_the_mesh_buffers() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let node = create_test_solid_shape();
        let erased: NodeRef = node.clone();
        let mut proxy = create_test_shape_proxy(&mut state, &erased);
        let (rasterizer, _) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        register_wgpu_standard_material(&mut state);
        draw_wgpu_raster_shape(&mut state, &proxy);
        draw_wgpu_shape_meshes(
            &mut state,
            &proxy,
            &[WgpuShapeMesh {
                vertices: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                indices: vec![0, 1, 2],
                color: 0xffffffff,
                alpha: 1.0,
            }],
            &mut test_default(),
        );
        let data = proxy.renderer_data.take().unwrap();
        let (image_id, vertex_buffer) = {
            let mut guard = data.write().unwrap();
            let shape_data = get_wgpu_shape_data(&mut *guard).unwrap();
            shape_data.mesh_buffers.vertex_buffers.push(
                get_wgpu_render_state_native_device(&state)
                    .device
                    .create_buffer(&wgpu::BufferDescriptor {
                        label: None,
                        size: 8,
                        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    }),
            );
            let image = shape_data.image.clone().unwrap();
            (
                get_entity_id(&*image.read().unwrap()),
                shape_data.mesh_buffers.vertex_buffers[0].clone(),
            )
        };
        let context = get_wgpu_render_state_runtime(&state).context.clone();
        let entry = context
            .read()
            .unwrap()
            .texture_source_premultiplied_texture_cache
            .get(&image_id)
            .cloned()
            .expect("the raster upload is cached");
        submit_wgpu_frame(&mut state);

        destroy_wgpu_shape_data(&mut state, data.clone());

        let native = get_wgpu_render_state_native_device(&state);
        assert!(
            !context
                .read()
                .unwrap()
                .texture_source_premultiplied_texture_cache
                .contains_key(&image_id)
        );
        assert!(is_test_texture_destroyed(
            &native,
            &entry.read().unwrap().texture
        ));
        // One destroy re-sized the 1x1 first-use surface; teardown destroys the live one.
        assert_eq!(record.destroyed_count(), 2);
        assert!(is_test_buffer_destroyed(&native, &vertex_buffer));
        let mut guard = data.write().unwrap();
        let shape_data = get_wgpu_shape_data(&mut *guard).unwrap();
        assert!(shape_data.mesh_buffers.vertex_buffers.is_empty());
        assert!(
            shape_data
                .mesh_buffers
                .color_scale_bias_uniform_buffers
                .is_empty()
        );
    }

    #[test]
    fn destroys_a_raster_surface_even_when_it_never_acquired_a_gpu_cache_entry() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts_with_unready_images(&mut state);
        let (rasterizer, _) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        register_wgpu_standard_material(&mut state);
        let node: NodeRef = create_test_solid_shape();
        let mut proxy = create_test_shape_proxy(&mut state, &node);
        draw_wgpu_raster_shape(&mut state, &proxy);
        assert_eq!(record.created_count(), 2);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .context
                .read()
                .unwrap()
                .texture_source_premultiplied_texture_cache
                .is_empty()
        );

        destroy_wgpu_shape_data(&mut state, proxy.renderer_data.take().unwrap());

        assert_eq!(record.destroyed_count(), 2);
        submit_wgpu_frame(&mut state);
    }
}

mod get_wgpu_shape_data {
    use super::*;

    #[test]
    fn reads_the_shape_data_back_out_of_the_opaque_renderer_data_slot() {
        let mut state = create_wgpu_render_state_for_test(None);
        let data = create_wgpu_shape_data(&mut state, &shape_node()).unwrap();
        let mut guard = data.write().unwrap();
        assert_eq!(get_wgpu_shape_data(&mut *guard).unwrap().mesh_version, -1);
    }
}
