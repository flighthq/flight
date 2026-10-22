use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, RwLock};

use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    return payload
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .unwrap_or_else(String::new);
}

fn texture_target_for_test(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    color_space: Option<RenderTargetColorSpace>,
    sample_count: Option<u32>,
) -> WgpuRenderTarget {
    let target = create_wgpu_texture_render_target(
        state,
        width,
        height,
        Some(state.format),
        color_space,
        sample_count,
    );
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(target)));
}

fn same_target(a: &WgpuRenderTarget, b: &WgpuRenderTarget) -> bool {
    return match (a, b) {
        (WgpuRenderTarget::Screen(a), WgpuRenderTarget::Screen(b)) => Arc::ptr_eq(a, b),
        (WgpuRenderTarget::Texture(a), WgpuRenderTarget::Texture(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
}

fn active_target(state: &WgpuRenderState) -> WgpuRenderTarget {
    return get_wgpu_active_render_pass(state)
        .expect("a pass is open")
        .target
        .clone();
}

mod begin_wgpu_render_pass {
    use super::*;

    #[test]
    fn reports_the_target_extent_as_the_pass_viewport() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_target_for_test(&state, 64.0, 64.0, None, None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &texture, None);

        assert_eq!(
            get_wgpu_active_render_pass(pass.state)
                .unwrap()
                .viewport
                .width,
            64.0
        );
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state)
                .render_target_viewport
                .map(|viewport| viewport.width),
            Some(64.0)
        );

        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);
    }

    // The viewport is LOGICAL, not the storage extent. A supersampled target is allocated at 2x per
    // axis, and a projection that divided by that physical width would fill a quarter of the target.
    #[test]
    fn reports_the_logical_extent_for_a_supersampled_target_not_its_physical_storage() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = texture_target_for_test(
            &state,
            400.0,
            300.0,
            Some(RenderTargetColorSpace::Srgb),
            Some(4),
        );
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &target, None);

        let WgpuRenderTarget::Texture(texture) = &target else {
            unreachable!();
        };
        assert_eq!(texture.read().unwrap().width, 800);
        assert_eq!(
            get_wgpu_active_render_pass(pass.state).unwrap().viewport,
            WgpuRenderPassViewport {
                height: 300.0,
                width: 400.0,
            }
        );

        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);
    }

    // TS spied on beginRenderPass for loadOp 'clear' and the clear value. The noop device neither
    // exposes a recorded pass descriptor nor executes clears, so this asserts the observable part:
    // the cleared pass opens recording into the texture and the whole frame validates.
    #[test]
    fn passes_float_rgba_clear_values_through_to_the_gpu_color_attachment() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = texture_target_for_test(
            &state,
            32.0,
            32.0,
            Some(RenderTargetColorSpace::Linear),
            None,
        );
        let clear = RenderTargetClear {
            color: Some([0.25, 0.5, 0.75, 1.0]),
            colors: None,
            depth: None,
            stencil: None,
        };
        let native = get_wgpu_render_state_native_device(&state);
        let scope = native
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);

        let records = record_test_commands(&native);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &target, Some(&clear));
        let begin = last_render_pass_begin(&records);
        assert_eq!(
            begin.color,
            WgpuColorLoadRecord::Clear(WgpuClearColorRecord {
                a: 1.0,
                b: 0.75,
                g: 0.5,
                r: 0.25,
            })
        );
        assert!(same_target(&active_target(pass.state), &target));
        assert!(get_wgpu_active_render_pass(pass.state).unwrap().has_encoder);
        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .render_pass
                .is_some()
        );
        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);

        assert_eq!(block_on(scope.pop()).map(|error| error.to_string()), None);
    }

    // TS spied on beginRenderPass for loadOp 'load'; as above, the observable part is that a pass with
    // no clear opens recording into its target and validates.
    #[test]
    fn preserves_the_target_when_no_clear_is_given() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = texture_target_for_test(&state, 32.0, 32.0, None, None);
        let native = get_wgpu_render_state_native_device(&state);
        let scope = native
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);

        let records = record_test_commands(&native);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &target, None);
        assert_eq!(
            last_render_pass_begin(&records).color,
            WgpuColorLoadRecord::Load
        );
        assert!(same_target(&active_target(pass.state), &target));
        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .render_pass
                .is_some()
        );
        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);

        assert_eq!(block_on(scope.pop()).map(|error| error.to_string()), None);
    }

    #[test]
    fn opens_the_frame_when_none_is_open_and_leaves_an_explicitly_opened_frame_to_its_owner() {
        let mut state = create_wgpu_render_state_for_test(None);
        let owning = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        assert!(
            get_wgpu_active_render_pass(owning.state)
                .unwrap()
                .owns_frame
        );
        end_wgpu_render_pass(owning);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .command_encoder
                .is_none()
        );

        begin_wgpu_frame(&mut state);
        let borrowed = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        assert!(
            !get_wgpu_active_render_pass(borrowed.state)
                .unwrap()
                .owns_frame
        );
        end_wgpu_render_pass(borrowed);
        // The frame outlives the pass, which is what lets a shadow pass and a screen pass share one
        // submit.
        assert!(
            get_wgpu_render_state_runtime(&state)
                .command_encoder
                .is_some()
        );
        submit_wgpu_frame(&mut state);
    }
}

mod end_wgpu_render_pass {
    use super::*;

    #[test]
    fn restores_the_enclosing_target_viewport_and_clip_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = WgpuRenderTarget::Screen(create_wgpu_screen_render_target_for_test(
            &state, None, false, 800, 600,
        ));
        let texture = texture_target_for_test(&state, 32.0, 32.0, None, None);
        let clip = WgpuScissorRect {
            height: 10.0,
            width: 10.0,
            x: 0.0,
            y: 0.0,
        };
        let clear = RenderTargetClear {
            color: Some([0.0, 0.0, 0.0, 0.0]),
            colors: None,
            depth: None,
            stencil: None,
        };
        let outer = begin_wgpu_render_pass(&mut state, &screen, Some(&clear));
        get_wgpu_render_state_runtime_mut(outer.state).current_scissor_rect = Some(clip);

        let inner = begin_wgpu_render_pass(outer.state, &texture, None);
        assert!(
            get_wgpu_render_state_runtime(inner.state)
                .current_scissor_rect
                .is_none()
        );
        end_wgpu_render_pass(inner);

        let runtime = get_wgpu_render_state_runtime(outer.state);
        assert!(same_target(
            runtime.current_render_target.as_ref().unwrap(),
            &screen
        ));
        assert_eq!(
            runtime.render_target_viewport,
            Some(WgpuRenderPassViewport {
                height: 600.0,
                width: 800.0,
            })
        );
        assert_eq!(runtime.current_scissor_rect, Some(clip));

        end_wgpu_render_pass(outer);
        let runtime = get_wgpu_render_state_runtime(&state);
        assert!(runtime.current_render_target.is_none());
        assert!(runtime.render_target_viewport.is_none());
    }

    // A WebGPU pass encoder cannot be reopened, so the enclosing pass is re-recorded. TS also spied
    // on the encoder identity and its loadOp 'load'; neither is observable on a native pass, so this
    // asserts the record's encoder flag and the state's live encoder across the inner bracket.
    #[test]
    fn resumes_the_enclosing_pass_with_a_fresh_encoder_that_preserves_its_pixels() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_target_for_test(&state, 32.0, 32.0, None, None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        assert!(get_wgpu_render_state_runtime(outer.state).pass_stack[0].has_encoder);

        let records = record_test_commands(&get_wgpu_render_state_native_device(outer.state));
        let inner = begin_wgpu_render_pass(outer.state, &texture, None);
        assert!(!get_wgpu_render_state_runtime(inner.state).pass_stack[0].has_encoder);
        end_wgpu_render_pass(inner);

        // The resumed outer pass is re-recorded over its own view with load, never clear.
        let resumed = last_render_pass_begin(&records);
        assert_eq!(resumed.color, WgpuColorLoadRecord::Load);
        assert_eq!(
            resumed.color_view,
            get_wgpu_render_state_runtime(outer.state).pass_stack[0].color_view
        );
        let runtime = get_wgpu_render_state_runtime(outer.state);
        assert_eq!(runtime.pass_stack.len(), 1);
        assert!(runtime.pass_stack[0].has_encoder);
        assert!(runtime.render_pass.is_some());

        end_wgpu_render_pass(outer);
    }

    #[test]
    fn submits_the_frame_it_opened_and_only_that_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_target_for_test(&state, 16.0, 16.0, None, None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let inner = begin_wgpu_render_pass(outer.state, &texture, None);

        end_wgpu_render_pass(inner);
        assert!(
            get_wgpu_render_state_runtime(outer.state)
                .command_encoder
                .is_some()
        );

        end_wgpu_render_pass(outer);
        assert!(
            get_wgpu_render_state_runtime(&state)
                .command_encoder
                .is_none()
        );
    }

    // The borrow makes ending an enclosing pass while an inner one is open unwritable; the runtime
    // guard is reached by a pass stack the borrow did not keep in order, here an extra record pushed
    // above the handle's own.
    #[test]
    fn refuses_a_pass_that_is_not_the_innermost_open_one() {
        let mut state = create_wgpu_render_state_for_test(None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let record = get_wgpu_render_state_runtime(outer.state).pass_stack[0].clone();
        get_wgpu_render_state_runtime_mut(outer.state)
            .pass_stack
            .push(record);

        let result = catch_unwind(AssertUnwindSafe(|| end_wgpu_render_pass(outer)));

        assert!(panic_message(result.unwrap_err()).contains("innermost open pass"));
        assert_eq!(get_wgpu_render_state_runtime(&state).pass_stack.len(), 2);
    }
}

mod get_wgpu_active_render_pass {
    use super::*;

    #[test]
    fn names_the_innermost_open_pass_and_nothing_outside_a_bracket() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_target_for_test(&state, 16.0, 16.0, None, None);
        assert!(get_wgpu_active_render_pass(&state).is_none());

        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let screen = active_target(outer.state);
        assert!(matches!(screen, WgpuRenderTarget::Screen(_)));
        let inner = begin_wgpu_render_pass(outer.state, &texture, None);
        assert!(same_target(&active_target(inner.state), &texture));

        end_wgpu_render_pass(inner);
        assert!(same_target(&active_target(outer.state), &screen));
        end_wgpu_render_pass(outer);
        assert!(get_wgpu_active_render_pass(&state).is_none());
    }
}

mod get_wgpu_render_pass_viewport {
    use super::*;

    // A draw with no target bound is API misuse; a default extent would hide it until the picture
    // came out the wrong size.
    #[test]
    fn throws_outside_a_pass_rather_than_inventing_a_canvas_sized_default() {
        let state = create_wgpu_render_state_for_test(None);

        let result = catch_unwind(AssertUnwindSafe(|| get_wgpu_render_pass_viewport(&state)));

        assert!(panic_message(result.unwrap_err()).contains("beginWgpuRenderPass"));
    }

    #[test]
    fn reports_the_innermost_pass_extent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = texture_target_for_test(&state, 40.0, 20.0, None, None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        assert_eq!(
            get_wgpu_render_pass_viewport(outer.state),
            WgpuRenderPassViewport {
                height: 600.0,
                width: 800.0,
            }
        );

        let inner = begin_wgpu_render_pass(outer.state, &texture, None);
        assert_eq!(
            get_wgpu_render_pass_viewport(inner.state),
            WgpuRenderPassViewport {
                height: 20.0,
                width: 40.0,
            }
        );

        end_wgpu_render_pass(inner);
        end_wgpu_render_pass(outer);
    }
}

mod resume_wgpu_render_pass {
    use super::*;

    #[test]
    fn reopens_a_suspended_pass_over_the_same_target() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let target = active_target(pass.state);
        suspend_wgpu_render_pass(&mut pass);

        resume_wgpu_render_pass(&mut pass);

        assert!(get_wgpu_active_render_pass(pass.state).unwrap().has_encoder);
        assert!(same_target(&active_target(pass.state), &target));
        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .render_pass
                .is_some()
        );
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn records_the_resumed_pass_without_a_validation_error() {
        let mut state = create_wgpu_render_state_for_test(None);
        let native = get_wgpu_render_state_native_device(&state);
        let scope = native
            .device
            .push_error_scope(wgpu::ErrorFilter::Validation);

        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        suspend_wgpu_render_pass(&mut pass);
        resume_wgpu_render_pass(&mut pass);
        end_wgpu_render_pass(pass);

        assert_eq!(block_on(scope.pop()).map(|error| error.to_string()), None);
    }
}

mod suspend_wgpu_render_pass {
    use super::*;

    // The effect pipeline records its own fullscreen passes into the frame, which it can only do
    // while no other pass encoder is recording.
    #[test]
    fn closes_the_encoder_while_leaving_the_pass_open() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);

        suspend_wgpu_render_pass(&mut pass);

        assert!(!get_wgpu_active_render_pass(pass.state).unwrap().has_encoder);
        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .render_pass
                .is_none()
        );
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state).pass_stack.len(),
            1
        );

        resume_wgpu_render_pass(&mut pass);
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn is_a_no_op_on_an_already_suspended_pass() {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);

        suspend_wgpu_render_pass(&mut pass);
        suspend_wgpu_render_pass(&mut pass);

        assert!(!get_wgpu_active_render_pass(pass.state).unwrap().has_encoder);
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state).pass_stack.len(),
            1
        );
        resume_wgpu_render_pass(&mut pass);
        end_wgpu_render_pass(pass);
    }
}
