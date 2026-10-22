use std::sync::{Arc, Mutex};

use flight_entity::{Ref, allocate_entity, get_entity_id};
use flight_node::{NodeRef, RendererDataRef};
use flight_render::{CanvasHostSurfaces, RenderProxy2D, get_or_create_render_proxy_2d};
use flight_render_gl::{GlRenderState, GlTextureCacheEntry, bind_gl_image_resource_texture};
use flight_scene2d_gl::*;
use flight_shape::contract::{
    Scale9Shape, ShapeScale9Grid, append_shape_begin_fill, append_shape_rectangle,
    create_scale9_shape,
};
use flight_surface::HostCanvasCapability;
use flight_texture::TextureColorSpace;

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, create_gl_state_with_hosts, create_test_image_host,
    make_canvas_surface, make_proxies,
};

fn grid() -> ShapeScale9Grid {
    return ShapeScale9Grid {
        height: 80.0,
        width: 80.0,
        x: 10.0,
        y: 10.0,
    };
}

fn scale9_node() -> NodeRef {
    let shape: Ref<Scale9Shape> = create_scale9_shape(&grid());
    return shape;
}

fn surfaces() -> CanvasHostSurfaces {
    return crate::gl_test_helper::test_default::<CanvasHostSurfaces>();
}

fn new_data(state: &mut GlRenderState) -> RendererDataRef {
    return create_gl_scale9_shape_data(state, &scale9_node()).unwrap();
}

fn acquire_from_state(state: &GlRenderState, data: &RendererDataRef) -> Ref<flight_surface::CanvasSurface> {
    let canvas_host = state.canvas_host.clone().unwrap();
    let image_host = state.image_host.clone().unwrap();
    let mut guard = data.write().unwrap();
    return acquire_gl_scale9_shape_raster_surface(
        &mut state.gl_runtime.borrow_mut().canvas_host_surfaces,
        &canvas_host,
        &image_host,
        get_gl_scale9_shape_data(&mut *guard).unwrap(),
    )
    .unwrap();
}

fn draw_proxy(state: &mut GlRenderState, node: &NodeRef) -> bool {
    let mut proxies = make_proxies();
    let proxy: &RenderProxy2D<GlRenderState> = get_or_create_render_proxy_2d(state, &mut proxies, node);
    let has_data = proxy.renderer_data.is_some();
    draw_gl_scale9_shape(state, proxy);
    return has_data;
}

mod acquire_gl_scale9_shape_raster_surface {
    use super::*;

    #[test]
    fn does_not_cache_provider_absence_and_retries_on_the_next_draw() {
        let surface = make_canvas_surface(1.0, 1.0);
        let returned = surface.clone();
        let attempts = Arc::new(Mutex::new(0));
        let counter = attempts.clone();
        let canvas_host = HostCanvasCapability {
            provider: Arc::new(()),
            acquire: Arc::new(|_, _| None),
            create: Arc::new(|_, _, _, _| None),
            create_surface: Arc::new(move |_, _| {
                let mut count = counter.lock().unwrap();
                *count += 1;
                if *count == 1 { None } else { Some(returned.clone()) }
            }),
            destroy_surface: Arc::new(|_| {}),
            release: Arc::new(|_| {}),
        };
        let image_host = create_test_image_host();
        let mut state = create_gl_state();
        let data = new_data(&mut state);
        let mut guard = data.write().unwrap();
        let data = get_gl_scale9_shape_data(&mut *guard).unwrap();
        let mut surfaces = surfaces();

        assert!(acquire_gl_scale9_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, data).is_none());
        assert!(data.surface.is_none());
        let first =
            acquire_gl_scale9_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, data).unwrap();
        assert!(Arc::ptr_eq(&first, &surface));
        let second =
            acquire_gl_scale9_shape_raster_surface(&mut surfaces, &canvas_host, &image_host, data).unwrap();
        assert!(Arc::ptr_eq(&second, &surface));
        assert_eq!(*attempts.lock().unwrap(), 2);
    }

    #[test]
    fn presents_different_textures_for_two_nodes_with_different_content_in_the_same_frame() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let first_data = new_data(&mut state);
        let second_data = new_data(&mut state);
        let first = acquire_from_state(&state, &first_data);
        let second = acquire_from_state(&state, &second_data);
        let image_of = |data: &RendererDataRef| {
            let mut guard = data.write().unwrap();
            get_gl_scale9_shape_data(&mut *guard).unwrap().image.clone().unwrap()
        };
        let first_image = image_of(&first_data);
        let second_image = image_of(&second_data);

        let first_texture = bind_gl_image_resource_texture(
            &state,
            &first_image.read().unwrap(),
            None,
            None,
            true,
            TextureColorSpace::Linear,
        )
        .unwrap();
        let second_texture = bind_gl_image_resource_texture(
            &state,
            &second_image.read().unwrap(),
            None,
            None,
            true,
            TextureColorSpace::Linear,
        )
        .unwrap();

        assert!(!Arc::ptr_eq(&first, &second));
        assert!(!Arc::ptr_eq(&first_image, &second_image));
        assert_ne!(first_texture, second_texture);
    }
}

mod create_gl_scale9_shape_data {
    use super::*;

    #[test]
    fn leaves_its_per_node_raster_surface_lazy() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let data = new_data(&mut state);
        let mut guard = data.write().unwrap();
        assert!(get_gl_scale9_shape_data(&mut *guard).unwrap().surface.is_none());
        assert_eq!(count_calls("gen_textures"), 0);
    }
}

mod destroy_gl_scale9_shape_data {
    use super::*;

    #[test]
    fn is_a_no_op_when_its_lazy_surface_was_never_allocated() {
        let (mut state, hosts) = create_gl_state_with_hosts();
        let data = new_data(&mut state);

        destroy_gl_scale9_shape_data(&mut state, data);

        assert_eq!(count_calls("delete_textures"), 0);
        assert_eq!(*hosts.destroyed.lock().unwrap(), 0);
    }

    #[test]
    fn removes_its_cached_texture_before_destroying_its_per_node_surface_idempotently() {
        let (mut state, hosts) = create_gl_state_with_hosts();
        let data = new_data(&mut state);
        acquire_from_state(&state, &data);
        let image = {
            let mut guard = data.write().unwrap();
            get_gl_scale9_shape_data(&mut *guard).unwrap().image.clone().unwrap()
        };
        let image_id = get_entity_id(&*image.read().unwrap());
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

        destroy_gl_scale9_shape_data(&mut state, data.clone());
        destroy_gl_scale9_shape_data(&mut state, data);

        let deletes = calls_with("delete_textures");
        assert_eq!(deletes.len(), 1);
        assert_eq!(deletes[0].integers, vec![i64::from(texture.0.get())]);
        assert!(
            !state
                .context_state
                .runtime_state
                .borrow()
                .texture_caches
                .by_texture_entity
                .contains_key(&(image_id, true, false))
        );
        assert_eq!(*hosts.destroyed.lock().unwrap(), 1);
    }

    #[test]
    fn destroys_its_raster_surface_even_when_it_never_acquired_a_gpu_cache_entry() {
        let (mut state, hosts) = create_gl_state_with_hosts();
        let data = new_data(&mut state);
        acquire_from_state(&state, &data);

        destroy_gl_scale9_shape_data(&mut state, data);

        assert_eq!(*hosts.destroyed.lock().unwrap(), 1);
    }
}

mod draw_gl_scale9_shape {
    use super::*;

    #[test]
    fn returns_early_when_commands_are_empty() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        draw_proxy(&mut state, &scale9_node());
        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn returns_early_when_renderer_data_is_null() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let shape = create_scale9_shape(&grid());
        append_shape_begin_fill(&shape, 0xff0000ff, None);
        append_shape_rectangle(&shape, 0.0, 0.0, 100.0, 100.0);
        let node: NodeRef = shape;

        assert!(!draw_proxy(&mut state, &node));

        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod draw_gl_scale9_shape_mask {
    use super::*;

    #[test]
    fn uses_the_same_draw_path_as_normal_scale9_rendering() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let node = scale9_node();
        let mut proxies = make_proxies();
        let proxy = get_or_create_render_proxy_2d(&mut state, &mut proxies, &node);
        draw_gl_scale9_shape_mask(&mut state, proxy);
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod get_gl_scale9_shape_data {
    use super::*;

    #[test]
    fn recovers_the_per_node_scale9_renderer_data() {
        let (mut state, _hosts) = create_gl_state_with_hosts();
        let data = new_data(&mut state);
        let mut guard = data.write().unwrap();
        assert!(get_gl_scale9_shape_data(&mut *guard).unwrap().surface.is_none());
    }
}

mod gl_scale9_shape_renderer {
    use super::*;

    #[test]
    fn wires_create_data_destroy_data_and_submit() {
        assert!(std::ptr::fn_addr_eq(
            GL_SCALE9_SHAPE_RENDERER.create_data,
            create_gl_scale9_shape_data
                as fn(&mut GlRenderState, &NodeRef) -> Option<RendererDataRef>
        ));
        assert!(std::ptr::fn_addr_eq(
            GL_SCALE9_SHAPE_RENDERER.destroy_data.unwrap(),
            destroy_gl_scale9_shape_data as fn(&mut GlRenderState, RendererDataRef)
        ));
        assert!(std::ptr::fn_addr_eq(
            GL_SCALE9_SHAPE_RENDERER.submit,
            draw_gl_scale9_shape as fn(&mut GlRenderState, &RenderProxy2D<GlRenderState>)
        ));
    }
}

mod initialize_gl_scale9_shape_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_gl_scale9_shape_data() {
        let state = create_gl_state();
        let mut out: GlScale9ShapeData = allocate_entity();
        initialize_gl_scale9_shape_data(&mut out, &state, &scale9_node());
        assert!(out.surface.is_none());
        assert_eq!(out.last_scale_x, -1.0);
        assert_eq!(out.last_content_id, -1);
    }
}
