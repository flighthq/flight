use std::sync::Arc;

use flight_entity::{allocate_entity, get_entity_id};
use flight_node::RendererDataRef;
use flight_render::CanvasHostSurfaces;
use flight_render_gl::GlTextureCacheEntry;
use flight_scene2d_gl::*;

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, create_test_canvas_host,
    create_test_canvas_host_with, create_test_image_host,
};

fn empty_data() -> GlShapeRendererData {
    let state = create_gl_state();
    let mut out: GlShapeRendererData = allocate_entity();
    initialize_gl_shape_data(&mut out, &state, &crate::gl_test_helper::display_node());
    return out;
}

fn surfaces() -> CanvasHostSurfaces {
    return CanvasHostSurfaces {
        hosts: std::collections::HashMap::new(),
    };
}

mod acquire_gl_shape_raster_surface {
    use super::*;

    #[test]
    fn allocates_once_and_returns_the_same_surface_thereafter() {
        let canvas_host = create_test_canvas_host();
        let image_host = create_test_image_host();
        let mut surfaces = surfaces();
        let mut data = empty_data();
        let first = acquire_gl_shape_raster_surface(
            &mut surfaces,
            &canvas_host.host,
            &image_host,
            &mut data,
        )
        .unwrap();
        assert!(Arc::ptr_eq(data.surface.as_ref().unwrap(), &first));
        let second = acquire_gl_shape_raster_surface(
            &mut surfaces,
            &canvas_host.host,
            &image_host,
            &mut data,
        )
        .unwrap();
        assert!(Arc::ptr_eq(&second, &first));
        assert_eq!(canvas_host.created.lock().unwrap().len(), 1);
    }

    #[test]
    fn wraps_the_canvas_as_an_image_so_the_quad_batch_treats_it_like_any_other_texture_source() {
        let canvas_host = create_test_canvas_host();
        let mut data = empty_data();
        acquire_gl_shape_raster_surface(
            &mut surfaces(),
            &canvas_host.host,
            &create_test_image_host(),
            &mut data,
        )
        .unwrap();
        assert!(data.image.is_some());
    }

    #[test]
    fn preserves_expected_absence_without_caching_it_when_the_provider_refuses() {
        let canvas_host = create_test_canvas_host_with(false);
        let mut data = empty_data();
        assert!(
            acquire_gl_shape_raster_surface(
                &mut surfaces(),
                &canvas_host.host,
                &create_test_image_host(),
                &mut data
            )
            .is_none()
        );
        assert!(data.surface.is_none());
    }
}

mod create_gl_shape_data {
    use super::*;

    #[test]
    fn starts_with_neither_cache_populated_so_a_shape_allocates_nothing_until_a_strategy_needs_it()
    {
        let mut state = create_gl_state();
        let data =
            create_gl_shape_data(&mut state, &crate::gl_test_helper::display_node()).unwrap();
        let mut guard = data.write().unwrap();
        let data = get_gl_shape_data(&mut *guard).unwrap();
        assert!(data.surface.is_none());
        assert!(data.meshes.is_none());
        assert_eq!(data.mesh_version, -1);
    }
}

mod destroy_gl_shape_data {
    use super::*;

    #[test]
    fn does_nothing_when_the_shape_only_ever_tessellated_since_there_is_no_surface_to_free() {
        let mut state = create_gl_state();
        destroy_gl_shape_data(&mut state, to_gl_shape_renderer_data(empty_data()));
        assert_eq!(count_calls("delete_textures"), 0);
    }

    #[test]
    fn frees_the_cached_gpu_texture_before_destroying_the_raster_surface() {
        let mut state = create_gl_state();
        let canvas_host = create_test_canvas_host();
        let mut data = empty_data();
        acquire_gl_shape_raster_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            &canvas_host.host,
            &create_test_image_host(),
            &mut data,
        )
        .unwrap();
        let image_id = get_entity_id(&*data.image.as_ref().unwrap().read().unwrap());
        let texture = flight_render_gl::create_gl_texture(&state).unwrap();
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .texture_caches
            .by_texture_entity
            .insert(
                (image_id, true, false),
                GlTextureCacheEntry {
                    texture,
                    version: 0,
                    straight_alpha: false,
                },
            );

        destroy_gl_shape_data(&mut state, to_gl_shape_renderer_data(data));

        assert_eq!(
            calls_with("delete_textures")[0].integers,
            vec![i64::from(texture.0.get())]
        );
        assert!(
            !state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .by_texture_entity
                .contains_key(&(image_id, true, false))
        );
        assert_eq!(*canvas_host.destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn destroys_a_raster_surface_even_when_it_never_acquired_a_gpu_cache_entry() {
        let mut state = create_gl_state();
        let canvas_host = create_test_canvas_host();
        let mut data = empty_data();
        acquire_gl_shape_raster_surface(
            &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
            &canvas_host.host,
            &create_test_image_host(),
            &mut data,
        )
        .unwrap();

        destroy_gl_shape_data(&mut state, to_gl_shape_renderer_data(data));

        assert_eq!(*canvas_host.destroyed.lock().unwrap(), 1);
    }
}

mod get_gl_shape_data {
    use super::*;

    #[test]
    fn round_trips_through_the_opaque_renderer_data_slot() {
        let mut data = empty_data();
        data.mesh_version = 7;
        let erased: RendererDataRef = to_gl_shape_renderer_data(data);
        let mut guard = erased.write().unwrap();
        assert_eq!(get_gl_shape_data(&mut *guard).unwrap().mesh_version, 7);
    }
}

mod initialize_gl_shape_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gl_shape_data() {
        let data = empty_data();
        assert!(data.image.is_none());
        assert_eq!(data.last_content_id, -1);
        assert_eq!(data.mesh_version, -1);
    }
}

mod to_gl_shape_renderer_data {
    use super::*;

    #[test]
    fn is_the_inverse_of_get_gl_shape_data() {
        let mut data = empty_data();
        data.last_w = 12.0;
        let erased = to_gl_shape_renderer_data(data);
        let mut guard = erased.write().unwrap();
        assert_eq!(get_gl_shape_data(&mut *guard).unwrap().last_w, 12.0);
    }
}
