use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_render_gl::{
    GlBlendSignature, GlBoundShader, GlRenderState, GlRenderTargetSnapshot, GlScissorRect,
    GlTextureRealization, GlViewportRect, pop_gl_render_state, push_gl_render_state,
    with_gl_render_state,
};
use glow::HasContext;

use crate::gl_test_helper::{clear_calls, make_state, snapshot};

static FLUSH_COUNT: AtomicUsize = AtomicUsize::new(0);

fn record_flush(_state: &mut GlRenderState) {
    FLUSH_COUNT.fetch_add(1, Ordering::SeqCst);
}

mod pop_gl_render_state {
    use super::*;

    #[test]
    fn is_a_no_op_when_there_is_no_matching_push() {
        let state = make_state();
        clear_calls();

        pop_gl_render_state(&state);

        assert!(snapshot().call_details.is_empty());
    }

    #[test]
    fn restores_every_guarded_fixed_function_binding_and_runtime_field() {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: the deterministic ABI mock owns every generated name and state transition.
        let (framebuffer, program, texture, vertex_array) = unsafe {
            let framebuffer = gl.create_framebuffer().unwrap();
            let program = gl.create_program().unwrap();
            let texture = gl.create_texture().unwrap();
            let vertex_array = gl.create_vertex_array().unwrap();
            gl.enable(glow::DEPTH_TEST);
            gl.depth_mask(false);
            gl.depth_func(glow::LEQUAL);
            gl.disable(glow::CULL_FACE);
            gl.cull_face(glow::BACK);
            gl.front_face(glow::CW);
            gl.enable(glow::STENCIL_TEST);
            gl.stencil_mask(0x0f);
            gl.enable(glow::BLEND);
            gl.blend_func_separate(
                glow::ONE,
                glow::ONE_MINUS_SRC_ALPHA,
                glow::ONE,
                glow::ONE_MINUS_SRC_ALPHA,
            );
            gl.blend_equation_separate(glow::FUNC_ADD, glow::FUNC_ADD);
            gl.color_mask(true, false, true, false);
            gl.clear_color(0.25, 0.5, 0.75, 1.0);
            gl.bind_vertex_array(Some(vertex_array));
            gl.use_program(Some(program));
            gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            gl.enable(glow::SCISSOR_TEST);
            gl.scissor(2, 3, 40, 50);
            gl.viewport(4, 5, 320, 240);
            (framebuffer, program, texture, vertex_array)
        };
        let target = GlRenderTargetSnapshot {
            color_attachments: 1,
            color_textures: Vec::new(),
            framebuffer: Some(framebuffer),
            height: 220,
            id: 91,
            resolve_framebuffer: None,
            sample_count: 1,
            width: 300,
        };
        let scissor = GlScissorRect {
            x: 2,
            y: 3,
            width: 40,
            height: 50,
        };
        let viewport = GlViewportRect {
            x: 4,
            y: 5,
            width: 300,
            height: 220,
        };
        let blend = GlBlendSignature {
            dst: glow::ONE_MINUS_SRC_ALPHA,
            equation: glow::FUNC_ADD,
            src: glow::ONE,
        };
        {
            let mut runtime = state.gl_runtime.borrow_mut();
            runtime.current_framebuffer = Some(framebuffer);
            runtime.current_scissor_rect = Some(scissor);
            runtime.current_target = Some(target.clone());
            runtime.render_target_viewport = Some(viewport);
        }
        {
            let mut context = state.context_state.runtime_state.borrow_mut();
            context.binding = Some(GlBoundShader {
                locations: None,
                program,
            });
            context.current_blend_signature = Some(blend);
            context.current_texture_realization = Some(GlTextureRealization {
                straight_alpha: true,
                texture,
            });
            context.unpack_premultiply_alpha = true;
        }
        push_gl_render_state(&mut state);

        // SAFETY: these mutations deliberately differ from every saved value.
        unsafe {
            gl.disable(glow::DEPTH_TEST);
            gl.depth_mask(true);
            gl.depth_func(glow::ALWAYS);
            gl.enable(glow::CULL_FACE);
            gl.cull_face(glow::FRONT);
            gl.front_face(glow::CCW);
            gl.disable(glow::STENCIL_TEST);
            gl.stencil_mask(0xff);
            gl.disable(glow::BLEND);
            gl.blend_func_separate(glow::ZERO, glow::ZERO, glow::ZERO, glow::ZERO);
            gl.blend_equation_separate(glow::FUNC_SUBTRACT, glow::FUNC_SUBTRACT);
            gl.color_mask(false, false, false, false);
            gl.clear_color(0.0, 0.0, 0.0, 0.0);
            gl.bind_vertex_array(None);
            gl.use_program(None);
            gl.bind_framebuffer(glow::FRAMEBUFFER, None);
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_2D, None);
            gl.disable(glow::SCISSOR_TEST);
            gl.scissor(0, 0, 1, 1);
            gl.viewport(0, 0, 1, 1);
        }
        {
            let mut runtime = state.gl_runtime.borrow_mut();
            runtime.current_framebuffer = None;
            runtime.current_scissor_rect = None;
            runtime.current_target = None;
            runtime.render_target_viewport = None;
        }
        {
            let mut context = state.context_state.runtime_state.borrow_mut();
            context.binding = None;
            context.current_blend_signature = None;
            context.current_texture_realization = None;
            context.unpack_premultiply_alpha = false;
        }

        pop_gl_render_state(&state);

        let physical = snapshot();
        assert!(physical.enabled.contains(&glow::DEPTH_TEST));
        assert!(!physical.enabled.contains(&glow::CULL_FACE));
        assert!(physical.enabled.contains(&glow::STENCIL_TEST));
        assert!(physical.enabled.contains(&glow::BLEND));
        assert!(physical.enabled.contains(&glow::SCISSOR_TEST));
        assert_eq!(physical.depth_mask, 0);
        assert_eq!(physical.integers[&glow::DEPTH_FUNC], glow::LEQUAL as i32);
        assert_eq!(physical.integers[&glow::CULL_FACE_MODE], glow::BACK as i32);
        assert_eq!(physical.integers[&glow::FRONT_FACE], glow::CW as i32);
        assert_eq!(physical.color_mask, [1, 0, 1, 0]);
        assert_eq!(physical.clear_color, [0.25, 0.5, 0.75, 1.0]);
        assert_eq!(physical.current_program, program.0.get() as i32);
        assert_eq!(physical.framebuffer, framebuffer.0.get() as i32);
        assert_eq!(physical.vertex_array, vertex_array.0.get() as i32);
        assert_eq!(physical.active_texture, glow::TEXTURE1);
        assert_eq!(
            physical.textures[&(glow::TEXTURE1, glow::TEXTURE_2D)],
            texture.0.get() as i32
        );
        assert_eq!(physical.scissor, [2, 3, 40, 50]);
        assert_eq!(physical.viewport, [4, 5, 320, 240]);
        let runtime = state.gl_runtime.borrow();
        assert_eq!(runtime.current_framebuffer, Some(framebuffer));
        assert_eq!(runtime.current_scissor_rect, Some(scissor));
        assert_eq!(runtime.current_target, Some(target));
        assert_eq!(runtime.render_target_viewport, Some(viewport));
        drop(runtime);
        let context = state.context_state.runtime_state.borrow();
        assert_eq!(
            context.binding,
            Some(GlBoundShader {
                locations: None,
                program,
            })
        );
        assert_eq!(context.current_blend_signature, Some(blend));
        assert_eq!(
            context.current_texture_realization,
            Some(GlTextureRealization {
                straight_alpha: true,
                texture,
            })
        );
        assert!(context.unpack_premultiply_alpha);
    }

    #[test]
    fn restores_two_sided_stencil_without_collapsing_the_back_face() {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: all stencil state is held by the local deterministic mock.
        unsafe {
            gl.stencil_op_separate(glow::FRONT, glow::KEEP, glow::KEEP, glow::REPLACE);
            gl.stencil_op_separate(glow::BACK, glow::INCR, glow::DECR, glow::INVERT);
            gl.stencil_func_separate(glow::FRONT, glow::LESS, 1, 0xf0);
            gl.stencil_func_separate(glow::BACK, glow::GREATER, 2, 0x0f);
            gl.stencil_mask_separate(glow::FRONT, 0xaa);
            gl.stencil_mask_separate(glow::BACK, 0x55);
        }
        push_gl_render_state(&mut state);
        // SAFETY: the symmetric Flight-like mutation is restored by the bracket.
        unsafe {
            gl.stencil_op(glow::KEEP, glow::KEEP, glow::INCR_WRAP);
            gl.stencil_func(glow::ALWAYS, 0, 0xff);
            gl.stencil_mask(0xff);
        }

        pop_gl_render_state(&state);

        let values = snapshot().integers;
        assert_eq!(values[&glow::STENCIL_FAIL], glow::KEEP as i32);
        assert_eq!(values[&glow::STENCIL_PASS_DEPTH_FAIL], glow::KEEP as i32);
        assert_eq!(values[&glow::STENCIL_PASS_DEPTH_PASS], glow::REPLACE as i32);
        assert_eq!(values[&glow::STENCIL_FUNC], glow::LESS as i32);
        assert_eq!(values[&glow::STENCIL_REF], 1);
        assert_eq!(values[&glow::STENCIL_VALUE_MASK], 0xf0);
        assert_eq!(values[&glow::STENCIL_WRITEMASK], 0xaa);
        assert_eq!(values[&glow::STENCIL_BACK_FAIL], glow::INCR as i32);
        assert_eq!(
            values[&glow::STENCIL_BACK_PASS_DEPTH_FAIL],
            glow::DECR as i32
        );
        assert_eq!(
            values[&glow::STENCIL_BACK_PASS_DEPTH_PASS],
            glow::INVERT as i32
        );
        assert_eq!(values[&glow::STENCIL_BACK_FUNC], glow::GREATER as i32);
        assert_eq!(values[&glow::STENCIL_BACK_REF], 2);
        assert_eq!(values[&glow::STENCIL_BACK_VALUE_MASK], 0x0f);
        assert_eq!(values[&glow::STENCIL_BACK_WRITEMASK], 0x55);
    }

    #[test]
    fn restores_colour_write_clear_colour_and_upload_premultiply_state() {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: fixed-function state is backed by the local mock.
        unsafe {
            gl.color_mask(true, false, true, false);
            gl.clear_color(0.25, 0.5, 0.75, 1.0);
        }
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .unpack_premultiply_alpha = false;
        push_gl_render_state(&mut state);
        // SAFETY: fixed-function state is backed by the local mock.
        unsafe {
            gl.color_mask(false, false, false, false);
            gl.clear_color(0.0, 0.0, 0.0, 0.0);
        }
        state
            .context_state
            .runtime_state
            .borrow_mut()
            .unpack_premultiply_alpha = true;

        pop_gl_render_state(&state);

        assert_eq!(snapshot().color_mask, [1, 0, 1, 0]);
        assert_eq!(snapshot().clear_color, [0.25, 0.5, 0.75, 1.0]);
        assert!(
            !state
                .context_state
                .runtime_state
                .borrow()
                .unpack_premultiply_alpha
        );
    }

    fn assert_texture_unit_restored(unit: u32) {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: texture names and bindings belong to the deterministic mock context.
        let texture = unsafe {
            let texture = gl.create_texture().unwrap();
            gl.active_texture(unit);
            gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            gl.active_texture(glow::TEXTURE1);
            texture
        };
        push_gl_render_state(&mut state);
        // SAFETY: this deliberately replaces the saved unit binding.
        unsafe {
            gl.active_texture(unit);
            gl.bind_texture(glow::TEXTURE_2D, None);
        }

        pop_gl_render_state(&state);

        let physical = snapshot();
        assert_eq!(physical.active_texture, glow::TEXTURE1);
        assert_eq!(
            physical.textures[&(unit, glow::TEXTURE_2D)],
            texture.0.get() as i32
        );
    }

    #[test]
    fn restores_a_non_active_texture_unit_binding() {
        assert_texture_unit_restored(glow::TEXTURE2);
    }

    #[test]
    fn restores_the_highest_texture_unit_used_by_the_3d_draw_path() {
        assert_texture_unit_restored(glow::TEXTURE0 + 13);
    }

    #[test]
    fn restores_nested_pushes_in_last_in_first_out_order() {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: viewport state belongs to the mock context.
        unsafe { gl.viewport(4, 5, 320, 240) };
        state.gl_runtime.borrow_mut().current_scissor_rect = Some(GlScissorRect {
            x: 2,
            y: 3,
            width: 40,
            height: 50,
        });
        push_gl_render_state(&mut state);
        // SAFETY: viewport state belongs to the mock context.
        unsafe { gl.viewport(8, 9, 640, 480) };
        state.gl_runtime.borrow_mut().current_scissor_rect = Some(GlScissorRect {
            x: 6,
            y: 7,
            width: 80,
            height: 90,
        });
        push_gl_render_state(&mut state);
        // SAFETY: viewport state belongs to the mock context.
        unsafe { gl.viewport(10, 11, 280, 200) };
        state.gl_runtime.borrow_mut().current_scissor_rect = None;

        pop_gl_render_state(&state);
        assert_eq!(snapshot().viewport, [8, 9, 640, 480]);
        assert_eq!(
            state.gl_runtime.borrow().current_scissor_rect,
            Some(GlScissorRect {
                x: 6,
                y: 7,
                width: 80,
                height: 90,
            })
        );
        pop_gl_render_state(&state);
        assert_eq!(snapshot().viewport, [4, 5, 320, 240]);
        assert_eq!(
            state.gl_runtime.borrow().current_scissor_rect,
            Some(GlScissorRect {
                x: 2,
                y: 3,
                width: 40,
                height: 50,
            })
        );
    }
}

mod push_gl_render_state {
    use super::*;

    #[test]
    fn flushes_pending_owner_draws_before_taking_the_snapshot() {
        FLUSH_COUNT.store(0, Ordering::SeqCst);
        let mut state = make_state();
        state.gl_runtime.borrow_mut().flush_pending_draws = Some(record_flush);

        push_gl_render_state(&mut state);

        assert_eq!(FLUSH_COUNT.load(Ordering::SeqCst), 1);
        assert_eq!(snapshot().active_texture, glow::TEXTURE0);
        pop_gl_render_state(&state);
    }
}

mod with_gl_render_state {
    use super::*;

    #[test]
    fn restores_state_in_finally_when_the_foreign_callback_panics() {
        let mut state = make_state();
        let gl = state.gl.clone();
        // SAFETY: viewport state belongs to the mock context.
        unsafe { gl.viewport(4, 5, 320, 240) };
        let result = catch_unwind(AssertUnwindSafe(|| {
            with_gl_render_state(&mut state, |state| {
                // SAFETY: viewport state belongs to the mock context.
                unsafe { state.gl.viewport(10, 11, 12, 13) };
                state.gl_runtime.borrow_mut().current_scissor_rect = Some(GlScissorRect {
                    x: 10,
                    y: 11,
                    width: 12,
                    height: 13,
                });
                panic!("foreign draw failed");
            });
        }));

        assert!(result.is_err());
        assert_eq!(snapshot().viewport, [4, 5, 320, 240]);
        assert_eq!(state.gl_runtime.borrow().current_scissor_rect, None);
    }
}
