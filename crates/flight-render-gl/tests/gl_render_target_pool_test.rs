mod acquire_gl_texture_render_target {
    use crate::gl_test_helper::{make_state, make_target_descriptor};
    use flight_render_gl::{
        acquire_gl_texture_render_target, create_gl_texture_render_target_pool,
        release_gl_texture_render_target,
    };
    #[test]
    fn reuses_exact_axis_matches() {
        let state = make_state();
        let descriptor = make_target_descriptor(8.0, 8.0);
        let mut pool = create_gl_texture_render_target_pool();
        let target = acquire_gl_texture_render_target(&state, &mut pool, &descriptor, None)
            .unwrap()
            .unwrap();
        let framebuffer = target.framebuffer;
        release_gl_texture_render_target(&mut pool, target);
        let reused = acquire_gl_texture_render_target(&state, &mut pool, &descriptor, None)
            .unwrap()
            .unwrap();
        assert_eq!(reused.framebuffer, framebuffer);
    }
}
mod create_gl_texture_render_target_pool {
    use flight_render_gl::create_gl_texture_render_target_pool;
    #[test]
    fn creates_an_empty_pool() {
        assert!(create_gl_texture_render_target_pool().free.is_empty());
    }
}
mod destroy_gl_texture_render_target_pool {
    use crate::gl_test_helper::{make_state, make_texture_target};
    use flight_render_gl::{
        create_gl_texture_render_target_pool, destroy_gl_texture_render_target_pool,
        release_gl_texture_render_target,
    };
    #[test]
    fn destroys_every_free_target() {
        let state = make_state();
        let mut pool = create_gl_texture_render_target_pool();
        release_gl_texture_render_target(&mut pool, make_texture_target(&state, 2.0, 2.0));
        destroy_gl_texture_render_target_pool(&mut pool);
        assert!(pool.free.is_empty());
    }
}
mod initialize_gl_texture_render_target_pool {
    use crate::gl_test_helper::{make_state, make_texture_target};
    use flight_render_gl::{
        create_gl_texture_render_target_pool, initialize_gl_texture_render_target_pool,
    };
    #[test]
    fn clears_existing_free_targets() {
        let state = make_state();
        let mut pool = create_gl_texture_render_target_pool();
        pool.free.push(make_texture_target(&state, 2.0, 2.0));
        initialize_gl_texture_render_target_pool(&mut pool);
        assert!(pool.free.is_empty());
    }
}
mod release_gl_texture_render_target {
    use crate::gl_test_helper::{make_state, make_texture_target};
    use flight_render_gl::{
        create_gl_texture_render_target_pool, release_gl_texture_render_target,
    };
    #[test]
    fn appends_the_target_to_the_free_list() {
        let state = make_state();
        let mut pool = create_gl_texture_render_target_pool();
        release_gl_texture_render_target(&mut pool, make_texture_target(&state, 1.0, 1.0));
        assert_eq!(pool.free.len(), 1);
    }
}
