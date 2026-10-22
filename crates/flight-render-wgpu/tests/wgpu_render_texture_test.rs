use flight_render::RenderTargetClear;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_render::{CreateRenderTextureOptions, RenderTexture, create_render_texture};
use flight_render_wgpu::*;
use flight_texture::TextureColorSpace;

use crate::support::*;

// The source's fixture: a linear 8x8 render texture.
fn texture() -> RenderTexture {
    return create_render_texture(&CreateRenderTextureOptions {
        color_space: Some(TextureColorSpace::Linear),
        height: 8,
        width: 8,
        ..test_default()
    });
}

fn transparent_clear() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
}

fn cached_target(
    state: &WgpuRenderState,
    render_texture: &RenderTexture,
) -> Arc<std::sync::RwLock<WgpuTextureRenderTarget>> {
    let id = flight_entity::get_entity_id(flight_texture::TextureUvTransform::texture_fields(
        render_texture,
    ));
    return get_wgpu_render_state_runtime(state)
        .context
        .read()
        .unwrap()
        .wgpu_render_texture_cache
        .as_ref()
        .and_then(|cache| cache.get(&id).map(|entry| entry.target.clone()))
        .expect("the render texture has a cached hidden target");
}

mod bind_wgpu_render_texture {
    use super::*;

    #[test]
    fn returns_null_before_render_and_the_state_owned_target_after_render() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        assert!(bind_wgpu_render_texture(&mut state, &render_texture).is_none());

        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        render_into_wgpu_render_texture(state, &mut render_texture, |_| {}, &transparent_clear());
        let bound = bind_wgpu_render_texture(state, &render_texture).expect("a bound entry");
        let target = cached_target(state, &render_texture);
        assert_eq!(
            bound.read().unwrap().texture,
            target.read().unwrap().texture
        );
        submit_wgpu_frame(state);
    }
}

mod destroy_wgpu_render_texture {
    use super::*;

    // The source spies on `texture.destroy`; a destroyed noop texture is observed by its view
    // creation failing validation. The source destroys before submitting the frame that rendered
    // into the target; real wgpu rejects that submit (the texture is destroyed), so the frame is
    // submitted first here.
    #[test]
    fn destroys_and_removes_the_hidden_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        render_into_wgpu_render_texture(state, &mut render_texture, |_| {}, &transparent_clear());
        let target = cached_target(state, &render_texture);
        let native = get_wgpu_render_state_native_device(state);
        assert!(!is_wgpu_texture_destroyed(
            &native,
            &target.read().unwrap().texture
        ));

        submit_wgpu_frame(state);

        destroy_wgpu_render_texture(state, &render_texture);
        assert!(is_wgpu_texture_destroyed(
            &native,
            &target.read().unwrap().texture
        ));
        assert!(bind_wgpu_render_texture(state, &render_texture).is_none());
    }
}

mod explain_wgpu_render_texture {
    use super::*;

    #[test]
    fn reports_source_dimensions_and_lifecycle_status_before_allocation() {
        let state = create_wgpu_render_state_for_test(None);
        assert_eq!(
            explain_wgpu_render_texture(&state, &texture()),
            WgpuRenderTextureExplanation {
                height: 8,
                status: WgpuRenderTextureStatus::Unrendered,
                width: 8,
            }
        );
    }
}

mod get_wgpu_render_texture_target {
    use super::*;

    #[test]
    fn returns_the_hidden_target_only_after_a_completed_write() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();

        assert!(get_wgpu_render_texture_target(&mut state, &render_texture).is_none());
        write_wgpu_render_texture_target(&mut state, &mut render_texture, |_, _| {});
        assert!(get_wgpu_render_texture_target(&mut state, &render_texture).is_some());
    }
}

mod invalidate_wgpu_render_texture {
    use super::*;

    // The source spies on `texture.destroy`; a live noop texture is observed by its view creation
    // passing validation.
    #[test]
    fn makes_published_content_unavailable_without_destroying_its_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        write_wgpu_render_texture_target(&mut state, &mut render_texture, |_, _| {});
        let target = get_wgpu_render_texture_target(&mut state, &render_texture).unwrap();

        invalidate_wgpu_render_texture(&state, &render_texture, None);

        assert!(get_wgpu_render_texture_target(&mut state, &render_texture).is_none());
        let native = get_wgpu_render_state_native_device(&state);
        assert!(!is_wgpu_texture_destroyed(
            &native,
            &target.read().unwrap().texture
        ));
    }
}

mod is_wgpu_render_texture_ready {
    use super::*;

    #[test]
    fn tracks_the_successful_rendered_content_transition() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        assert!(!is_wgpu_render_texture_ready(&mut state, &render_texture));
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        render_into_wgpu_render_texture(state, &mut render_texture, |_| {}, &transparent_clear());
        assert!(is_wgpu_render_texture_ready(state, &render_texture));
        submit_wgpu_frame(state);
    }
}

mod render_into_wgpu_render_texture {
    use super::*;

    // The source compares pass-encoder identity; Rust's encoder is not comparable, so the restored
    // enclosing pass is observed through the pass stack: one screen pass left, re-recorded.
    #[test]
    fn restores_the_enclosing_pass_and_bumps_version_after_success() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let state = pass.state;
        assert!(get_wgpu_render_state_runtime(state).render_pass.is_some());

        let mut inner_target = None;
        render_into_wgpu_render_texture(
            state,
            &mut render_texture,
            |inner| {
                inner_target = get_wgpu_render_state_runtime(inner.state)
                    .current_render_target
                    .clone();
            },
            &transparent_clear(),
        );

        assert_eq!(render_texture.version, 1);
        assert_eq!(render_texture.color_space, TextureColorSpace::Linear);
        assert!(matches!(inner_target, Some(WgpuRenderTarget::Texture(_))));
        let runtime = get_wgpu_render_state_runtime(state);
        assert!(runtime.render_pass.is_some());
        assert_eq!(runtime.pass_stack.len(), 1);
        assert!(runtime.pass_stack[0].has_encoder);
        assert!(matches!(
            runtime.current_render_target,
            Some(WgpuRenderTarget::Screen(_))
        ));
        submit_wgpu_frame(state);
    }
}

mod set_wgpu_render_texture_guard {
    use super::*;

    #[test]
    fn installs_and_removes_the_lifecycle_diagnostic_callback() {
        let mut state = create_wgpu_render_state_for_test(None);
        let render_texture = texture();
        let calls = Arc::new(AtomicU32::new(0));
        let counter = calls.clone();
        let guard: WgpuRenderTextureGuard = Arc::new(move |_, _, _| {
            counter.fetch_add(1, Ordering::SeqCst);
        });

        set_wgpu_render_texture_guard(&mut state, Some(guard));
        bind_wgpu_render_texture(&mut state, &render_texture);
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        set_wgpu_render_texture_guard(&mut state, None);
        bind_wgpu_render_texture(&mut state, &render_texture);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}

mod write_wgpu_render_texture_target {
    use super::*;

    #[test]
    fn passes_the_hidden_target_to_the_producer_and_publishes_the_completed_write() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = texture();
        let mut produced = Vec::new();

        write_wgpu_render_texture_target(&mut state, &mut render_texture, |_, target| {
            produced.push(target.clone());
        });

        assert_eq!(produced.len(), 1);
        let published = get_wgpu_render_texture_target(&mut state, &render_texture).unwrap();
        assert!(Arc::ptr_eq(&produced[0], &published));
        assert_eq!(render_texture.version, 1);
        assert!(is_wgpu_render_texture_ready(&mut state, &render_texture));
    }

    #[test]
    fn realizes_a_four_sample_render_texture_at_twice_its_logical_extent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut render_texture = create_render_texture(&CreateRenderTextureOptions {
            color_space: Some(TextureColorSpace::Linear),
            height: 8,
            sample_count: Some(4.0),
            width: 8,
            ..test_default()
        });

        write_wgpu_render_texture_target(&mut state, &mut render_texture, |_, _| {});

        let target = get_wgpu_render_texture_target(&mut state, &render_texture).unwrap();
        let target = target.read().unwrap();
        assert_eq!(target.width, 16);
        assert_eq!(target.height, 16);
        assert_eq!(target.sample_count, 4);
    }
}
