use std::sync::{Arc, Mutex, RwLock};

use flight_render_wgpu::*;
use flight_texture::RenderTargetColorSpace;

use crate::support::*;

fn clear_for_test() -> RenderTargetClear {
    return RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: None,
    };
}

fn texture_target_for_test(
    state: &WgpuRenderState,
    width: f32,
    height: f32,
    sample_count: Option<u32>,
) -> WgpuRenderTarget {
    let target = create_wgpu_texture_render_target(
        state,
        width,
        height,
        Some(state.format),
        Some(RenderTargetColorSpace::Srgb),
        sample_count,
    );
    return WgpuRenderTarget::Texture(Arc::new(RwLock::new(target)));
}

// A real pass encoder does not expose the scissor it was given, but the device validates it: a
// rect outside the attachment fails the pass with an error naming the exact rect the encoder
// received. Each probe runs a whole pass (and its submit) inside one validation scope and returns
// that error's text, or `None` when the encoder accepted every rect.
fn run_pass_capturing_validation(
    state: &mut WgpuRenderState,
    target: &WgpuRenderTarget,
    body: impl FnOnce(&mut WgpuRenderState),
) -> Option<String> {
    let native = get_wgpu_render_state_native_device(state);
    let scope = native
        .device
        .push_error_scope(wgpu::ErrorFilter::Validation);
    let pass = begin_wgpu_render_pass(state, target, Some(&clear_for_test()));
    body(&mut *pass.state);
    end_wgpu_render_pass(pass);
    return block_on(scope.pop()).map(|error| error.to_string());
}

fn small_screen_for_test(state: &WgpuRenderState, antialias: bool) -> WgpuRenderTarget {
    return WgpuRenderTarget::Screen(create_wgpu_screen_render_target_for_test(
        state, None, antialias, 4, 4,
    ));
}

// The most recent scissor rect the open pass received, in attachment pixels.
fn last_scissor_rect(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> (u32, u32, u32, u32) {
    return records
        .lock()
        .unwrap()
        .iter()
        .rev()
        .find_map(|record| match record {
            WgpuCommandRecord::SetScissorRect(rect) => {
                Some((rect.x, rect.y, rect.width, rect.height))
            }
            _ => None,
        })
        .expect("a recorded scissor rect");
}

mod apply_wgpu_scissor_rect {
    use super::*;

    // TS spied on setScissorRect; here the 4x4 attachment rejects the rect, and the validation
    // error names the exact rect the live encoder received.
    #[test]
    fn calls_set_scissor_rect_on_the_pass_when_a_rect_is_active() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = small_screen_for_test(&state, false);

        let error = run_pass_capturing_validation(&mut state, &screen, |state| {
            get_wgpu_render_state_runtime_mut(state).current_scissor_rect = Some(WgpuScissorRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 50.0,
            });
            apply_wgpu_scissor_rect(state);
        })
        .expect("the out-of-bounds rect reached the encoder");

        assert!(
            error.contains("Scissor Rect { x: 10, y: 20, w: 100, h: 50 }"),
            "{error}"
        );
    }

    // TS counted zero setScissorRect calls; here no rect reaches the encoder, so the pass validates
    // cleanly even with an out-of-bounds rect waiting on the stack that a wrong apply might read.
    #[test]
    fn is_a_no_op_when_current_scissor_rect_is_null() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = small_screen_for_test(&state, false);

        let error = run_pass_capturing_validation(&mut state, &screen, |state| {
            let runtime = get_wgpu_render_state_runtime_mut(state);
            runtime.scissor_stack.push(WgpuScissorRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 50.0,
            });
            runtime.current_scissor_rect = None;
            apply_wgpu_scissor_rect(state);
            assert!(
                get_wgpu_render_state_runtime(state)
                    .current_scissor_rect
                    .is_none()
            );
        });

        assert_eq!(error, None);
    }

    // TS clamped {0,0,0,0} to [0,0,1,1]. A zero-size rect at the attachment's far corner is valid
    // unclamped, so the error proves the encoder received the 1x1 clamp.
    #[test]
    fn clamps_dimensions_to_at_least_1x1() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = small_screen_for_test(&state, false);

        let error = run_pass_capturing_validation(&mut state, &screen, |state| {
            get_wgpu_render_state_runtime_mut(state).current_scissor_rect = Some(WgpuScissorRect {
                x: 4.0,
                y: 4.0,
                width: 0.0,
                height: 0.0,
            });
            apply_wgpu_scissor_rect(state);
        })
        .expect("the clamped rect reached the encoder");

        assert!(
            error.contains("Scissor Rect { x: 4, y: 4, w: 1, h: 1 }"),
            "{error}"
        );
    }
}

mod pop_wgpu_scissor_rect {
    use super::*;

    #[test]
    fn is_a_no_op_when_the_stack_is_empty() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);

        pop_wgpu_scissor_rect(pass.state);

        assert!(
            get_wgpu_render_state_runtime(pass.state)
                .current_scissor_rect
                .is_none()
        );
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn restores_the_previous_rect_after_a_push_pop_pair() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let r1 = WgpuScissorRect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        let r2 = WgpuScissorRect {
            x: 10.0,
            y: 10.0,
            width: 50.0,
            height: 50.0,
        };
        push_wgpu_scissor_rect(pass.state, &r1);
        push_wgpu_scissor_rect(pass.state, &r2);

        pop_wgpu_scissor_rect(pass.state);
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state).current_scissor_rect,
            Some(r1)
        );
        pop_wgpu_scissor_rect(pass.state);
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state).current_scissor_rect,
            None
        );
        end_wgpu_render_pass(pass);
    }
}

mod push_wgpu_scissor_rect {
    use super::*;

    #[test]
    fn sets_current_scissor_rect_on_first_push() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let rect = WgpuScissorRect {
            x: 5.0,
            y: 10.0,
            width: 80.0,
            height: 40.0,
        };

        push_wgpu_scissor_rect(pass.state, &rect);

        assert_eq!(
            get_wgpu_render_state_runtime(pass.state).current_scissor_rect,
            Some(rect)
        );
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn stacks_previous_rect_when_pushing_a_second_rect() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let r1 = WgpuScissorRect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        let r2 = WgpuScissorRect {
            x: 20.0,
            y: 20.0,
            width: 60.0,
            height: 60.0,
        };

        push_wgpu_scissor_rect(pass.state, &r1);
        push_wgpu_scissor_rect(pass.state, &r2);

        let runtime = get_wgpu_render_state_runtime(pass.state);
        assert_eq!(runtime.current_scissor_rect, Some(r2));
        assert_eq!(runtime.scissor_stack, vec![r1]);
        end_wgpu_render_pass(pass);
    }

    #[test]
    fn copies_the_rect_so_mutation_of_the_original_does_not_affect_the_pushed_value() {
        let mut state = create_wgpu_render_state_for_test(None);
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let mut rect = WgpuScissorRect {
            x: 0.0,
            y: 0.0,
            width: 50.0,
            height: 50.0,
        };

        push_wgpu_scissor_rect(pass.state, &rect);
        rect.width = 999.0;

        assert_eq!(rect.width, 999.0);
        assert_eq!(
            get_wgpu_render_state_runtime(pass.state)
                .current_scissor_rect
                .map(|current| current.width),
            Some(50.0)
        );
        end_wgpu_render_pass(pass);
    }
}

mod set_wgpu_render_pass_scissor_rect {
    use super::*;

    #[test]
    fn scales_logical_coordinates_onto_a_supersampled_screen_surface() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let clear = RenderTargetClear {
            color: Some([0.0, 0.0, 0.0, 0.0]),
            colors: None,
            depth: None,
            stencil: None,
        };
        let pass = begin_wgpu_screen_render_pass_for_test(&mut state, Some(clear), None, true);
        set_wgpu_render_pass_scissor_rect(pass.state, 3, 5, 7, 11);
        end_wgpu_render_pass(pass);
        assert_eq!(last_scissor_rect(&records), (6, 10, 14, 22));
    }

    // Logical is one coordinate space, so a supersampled OFFSCREEN target scales its scissors by the
    // same factor its storage was grown by.
    #[test]
    fn scales_them_onto_a_supersampled_texture_target_by_the_same_rule() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let texture = texture_target_for_test(&state, 64.0, 64.0, Some(4));
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &texture, None);
        set_wgpu_render_pass_scissor_rect(pass.state, 3, 5, 7, 11);
        assert_eq!(last_scissor_rect(&records), (6, 10, 14, 22));
        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);
    }

    #[test]
    fn passes_them_through_unscaled_on_a_target_with_no_supersample() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&get_wgpu_render_state_native_device(&state));
        let texture = texture_target_for_test(&state, 64.0, 64.0, None);
        let outer = begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
        let pass = begin_wgpu_render_pass(outer.state, &texture, None);
        set_wgpu_render_pass_scissor_rect(pass.state, 3, 5, 7, 11);
        assert_eq!(last_scissor_rect(&records), (3, 5, 7, 11));
        end_wgpu_render_pass(pass);
        end_wgpu_render_pass(outer);
    }

    #[test]
    fn accepts_a_scaled_rect_that_exactly_fills_the_supersampled_storage() {
        let mut state = create_wgpu_render_state_for_test(None);
        let screen = small_screen_for_test(&state, true);

        let error = run_pass_capturing_validation(&mut state, &screen, |state| {
            set_wgpu_render_pass_scissor_rect(state, 0, 0, 4, 4);
        });

        assert_eq!(error, None);
    }
}
