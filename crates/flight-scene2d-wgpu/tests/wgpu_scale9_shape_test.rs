use std::sync::Arc;

use flight_entity::get_entity_id;
use flight_node::{NodeRef, RendererDataRef};
use flight_render::CanvasHostSurfaces;
use flight_render_wgpu::*;
use flight_scene2d_wgpu::contract::*;
use flight_shape::ShapeScale9Grid;

use crate::support::*;

fn grid() -> ShapeScale9Grid {
    return ShapeScale9Grid {
        x: 10.0,
        y: 10.0,
        width: 80.0,
        height: 80.0,
    };
}

fn scale9_node() -> NodeRef {
    let shape = flight_shape::create_scale9_shape(&grid());
    let bounds_state = shape.read().unwrap().data.bounds_state.clone();
    flight_shape::register_default_shape_bounds_commands(&bounds_state);
    return shape;
}

fn filled_scale9_node() -> NodeRef {
    let shape = flight_shape::create_scale9_shape(&grid());
    let bounds_state = shape.read().unwrap().data.bounds_state.clone();
    flight_shape::register_default_shape_bounds_commands(&bounds_state);
    flight_shape::append_shape_begin_fill(&shape, 0xff0000ff, None);
    flight_shape::append_shape_rectangle(&shape, 0.0, 0.0, 100.0, 100.0);
    return shape;
}

fn scale9_data(state: &mut WgpuRenderState) -> RendererDataRef {
    return create_wgpu_scale9_shape_data(state, &scale9_node()).unwrap();
}

mod acquire_wgpu_scale9_shape_raster_surface {
    use super::*;

    #[test]
    fn does_not_cache_provider_absence_and_retries_on_the_next_draw() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas_host, record) = create_test_canvas_host();
        let image_host = create_test_image_host();
        let data = scale9_data(&mut state);
        let mut guard = data.write().unwrap();
        let data = get_wgpu_scale9_shape_data(&mut *guard).unwrap();
        let mut surfaces: CanvasHostSurfaces = test_default();

        record
            .refuse
            .store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(
            acquire_wgpu_scale9_shape_raster_surface(
                &mut surfaces,
                &canvas_host,
                &image_host,
                data
            )
            .is_none()
        );
        assert!(data.surface.is_none());
        record
            .refuse
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let surface = acquire_wgpu_scale9_shape_raster_surface(
            &mut surfaces,
            &canvas_host,
            &image_host,
            data,
        )
        .unwrap();
        let again = acquire_wgpu_scale9_shape_raster_surface(
            &mut surfaces,
            &canvas_host,
            &image_host,
            data,
        )
        .unwrap();
        assert!(Arc::ptr_eq(&surface, &again));
        assert_eq!(record.created_count(), 1);
    }

    #[test]
    fn presents_different_textures_for_two_nodes_with_different_content_in_the_same_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let (canvas_host, _) = create_test_canvas_host();
        let image_host = create_test_image_host();
        let mut surfaces: CanvasHostSurfaces = test_default();
        let first = scale9_data(&mut state);
        let second = scale9_data(&mut state);
        let mut first_guard = first.write().unwrap();
        let mut second_guard = second.write().unwrap();
        let first_data = get_wgpu_scale9_shape_data(&mut *first_guard).unwrap();
        let second_data = get_wgpu_scale9_shape_data(&mut *second_guard).unwrap();
        acquire_wgpu_scale9_shape_raster_surface(
            &mut surfaces,
            &canvas_host,
            &image_host,
            first_data,
        );
        acquire_wgpu_scale9_shape_raster_surface(
            &mut surfaces,
            &canvas_host,
            &image_host,
            second_data,
        );

        let first_image = first_data.image.clone().unwrap();
        let second_image = second_data.image.clone().unwrap();
        let first_entry = bind_wgpu_image_resource_texture(
            &mut state,
            &first_image.read().unwrap(),
            Some(false),
            Some(true),
            None,
        )
        .unwrap();
        let second_entry = bind_wgpu_image_resource_texture(
            &mut state,
            &second_image.read().unwrap(),
            Some(false),
            Some(true),
            None,
        )
        .unwrap();

        assert!(!Arc::ptr_eq(
            first_data.surface.as_ref().unwrap(),
            second_data.surface.as_ref().unwrap()
        ));
        assert!(!Arc::ptr_eq(&first_image, &second_image));
        assert_ne!(
            first_entry.read().unwrap().texture,
            second_entry.read().unwrap().texture
        );
    }
}

mod create_wgpu_scale9_shape_data {
    use super::*;

    #[test]
    fn leaves_its_per_node_raster_surface_lazy() {
        let mut state = create_wgpu_render_state_for_test(None);
        let data = scale9_data(&mut state);
        let mut guard = data.write().unwrap();
        assert!(
            get_wgpu_scale9_shape_data(&mut *guard)
                .unwrap()
                .surface
                .is_none()
        );
    }
}

mod destroy_wgpu_scale9_shape_data {
    use super::*;

    #[test]
    fn removes_its_cached_texture_before_destroying_its_per_node_surface_idempotently() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let (rasterizer, _) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node = filled_scale9_node();
        let mut proxy = create_test_proxy_for(&mut state, &node);
        proxy.renderer_data = create_wgpu_scale9_shape_data(&mut state, &node);
        draw_wgpu_scale9_shape(&mut state, &proxy);
        let data = proxy.renderer_data.take().unwrap();
        let image_id = {
            let mut guard = data.write().unwrap();
            let image = get_wgpu_scale9_shape_data(&mut *guard)
                .unwrap()
                .image
                .clone()
                .unwrap();
            get_entity_id(&*image.read().unwrap())
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
        let destroyed_before = record.destroyed_count();

        destroy_wgpu_scale9_shape_data(&mut state, data.clone());
        destroy_wgpu_scale9_shape_data(&mut state, data);

        let native = get_wgpu_render_state_native_device(&state);
        assert!(is_test_texture_destroyed(
            &native,
            &entry.read().unwrap().texture
        ));
        assert!(
            !context
                .read()
                .unwrap()
                .texture_source_premultiplied_texture_cache
                .contains_key(&image_id)
        );
        // The host's ownership table forgets a surface once it is destroyed, so the second call
        // returns nothing to the provider.
        assert_eq!(record.destroyed_count(), destroyed_before + 1);
    }

    #[test]
    fn destroys_its_raster_surface_even_when_it_never_acquired_a_gpu_cache_entry() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts_with_unready_images(&mut state);
        let (rasterizer, _) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node = filled_scale9_node();
        let mut proxy = create_test_proxy_for(&mut state, &node);
        proxy.renderer_data = create_wgpu_scale9_shape_data(&mut state, &node);
        draw_wgpu_scale9_shape(&mut state, &proxy);
        let destroyed_before = record.destroyed_count();

        destroy_wgpu_scale9_shape_data(&mut state, proxy.renderer_data.take().unwrap());

        assert_eq!(record.destroyed_count(), destroyed_before + 1);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn is_a_no_op_when_its_lazy_surface_was_never_allocated() {
        let mut state = create_wgpu_render_state_for_test(None);
        let record = set_test_hosts(&mut state);
        let data = scale9_data(&mut state);
        destroy_wgpu_scale9_shape_data(&mut state, data);
        assert_eq!(record.destroyed_count(), 0);
    }
}

mod draw_wgpu_scale9_shape {
    use super::*;

    #[test]
    fn returns_early_when_commands_are_empty() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let node = scale9_node();
        let mut proxy = create_test_proxy_for(&mut state, &node);
        proxy.renderer_data = create_wgpu_scale9_shape_data(&mut state, &node);
        draw_wgpu_scale9_shape(&mut state, &proxy);
        assert_eq!(record.created_count(), 0);
        submit_wgpu_frame(&mut state);
    }

    #[test]
    fn rasterizes_and_draws_a_filled_shape() {
        let mut state = create_test_state_in_pass();
        let record = set_test_hosts(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node = filled_scale9_node();
        let mut proxy = create_test_proxy_for(&mut state, &node);
        proxy.renderer_data = create_wgpu_scale9_shape_data(&mut state, &node);
        let before = get_wgpu_render_state_runtime(&state).uniform_offset;

        draw_wgpu_scale9_shape(&mut state, &proxy);

        assert_eq!(calls.lock().unwrap().len(), 1);
        assert_eq!(record.last_size(), (100.0, 100.0));
        // The immediate quad wrote one uniform slot.
        assert!(get_wgpu_render_state_runtime(&state).uniform_offset > before);
        submit_wgpu_frame(&mut state);
    }
}

mod draw_wgpu_scale9_shape_mask {
    use super::*;

    #[test]
    fn delegates_to_the_scale9_draw_path() {
        let mut state = create_test_state_in_pass();
        set_test_hosts(&mut state);
        let (rasterizer, calls) = create_test_counting_rasterizer();
        register_wgpu_shape_rasterizer(&mut state, Some(rasterizer));
        let node = filled_scale9_node();
        let mut proxy = create_test_proxy_for(&mut state, &node);
        proxy.renderer_data = create_wgpu_scale9_shape_data(&mut state, &node);
        draw_wgpu_scale9_shape_mask(&mut state, &proxy);
        assert_eq!(calls.lock().unwrap().len(), 1);
        submit_wgpu_frame(&mut state);
    }
}

mod get_wgpu_scale9_shape_data {
    use super::*;

    #[test]
    fn recovers_the_per_node_scale9_renderer_data() {
        let mut state = create_wgpu_render_state_for_test(None);
        let data = scale9_data(&mut state);
        let mut guard = data.write().unwrap();
        let data = get_wgpu_scale9_shape_data(&mut *guard).unwrap();
        assert!(data.surface.is_none());
        assert_eq!(data.last_scale_x, -1.0);
    }
}

mod wgpu_scale9_shape_renderer {
    use super::*;

    #[test]
    fn wires_create_data_destroy_data_and_submit() {
        assert!(std::ptr::fn_addr_eq(
            WGPU_SCALE9_SHAPE_RENDERER.create_data,
            create_wgpu_scale9_shape_data as fn(_, _) -> _
        ));
        assert!(std::ptr::fn_addr_eq(
            WGPU_SCALE9_SHAPE_RENDERER.destroy_data.unwrap(),
            destroy_wgpu_scale9_shape_data as fn(_, _)
        ));
        assert!(std::ptr::fn_addr_eq(
            WGPU_SCALE9_SHAPE_RENDERER.submit,
            draw_wgpu_scale9_shape as fn(_, _)
        ));
    }
}
